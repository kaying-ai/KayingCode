//! Agent flow regression test — simulates the end-to-end Agent workflow:
//!
//! 1. `project.init template=modular` → verify modular structure generated
//! 2. `project.validate` → verify structure is compliant
//! 3. `ui.create_button` describe → verify spec exists in catalog
//! 4. `ui.create_button` prepare → verify effect plan
//! 5. `ui.create_button` execute → verify Lua widget file generated
//! 6. `debug.export_diagnostics` → verify diagnostics snapshot exported
//!
//! This locks the Agent workflow contract described in dev3.plan.md §7.2.

use kaying_for_taptap_core::model::{EngineProvider, OperationRequest, ProviderContext};
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn has_write_project(effects: &[kaying_for_taptap_core::model::Effect]) -> bool {
    effects
        .iter()
        .any(|e| matches!(e, kaying_for_taptap_core::model::Effect::WriteProject))
}

fn request(op: &str, root: &str, extra: serde_json::Value) -> OperationRequest {
    let mut args = json!({ "project_root": root });
    if let serde_json::Value::Object(map) = extra {
        if let serde_json::Value::Object(target) = &mut args {
            for (k, v) in map {
                target.insert(k, v);
            }
        }
    }
    OperationRequest {
        request_id: format!("flow-{op}"),
        provider_id: "taptap".to_string(),
        operation_id: op.to_string(),
        project_root: None,
        arguments: args,
        timeout_ms: None,
        dry_run: false,
        plan_id: None,
        effect_digest: None,
    }
}

#[test]
fn agent_flow_modular_init_then_create_button_then_validate() {
    let provider = TapTapProvider::new();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().to_string_lossy().to_string();

    // --- Step 1: project.init template=modular ---
    let init_req = request(
        "project.init",
        &root,
        json!({
            "template": "modular",
            "project_name": "demo-modular",
            "engine_version": "1.0.0",
        }),
    );
    let plan = provider.prepare(&init_req).expect("prepare project.init");
    let res = provider.execute(&init_req).expect("execute project.init");
    assert!(res.success, "project.init failed: {:?}", res.output);
    assert!(!plan.plan_id.is_empty());

    // Verify modular structure was generated.
    assert!(
        temp.path().join("scripts/main.lua").exists(),
        "main.lua missing"
    );
    assert!(
        temp.path().join("scripts/bootstrap.lua").exists(),
        "bootstrap.lua missing"
    );
    assert!(temp.path().join("AGENTS.md").exists(), "AGENTS.md missing");
    assert!(
        temp.path().join("scripts/ui/init.lua").exists(),
        "ui/init.lua missing"
    );
    assert!(
        temp.path().join("scripts/systems/init.lua").exists(),
        "systems/init missing"
    );
    assert!(
        temp.path().join("scripts/gameplay/init.lua").exists(),
        "gameplay/init missing"
    );
    assert!(
        temp.path().join("scripts/data/init.lua").exists(),
        "data/init missing"
    );
    assert!(
        temp.path().join(".project/modules.json").exists(),
        "modules.json missing"
    );

    // --- Step 2: project.validate ---
    let validate_req = request("project.validate", &root, json!({}));
    let _ = provider
        .prepare(&validate_req)
        .expect("prepare project.validate");
    let res = provider
        .execute(&validate_req)
        .expect("execute project.validate");
    assert!(res.success, "project.validate failed: {:?}", res.output);
    // Fresh modular project should validate clean (no errors).
    let checks = res.output["checks"].as_array().expect("checks array");
    let errors: Vec<_> = checks
        .iter()
        .filter(|c| c["severity"].as_str() == Some("error"))
        .collect();
    assert!(
        errors.is_empty(),
        "fresh modular project has errors: {errors:?}"
    );

    // --- Step 3: describe ui.create_button (verify spec in catalog) ---
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let button_spec = catalog
        .iter()
        .find(|s| s.id == "ui.create_button")
        .expect("ui.create_button not in catalog");
    assert_eq!(button_spec.domain, "ui");
    assert!(has_write_project(&button_spec.effects));

    // --- Step 4: prepare ui.create_button ---
    let button_req = request(
        "ui.create_button",
        &root,
        json!({ "name": "start_btn", "label": "Start" }),
    );
    let plan = provider
        .prepare(&button_req)
        .expect("prepare ui.create_button");
    assert!(!plan.plan_id.is_empty());
    assert!(has_write_project(&plan.effects));

    // --- Step 5: execute ui.create_button ---
    let res = provider
        .execute(&button_req)
        .expect("execute ui.create_button");
    assert!(res.success, "ui.create_button failed: {:?}", res.output);
    assert!(res.output["created"].as_bool().unwrap_or(false));
    let generated_path = res.output["path"].as_str().expect("path in output");
    assert!(
        std::path::Path::new(generated_path).exists(),
        "generated widget file missing: {generated_path}"
    );

    // --- Step 6: debug.export_diagnostics ---
    let diag_req = request("debug.export_diagnostics", &root, json!({}));
    let _ = provider
        .prepare(&diag_req)
        .expect("prepare debug.export_diagnostics");
    let res = provider
        .execute(&diag_req)
        .expect("execute debug.export_diagnostics");
    assert!(
        res.success,
        "debug.export_diagnostics failed: {:?}",
        res.output
    );
    assert!(res.output["exported"].as_bool().unwrap_or(false));
    let diag_path = res.output["path"].as_str().expect("diagnostics path");
    assert!(
        std::path::Path::new(diag_path).exists(),
        "diagnostics snapshot missing"
    );
    // At least the ui button + main.lua should be counted as Lua files.
    assert!(res.output["lua_files"].as_u64().unwrap_or(0) >= 2);
}

