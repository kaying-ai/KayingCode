import assert from "node:assert/strict";
import { test } from "vitest";
import {
  GAME_PLUGIN_INSTALLER_CATALOG,
  GAME_PLUGIN_INSTALLERS,
  type GamePluginInstaller,
} from "@zcode/shared";
import {
  buildGamePluginInstallerInstruction,
  filterGamePluginInstallers,
} from "../src/settings/gamePluginInstallers.js";

const base = GAME_PLUGIN_INSTALLERS[0];
if (!base) throw new Error("fixture requires a checked-in installer");

const unityUi = (name: string): GamePluginInstaller => ({
  ...base,
  source: { kind: "open-source", tier: "community", repositoryUrl: "https://example.com/ui" },
  name,
  displayName: { "zh-CN": `${name} 中文`, en: `${name} English` },
  description: { "zh-CN": `${name} 描述`, en: `${name} description` },
  engines: ["unity", "godot"],
  stages: ["development"],
});
const neutral = (name: string): GamePluginInstaller => ({
  ...base,
  source: { kind: "open-source", tier: "official", repositoryUrl: "https://example.com/art" },
  name,
  displayName: { "zh-CN": `${name} 中文`, en: `${name} English` },
  engines: [],
  stages: ["assets"],
});

const installers = [unityUi("unity-ui"), neutral("art-kit")];

test("installers follow engine, stage and search filters", () => {
  assert.deepEqual(
    filterGamePluginInstallers(installers, { engine: "all", stage: "all" }, "", "zh-CN")
      .map((installer) => installer.name)
      .sort(),
    ["art-kit", "unity-ui"],
  );
  assert.deepEqual(
    filterGamePluginInstallers(installers, { engine: "godot", stage: "assets" }, "", "zh-CN").map(
      (installer) => installer.name,
    ),
    ["art-kit"],
  );
  assert.equal(
    filterGamePluginInstallers(installers, { engine: "unity", stage: "development" }, "", "zh-CN")
      .length,
    1,
  );
  assert.equal(
    filterGamePluginInstallers(installers, { engine: "unreal", stage: "development" }, "", "zh-CN")
      .length,
    0,
  );
  assert.deepEqual(
    filterGamePluginInstallers(installers, { engine: "all", stage: "all" }, "art", "en-US").map(
      (installer) => installer.name,
    ),
    ["art-kit"],
  );
});

test("instruction points at the online catalog and the host install command", () => {
  const zh = buildGamePluginInstallerInstruction({
    installer: base,
    catalog: GAME_PLUGIN_INSTALLER_CATALOG,
    locale: "zh-CN",
  });
  assert.match(zh, new RegExp(base.name, "u"));
  assert.ok(zh.includes(GAME_PLUGIN_INSTALLER_CATALOG.url));
  assert.match(zh, /kayingcode plugins install --from/u);
  assert.match(zh, /无需再次询问/u);
  assert.match(zh, /不要注册 GitHub 等远程市场 URL/u);

  const en = buildGamePluginInstallerInstruction({
    installer: base,
    catalog: GAME_PLUGIN_INSTALLER_CATALOG,
    locale: "en-US",
  });
  assert.match(en, /kayingcode plugins install --from/u);
  assert.match(en, /do not ask again/u);
  assert.match(en, /do not register remote marketplace URLs/u);
});
