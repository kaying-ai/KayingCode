//! TapTap lifecycle validation for modular project entries.

use serde_json::{Value, json};
use std::fs;
use std::path::Path;

/// Verify that a modular entry uses the TapTap Start/Stop event lifecycle.
pub fn check_lifecycle_contract(root: &Path) -> Value {
    let file = "scripts/main.lua";
    let content = fs::read_to_string(root.join(file)).unwrap_or_default();
    let has_start = content.contains("function Start(");
    let has_stop = content.contains("function Stop(");
    let has_update_subscription = content.contains("SubscribeToEvent(\"Update\"")
        || content.contains("SubscribeToEvent('Update'");
    let has_legacy_lifecycle = content.contains("function init(")
        || content.contains("function update(")
        || content.contains("function exit(");
    let valid = has_start && has_stop && has_update_subscription && !has_legacy_lifecycle;

    json!({
        "name": "taptap_lifecycle",
        "valid": valid,
        "severity": "Error",
        "message": if valid {
            "TapTap Start/Stop and Update event lifecycle found"
        } else {
            "scripts/main.lua must define Start/Stop, subscribe to Update, and must not use init/update/exit"
        },
        "file": file
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_legacy_lifecycle() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("scripts")).unwrap();
        fs::write(
            temp.path().join("scripts/main.lua"),
            "function init() end\n",
        )
        .unwrap();
        assert_eq!(check_lifecycle_contract(temp.path())["valid"], false);
    }

    #[test]
    fn rejects_update_subscription_that_only_exists_in_legacy_code() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("scripts/legacy")).unwrap();
        fs::write(
            temp.path().join("scripts/main.lua"),
            "function Start() end\nfunction Stop() end\n",
        )
        .unwrap();
        fs::write(
            temp.path().join("scripts/legacy/main.lua"),
            "SubscribeToEvent(\"Update\", \"HandleUpdate\")\n",
        )
        .unwrap();
        assert_eq!(check_lifecycle_contract(temp.path())["valid"], false);
    }
}