#[test]
fn agent_flow_animation_clip_lifecycle() {
    let provider = TapTapProvider::new();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().to_string_lossy().to_string();

    // Init modular project first.
    let init_req = request(
        "project.init",
        &root,
        json!({ "template": "modular", "project_name": "anim-demo" }),
    );
    provider.execute(&init_req).expect("init");

    // Create an animation clip.
    let req = request(
        "animation.create_clip",
        &root,
        json!({ "name": "idle", "duration": 1.5, "loop": "loop" }),
    );
    let res = provider
        .execute(&req)
        .expect("execute animation.create_clip");
    assert!(res.success);
    assert!(res.output["created"].as_bool().unwrap_or(false));

    // Read it back.
    let req = request("animation.get_clip", &root, json!({ "name": "idle" }));
    let res = provider.execute(&req).expect("execute animation.get_clip");
    assert!(res.success);
    assert_eq!(res.output["clip"]["duration"].as_f64().unwrap_or(0.0), 1.5);
}

#[test]
fn agent_flow_data_save_schema_and_locale() {
    let provider = TapTapProvider::new();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().to_string_lossy().to_string();

    let init_req = request(
        "project.init",
        &root,
        json!({ "template": "modular", "project_name": "data-demo" }),
    );
    provider.execute(&init_req).expect("init");

    // Create a save schema.
    let req = request(
        "data.create_save_schema",
        &root,
        json!({
            "name": "player",
            "fields": [
                {"name": "hp", "type": "number", "required": true},
                {"name": "level", "type": "number", "required": true},
                {"name": "inventory", "type": "table", "required": false}
            ]
        }),
    );
    let res = provider
        .execute(&req)
        .expect("execute data.create_save_schema");
    assert!(res.success);
    assert!(res.output["created"].as_bool().unwrap_or(false));
    assert_eq!(res.output["fields"].as_u64().unwrap_or(0), 3);

    // Set locale.
    let req = request("data.set_locale", &root, json!({ "locale": "zh-CN" }));
    let res = provider.execute(&req).expect("execute data.set_locale");
    assert!(res.success);

    // Read locale back.
    let req = request("data.get_locale", &root, json!({}));
    let res = provider.execute(&req).expect("execute data.get_locale");
    assert!(res.success);
    assert_eq!(res.output["locale"].as_str().unwrap_or(""), "zh-CN");
}

