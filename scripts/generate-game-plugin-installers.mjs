import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";

/**
 * 生成游戏开发专区的可安装占位契约。
 * 唯一登记源是 config/game-plugin-installers.json；运行时只消费生成后的只读数组。
 * 规则见 packages/shared/spec/game-plugin-installers.md。
 */

const ENGINES = new Set([
  "taptap-maker",
  "unreal",
  "unity",
  "tuanji",
  "godot",
  "threejs",
  "cocos-creator",
]);
const STAGES = new Set([
  "discovery",
  "development",
  "assets",
  "testing",
  "advertising",
  "publishing",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isRecord(value)) throw new Error(`${label}: expected an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label}: expected keys [${wanted.join(", ")}], got [${actual.join(", ")}]`);
  }
}

function assertSafeHttpsUrl(value, label, { json = false } = {}) {
  if (typeof value !== "string") throw new Error(`${label}: expected a string`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}: invalid url`);
  }
  if (url.protocol !== "https:") throw new Error(`${label}: https required`);
  if (url.username || url.password) throw new Error(`${label}: credentials not allowed`);
  if (url.port) throw new Error(`${label}: port not allowed`);
  if (url.search) throw new Error(`${label}: query not allowed`);
  if (url.hash) throw new Error(`${label}: hash not allowed`);
  if (json && !url.pathname.endsWith(".json")) throw new Error(`${label}: json url required`);
}

function assertName(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new Error(`${label}: invalid name`);
  }
}

function assertLocalizedText(value, label) {
  assertExactKeys(value, ["zh-CN", "en"], label);
  for (const locale of ["zh-CN", "en"]) {
    if (typeof value[locale] !== "string" || !value[locale].trim()) {
      throw new Error(`${label}.${locale}: non-empty string required`);
    }
  }
}

function validateInstaller(installer, index) {
  const label = `installers[${index}]`;
  assertExactKeys(
    installer,
    [
      "name",
      "version",
      "host",
      "displayName",
      "description",
      "engines",
      "stages",
      "source",
      "addedAt",
    ],
    label,
  );
  assertName(installer.name, `${label}.name`);
  if (typeof installer.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(installer.version)) {
    throw new Error(`${label}.version: expected semver x.y.z`);
  }
  if (installer.host !== "kayingcode")
    throw new Error(`${label}.host: only kayingcode is supported`);
  assertLocalizedText(installer.displayName, `${label}.displayName`);
  assertLocalizedText(installer.description, `${label}.description`);
  if (!Array.isArray(installer.engines)) throw new Error(`${label}.engines: expected an array`);
  for (const engine of installer.engines) {
    if (!ENGINES.has(engine)) throw new Error(`${label}.engines: unknown engine ${String(engine)}`);
  }
  if (!Array.isArray(installer.stages) || installer.stages.length === 0) {
    throw new Error(`${label}.stages: non-empty array required`);
  }
  for (const stage of installer.stages) {
    if (!STAGES.has(stage)) throw new Error(`${label}.stages: unknown stage ${String(stage)}`);
  }
  if (!isRecord(installer.source)) throw new Error(`${label}.source: expected an object`);
  if (installer.source.kind === "open-source") {
    assertExactKeys(installer.source, ["kind", "tier", "repositoryUrl"], `${label}.source`);
    if (installer.source.tier !== "official" && installer.source.tier !== "community") {
      throw new Error(`${label}.source.tier: expected official or community`);
    }
    assertSafeHttpsUrl(installer.source.repositoryUrl, `${label}.source.repositoryUrl`);
  } else if (installer.source.kind === "closed-source") {
    assertExactKeys(installer.source, ["kind"], `${label}.source`);
  } else {
    throw new Error(`${label}.source.kind: expected open-source or closed-source`);
  }
  if (typeof installer.addedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(installer.addedAt)) {
    throw new Error(`${label}.addedAt: expected yyyy-mm-dd`);
  }
}

export function validateGamePluginInstallerConfig(configuration) {
  assertExactKeys(configuration, ["schemaVersion", "catalog", "installers"], "config");
  if (configuration.schemaVersion !== 1) throw new Error("config.schemaVersion: expected 1");
  assertExactKeys(configuration.catalog, ["name", "url", "repositoryUrl"], "catalog");
  assertName(configuration.catalog.name, "catalog.name");
  assertSafeHttpsUrl(configuration.catalog.url, "catalog.url", { json: true });
  assertSafeHttpsUrl(configuration.catalog.repositoryUrl, "catalog.repositoryUrl");
  if (!Array.isArray(configuration.installers)) {
    throw new Error("config.installers: expected an array");
  }
  const names = new Set();
  configuration.installers.forEach((installer, index) => {
    validateInstaller(installer, index);
    if (names.has(installer.name)) {
      throw new Error(`installers[${index}].name: duplicate ${installer.name}`);
    }
    names.add(installer.name);
  });
  return configuration;
}

export async function loadGamePluginInstallerConfig(root) {
  const configuration = JSON.parse(
    await readFile(resolve(root, "config/game-plugin-installers.json"), "utf8"),
  );
  return validateGamePluginInstallerConfig(configuration);
}

async function updateGeneratedFile(path, text, { check, staleMessage }) {
  const existing = await readFile(path, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing !== null && existing.replace(/\r\n/g, "\n") === text) return;
  if (check) throw new Error(staleMessage);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

export async function generateGamePluginInstallers(root, { check = false } = {}) {
  const configuration = await loadGamePluginInstallerConfig(root);
  const source = `// Generated by scripts/generate-game-plugin-installers.mjs. Do not edit.
import type {
  GamePluginInstaller,
  GamePluginInstallerCatalogInfo,
} from "./game-plugin-installers.js";

export const GAME_PLUGIN_INSTALLER_CATALOG: GamePluginInstallerCatalogInfo = ${JSON.stringify(configuration.catalog, null, 2)};

export const GAME_PLUGIN_INSTALLERS: readonly GamePluginInstaller[] = ${JSON.stringify(configuration.installers, null, 2)};
`;
  const formatting = await readFile(resolve(root, ".oxfmtrc.json"), "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return {};
      throw error;
    });
  const formatted = await format("game-plugin-installers.generated.ts", source, formatting);
  if (formatted.errors.length) {
    throw new Error("Unable to format generated game plugin installers");
  }
  const text = formatted.code.replace(/\r\n/g, "\n");
  const path = resolve(root, "packages/shared/src/game-plugin-installers.generated.ts");
  await updateGeneratedFile(path, text, {
    check,
    staleMessage: "Game plugin installer contracts are stale; run pnpm run source:plugins",
  });
  return configuration;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const configuration = await generateGamePluginInstallers(root, {
    check: process.argv.includes("--check"),
  });
  process.stdout.write(
    `game plugin installers: OK (${configuration.installers.length} placeholder entries)\n`,
  );
}
