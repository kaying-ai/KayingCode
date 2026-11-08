import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { resolveDesktopDataPaths } from "./desktopDataPaths.js";

test("packaged production and Preview have separate data and settings roots", () => {
  const homeDir = "/tmp/kaying-release-home";
  const production = resolveDesktopDataPaths({
    homeDir,
    isPackaged: true,
    flavor: "production",
  });
  const preview = resolveDesktopDataPaths({
    homeDir,
    isPackaged: true,
    flavor: "preview",
  });

  assert.equal(production.dataBaseDir, join(homeDir, ".kayingcode-agent-code"));
  assert.equal(preview.dataBaseDir, join(homeDir, ".kayingcode-agent-code-preview"));
  assert.equal(
    production.settingsFile,
    join(production.dataBaseDir, ".kayingcode/v2/setting.json"),
  );
  assert.equal(preview.settingsFile, join(preview.dataBaseDir, ".kayingcode/v2/setting.json"));
  assert.equal(production.electronDataDirectoryName, "KayingCode Agent Code");
  assert.equal(preview.electronDataDirectoryName, "KayingCode Agent Code Preview");
  assert.notEqual(production.settingsFile, join(homeDir, ".kayingcode/v2/setting.json"));
});

test("development and explicit test home keep their own roots", () => {
  const development = resolveDesktopDataPaths({
    homeDir: "/tmp/development-home",
    isPackaged: false,
    flavor: "production",
  });
  assert.equal(development.dataBaseDir, "/tmp/development-home");
  assert.equal(development.electronDataDirectoryName, "KayingCode Dev");

  const isolated = resolveDesktopDataPaths({
    homeDir: "/Users/example",
    desktopHomeDir: "/tmp/isolated-test-home",
    isPackaged: true,
    flavor: "production",
    explicitDataBaseDir: "/tmp/custom-runtime-data",
  });
  assert.equal(isolated.dataBaseDir, "/tmp/custom-runtime-data");
  assert.equal(
    isolated.settingsFile,
    join("/tmp/isolated-test-home", ".kayingcode-agent-code", ".kayingcode", "v2", "setting.json"),
  );
});
