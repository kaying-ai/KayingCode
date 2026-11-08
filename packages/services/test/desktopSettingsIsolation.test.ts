import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { createSettingService } from "../src/setting/settingService.js";
import { getAppConfigDir, setDataBaseDir } from "../src/paths.js";

test("Desktop settings stay in the new identity root when runtime data is customized", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-desktop-settings-"));
  const settingsBaseDir = join(root, "new-desktop-identity");
  const customRuntimeBaseDir = join(root, "custom-runtime");
  const previousSettingsBaseDir = process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR;
  process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR = settingsBaseDir;
  setDataBaseDir(customRuntimeBaseDir);

  try {
    const service = createSettingService();
    await service.update({ closeToTrayOnWindows: false });
    const settings = JSON.parse(
      await readFile(join(settingsBaseDir, ".kayingcode", "v2", "setting.json"), "utf8"),
    ) as { closeToTrayOnWindows?: boolean };
    assert.equal(settings.closeToTrayOnWindows, false);
    assert.equal(getAppConfigDir(), join(customRuntimeBaseDir, ".kayingcode", "v2"));
  } finally {
    setDataBaseDir(null);
    if (previousSettingsBaseDir === undefined) {
      delete process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR;
    } else {
      process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR = previousSettingsBaseDir;
    }
    await rm(root, { recursive: true, force: true });
  }
});