/// Agent refactor workflow: validate → analyze → rename → extract → split →
/// move → validate. Locks the Stage F refactor capability as an end-to-end
/// Agent-usable flow described in dev3.plan.md §Stage F.
#[test]
fn agent_flow_refactor_lifecycle_validate_rename_extract_split_move() {
    let provider = TapTapProvider::new();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().to_string_lossy().to_string();

    // --- Step 1: project.init template=modular ---
    let init_req = request(
        "project.init",
        &root,
        json!({
            "template": "modular",
            "project_name": "refactor-demo",
            "engine_version": "1.0.0",
        }),
    );
    let res = provider.execute(&init_req).expect("execute project.init");
    assert!(res.success, "project.init failed: {:?}", res.output);

    // --- Step 2: write a combat module under scripts/systems/ ---
    let combat_path = temp
        .path()
        .join("scripts")
        .join("systems")
        .join("combat.lua");
    std::fs::write(
        &combat_path,
        "local M = {}\n\
         local BASE_DAMAGE = 10\n\
         \n\
         function M.attack(target)\n\
             local damage = BASE_DAMAGE\n\
             target.hp = target.hp - damage\n\
             return damage\n\
         end\n\
         \n\
         function M.reset(target)\n\
             target.hp = 100\n\
         end\n\
         \n\
         return M\n",
    )
    .unwrap();

    // --- Step 3: project.validate (clean before refactor) ---
    let validate_req = request("project.validate", &root, json!({}));
    let res = provider
        .execute(&validate_req)
        .expect("execute project.validate (pre)");
    assert!(
        res.success,
        "pre-refactor validate failed: {:?}",
        res.output
    );
    let checks = res.output["checks"].as_array().expect("checks array");
    let errors: Vec<_> = checks
        .iter()
        .filter(|c| c["severity"].as_str() == Some("error"))
        .collect();
    assert!(
        errors.is_empty(),
        "pre-refactor project has errors: {errors:?}"
    );

    // --- Step 4: refactor.analyze (verify functions + locals discovered) ---
    let analyze_req = request(
        "refactor.analyze",
        &root,
        json!({ "path": "scripts/systems/combat.lua" }),
    );
    let res = provider
        .execute(&analyze_req)
        .expect("execute refactor.analyze");
    assert!(res.success, "refactor.analyze failed: {:?}", res.output);
    assert!(res.output["analyzed"].as_bool().unwrap_or(false));
    let funcs = res.output["functions"].as_array().expect("functions array");
    assert_eq!(funcs.len(), 2, "expected 2 functions, got {funcs:?}");
    let func_names: Vec<&str> = funcs
        .iter()
        .map(|f| f["name"].as_str().unwrap_or(""))
        .collect();
    assert!(
        func_names.contains(&"attack"),
        "missing attack: {func_names:?}"
    );
    assert!(
        func_names.contains(&"reset"),
        "missing reset: {func_names:?}"
    );
    let locals = res.output["locals"].as_array().expect("locals array");
    // combat.lua declares: local M, local BASE_DAMAGE, local damage (inside attack).
    assert_eq!(locals.len(), 3, "expected 3 locals, got {locals:?}");
    let local_names: Vec<&str> = locals
        .iter()
        .map(|l| l["name"].as_str().unwrap_or(""))
        .collect();
    assert!(
        local_names.contains(&"BASE_DAMAGE"),
        "BASE_DAMAGE not in locals: {local_names:?}"
    );

    // --- Step 5: refactor.rename_symbol attack -> deal_damage (scope=project) ---
    let rename_req = request(
        "refactor.rename_symbol",
        &root,
        json!({
            "path": "scripts/systems/combat.lua",
            "old_name": "attack",
            "new_name": "deal_damage",
            "scope": "project"
        }),
    );
    let res = provider
        .execute(&rename_req)
        .expect("execute refactor.rename_symbol");
    assert!(
        res.success,
        "refactor.rename_symbol failed: {:?}",
        res.output
    );
    assert!(res.output["renamed"].as_bool().unwrap_or(false));
    assert!(
        res.output["definition_renamed"].as_bool().unwrap_or(false),
        "definition should be renamed"
    );
    let body = std::fs::read_to_string(&combat_path).unwrap();
    assert!(
        body.contains("function M.deal_damage(target)"),
        "definition not renamed: {body}"
    );
    assert!(
        !body.contains("M.attack("),
        "old name still referenced: {body}"
    );

    // --- Step 6: refactor.extract_function (extract damage computation) ---
    // After rename, the body is:
    //   line 1: local M = {}
    //   line 2: local BASE_DAMAGE = 10
    //   line 3: (blank)
    //   line 4: function M.deal_damage(target)
    //   line 5:     local damage = BASE_DAMAGE
    //   line 6:     target.hp = target.hp - damage
    //   line 7:     return damage
    //   line 8: end
    // Extract lines 5-7 into a helper `compute_damage`.
    let extract_req = request(
        "refactor.extract_function",
        &root,
        json!({
            "path": "scripts/systems/combat.lua",
            "name": "compute_damage",
            "start_line": 5,
            "end_line": 7,
            "params": "target"
        }),
    );
    let res = provider
        .execute(&extract_req)
        .expect("execute refactor.extract_function");
    assert!(
        res.success,
        "refactor.extract_function failed: {:?}",
        res.output
    );
    assert!(res.output["extracted"].as_bool().unwrap_or(false));
    assert_eq!(
        res.output["call"].as_str().unwrap_or(""),
        "compute_damage(target)"
    );
    let body = std::fs::read_to_string(&combat_path).unwrap();
    assert!(
        body.contains("function compute_damage(target)"),
        "extracted function missing: {body}"
    );

    // --- Step 7: refactor.split_file (extract compute_damage into lib/) ---
    // Find the line range of the extracted function in the updated body.
    let updated_body = std::fs::read_to_string(&combat_path).unwrap();
    let lines: Vec<&str> = updated_body.lines().collect();
    let mut start = 0usize;
    let mut end = 0usize;
    for (i, line) in lines.iter().enumerate() {
        if line.contains("function compute_damage(target)") {
            start = i + 1;
        }
        if start > 0 && line.trim() == "end" && end < start {
            end = i + 1;
        }
    }
    assert!(
        start > 0 && end > start,
        "could not locate compute_damage range"
    );

    let split_req = request(
        "refactor.split_file",
        &root,
        json!({
            "path": "scripts/systems/combat.lua",
            "target_path": "lib/compute_damage.lua",
            "start_line": start,
            "end_line": end,
            "module_name": "compute_damage"
        }),
    );
    let res = provider
        .execute(&split_req)
        .expect("execute refactor.split_file");
    assert!(res.success, "refactor.split_file failed: {:?}", res.output);
    assert!(res.output["split"].as_bool().unwrap_or(false));
    assert_eq!(
        res.output["require_path"].as_str().unwrap_or(""),
        "scripts.lib.compute_damage"
    );

    let extracted_path = temp
        .path()
        .join("scripts")
        .join("lib")
        .join("compute_damage.lua");
    assert!(extracted_path.exists(), "extracted module file missing");
    let extracted = std::fs::read_to_string(&extracted_path).unwrap();
    assert!(
        extracted.contains("local compute_damage = {}"),
        "module table missing: {extracted}"
    );
    assert!(
        extracted.contains("return compute_damage"),
        "module return missing: {extracted}"
    );

    let source = std::fs::read_to_string(&combat_path).unwrap();
    assert!(
        source.contains("local compute_damage = require \"scripts.lib.compute_damage\""),
        "require not injected: {source}"
    );

    // --- Step 8: refactor.move_module (relocate lib/compute_damage.lua -> lib/damage/calc.lua) ---
    let move_req = request(
        "refactor.move_module",
        &root,
        json!({
            "old_path": "lib/compute_damage.lua",
            "new_path": "lib/damage/calc.lua"
        }),
    );
    let res = provider
        .execute(&move_req)
        .expect("execute refactor.move_module");
    assert!(res.success, "refactor.move_module failed: {:?}", res.output);
    assert!(res.output["moved"].as_bool().unwrap_or(false));
    assert_eq!(
        res.output["old_require"].as_str().unwrap_or(""),
        "scripts.lib.compute_damage"
    );
    assert_eq!(
        res.output["new_require"].as_str().unwrap_or(""),
        "scripts.lib.damage.calc"
    );
    assert!(
        res.output["files_updated"].as_u64().unwrap_or(0) >= 1,
        "requires should be rewritten in at least one file"
    );

    let old_path = temp
        .path()
        .join("scripts")
        .join("lib")
        .join("compute_damage.lua");
    let new_path = temp
        .path()
        .join("scripts")
        .join("lib")
        .join("damage")
        .join("calc.lua");
    assert!(!old_path.exists(), "old module file should be moved away");
    assert!(new_path.exists(), "new module file missing");

    let source = std::fs::read_to_string(&combat_path).unwrap();
    assert!(
        source.contains("require \"scripts.lib.damage.calc\""),
        "require not updated after move: {source}"
    );
    assert!(
        !source.contains("scripts.lib.compute_damage"),
        "old require path still present: {source}"
    );

    // --- Step 9: project.validate (clean after refactor) ---
    let validate_req = request("project.validate", &root, json!({}));
    let res = provider
        .execute(&validate_req)
        .expect("execute project.validate (post)");
    assert!(
        res.success,
        "post-refactor validate failed: {:?}",
        res.output
    );
    let checks = res.output["checks"].as_array().expect("checks array");
    let errors: Vec<_> = checks
        .iter()
        .filter(|c| c["severity"].as_str() == Some("error"))
        .collect();
    assert!(
        errors.is_empty(),
        "post-refactor project has errors: {errors:?}"
    );
}
