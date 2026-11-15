import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSettingServiceWithMigrations } from "../src/setting/settingService.js";
import { getDataBaseDir, setDataBaseDir } from "../src/paths.js";

let originalBaseDir: string;
let originalSettingsBaseDir: string | undefined;
let root = "";
let target = "";

beforeEach(async () => {
  originalBaseDir = getDataBaseDir();
  originalSettingsBaseDir = process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR;
  root = await mkdtemp(join(tmpdir(), "kayingcode-setting-key-share-"));
  target = join(root, "target");
  setDataBaseDir(root);
  process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR = join(root, "settings");
  await mkdir(join(root, ".kayingcode", "v2"), { recursive: true });
  await writeFile(join(root, ".kayingcode", "v2", "credentials.json"), "{}");
});

afterEach(async () => {
  setDataBaseDir(originalBaseDir);
  if (originalSettingsBaseDir === undefined) {
    delete process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR;
  } else {
    process.env.KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR = originalSettingsBaseDir;
  }
  await rm(root, { recursive: true, force: true });
});

describe("data root credential key sharing", () => {
  it("shares the system key before persisting the new data root", async () => {
    const calls: string[] = [];
    const { service } = createSettingServiceWithMigrations({
      shareCredentialKeyWithDataRoot: async (targetBaseDir) => {
        calls.push(targetBaseDir);
      },
    });

    await service.updateDataBaseDir(target);
    expect(calls).toEqual([target]);
    expect((await service.get()).dataBaseDir).toBe(target);
  });

  it("aborts the switch when key sharing fails", async () => {
    const { service } = createSettingServiceWithMigrations({
      shareCredentialKeyWithDataRoot: async () => {
        throw new Error("keyring unavailable");
      },
    });

    await expect(service.updateDataBaseDir(target)).rejects.toThrow("keyring unavailable");
    expect((await service.get()).dataBaseDir).not.toBe(target);
  });
});
