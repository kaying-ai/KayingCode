use super::*;
use tempfile::tempdir;

#[test]
fn test_run_modular_checks_clean_project() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    super::super::project_scaffold::generate_modular_scaffold(root, "clean", "1.0.0", "taptap")
        .unwrap();

    let checks = run_modular_checks(root);
    let errors: Vec<&Value> = checks
        .iter()
        .filter(|c| c["severity"] == "Error" && c["valid"] == false)
        .collect();
    assert!(
        errors.is_empty(),
        "Clean project should have no Error checks: {:?}",
        errors
    );
}

#[test]
fn test_check_module_init_exists_detects_missing() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("scripts/ui")).unwrap();
    let result = check_module_init_exists(root);
    assert_eq!(result["valid"], false);
    assert_eq!(result["severity"], "Error");
    assert!(result["message"].as_str().unwrap().contains("ui"));
}

#[test]
fn test_check_bootstrap_exists_detects_missing() {
    let temp = tempdir().unwrap();
    let result = check_bootstrap_exists(temp.path());
    assert_eq!(result["valid"], false);
    assert_eq!(result["severity"], "Error");
}

#[test]
fn test_check_main_lua_size_flags_bloat() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("scripts")).unwrap();
    let bloated = "x\n".repeat(60);
    fs::write(root.join("scripts/main.lua"), bloated).unwrap();

    let result = check_main_lua_size(root);
    assert_eq!(result["valid"], false);
    assert!(result["lines"] == 60);
}

#[test]
fn test_check_single_file_bloat_detects_large_file() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("scripts/gameplay")).unwrap();
    let bloated = "x\n".repeat(600);
    fs::write(root.join("scripts/gameplay/big.lua"), bloated).unwrap();

    let result = check_single_file_bloat(root);
    assert_eq!(result["valid"], false);
    assert!(result["bloated_files"].as_array().unwrap().len() > 0);
}

#[test]
fn test_check_single_file_bloat_allows_500_lines() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("scripts/gameplay")).unwrap();
    let content = "x\n".repeat(500);
    fs::write(root.join("scripts/gameplay/limit.lua"), content).unwrap();

    let result = check_single_file_bloat(root);
    assert_eq!(result["valid"], true);
    assert!(result["bloated_files"].as_array().unwrap().is_empty());
}

#[test]
fn test_check_cross_layer_violation_detects_ui_require_gameplay() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("scripts/ui")).unwrap();
    fs::write(
        root.join("scripts/ui/main_menu.lua"),
        "local Player = require \"scripts.gameplay.player\"",
    )
    .unwrap();

    let result = check_cross_layer_violation(root);
    assert_eq!(result["valid"], false);
    assert!(result["message"].as_str().unwrap().contains("event bus"));
}

#[test]
fn test_has_errors_detects_error_severity() {
    let checks = vec![
        json!({"name": "a", "valid": true, "severity": "Warning"}),
        json!({"name": "b", "valid": false, "severity": "Error"}),
    ];
    assert!(has_errors(&checks));
}

#[test]
fn test_has_errors_false_when_only_warnings() {
    let checks = vec![
        json!({"name": "a", "valid": true, "severity": "Warning"}),
        json!({"name": "b", "valid": false, "severity": "Warning"}),
    ];
    assert!(!has_errors(&checks));
}

#[test]
fn test_extract_requires_parses_quoted_module() {
    let temp = tempdir().unwrap();
    let path = temp.path().join("test.lua");
    fs::write(
        &path,
        "local Foo = require \"scripts.lib.foo\"\nlocal Bar = require 'scripts.lib.bar'\n",
    )
    .unwrap();
    let reqs = extract_requires(&path);
    assert_eq!(reqs.len(), 2);
    assert!(reqs.contains(&"scripts.lib.foo".to_string()));
    assert!(reqs.contains(&"scripts.lib.bar".to_string()));
}
