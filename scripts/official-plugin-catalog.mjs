import { access, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

export function normalizePluginTarget(target = `${process.platform}-${process.arch}`) {
  const match = /^(win32|win|windows|darwin|linux)-(x64|arm64)$/.exec(target);
  if (!match) throw new Error(`Unsupported official plugin target: ${target}`);
  const platform = ["win", "windows"].includes(match[1]) ? "win32" : match[1];
  return {
    platform,
    platformKey: `${platform}-${match[2]}`,
    executableSuffix: platform === "win32" ? ".exe" : "",
  };
}

function safePath(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.includes(":") ||
    posix.isAbsolute(value) ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${label}: expected a confined repository-relative path`);
  }
  return value;
}

async function requirePath(root, path, label) {
  try {
    await access(join(root, path));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(`${label}: missing ${path}`);
  }
}

/** 构建工具读取唯一发行清单；运行时只消费生成后的 contracts 数据，不访问仓库配置。 */
export async function loadOfficialPluginCatalog(root, { target, requireRuntime = false } = {}) {
  const configuration = JSON.parse(
    await readFile(join(root, "config/official-plugins.json"), "utf8"),
  );
  if (
    configuration.schemaVersion !== 1 ||
    configuration.marketplace !== "kayingcode-plugins-official" ||
    !Array.isArray(configuration.plugins)
  ) {
    throw new Error("Invalid official plugin catalog schema/marketplace");
  }
  const targetParts = normalizePluginTarget(target);
  const names = new Set(),
    sources = new Set(),
    destinations = new Set();
  const plugins = [];
  for (const record of configuration.plugins) {
    const { name, sourceRoot, stagedPath } = record;
    safePath(sourceRoot, `${name} sourceRoot`);
    safePath(stagedPath, `${name} stagedPath`);
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(name) ||
      !/^(plugins|packages|apps\/zcode-cli\/packages)\/[^/]+$/.test(sourceRoot) ||
      !/^packages\/[^/]+$/.test(stagedPath)
    )
      throw new Error(`Invalid official plugin identity/root: ${name}`);
    if (names.has(name) || sources.has(sourceRoot) || destinations.has(stagedPath))
      throw new Error(`Duplicate official plugin identity/source/destination: ${name}`);
    names.add(name);
    sources.add(sourceRoot);
    destinations.add(stagedPath);
    const pluginRoot = join(root, sourceRoot);
    const packageManifest = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
    const manifest = JSON.parse(
      await readFile(join(pluginRoot, ".kayingcode-plugin/plugin.json"), "utf8"),
    );
    if (manifest.name !== name || !manifest.version || manifest.version !== packageManifest.version)
      throw new Error(`${name}: plugin/package manifest identity or version mismatch`);
    const pluginScope = packageManifest.name?.split("/")[0];
    if (
      (pluginScope !== "@kayingcode" && pluginScope !== "@zcode") ||
      stagedPath !== `packages/${packageManifest.name.split("/")[1]}`
    )
      throw new Error(`${name}: staged path must preserve the npm package identity`);
    if (!["build", "native", "script", "resource"].includes(record.deliveryKind))
      throw new Error(`${name}: invalid deliveryKind`);
    if (
      !Array.isArray(record.rootCandidates) ||
      !record.rootCandidates.includes(sourceRoot) ||
      !record.rootCandidates.includes(stagedPath)
    )
      throw new Error(`${name}: rootCandidates must include source and stable staged roots`);
    const requiresRuntime = ["build", "native"].includes(record.deliveryKind);
    if (requiresRuntime && !record.buildScript)
      throw new Error(`${name}: runtime requires a build script`);
    for (const script of [record.buildScript, record.devBuildScript].filter(Boolean))
      if (!packageManifest.scripts?.[script])
        throw new Error(`${name}: missing package script ${script}`);
    const generatedPaths = new Set(record.generatedSeedPaths ?? []);
    for (const path of generatedPaths) safePath(path, `${name} generatedSeedPaths`);
    for (const path of record.requiredSeedPaths ?? []) {
      safePath(path, `${name} requiredSeedPaths`);
      // dist/bin/native/vendor dist 在构建后验证；源码门禁无需预先产出这些资产。
      if (
        !generatedPaths.has(path) &&
        !/^(dist|bin|native)\//.test(path) &&
        !/^vendor\/[^/]+\/dist\//.test(path)
      )
        await requirePath(pluginRoot, path, name);
    }
    if (record.bootstrapBuildScript)
      await requirePath(
        pluginRoot,
        safePath(record.bootstrapBuildScript, `${name} bootstrapBuildScript`),
        name,
      );
    if (record.devArtifact) safePath(record.devArtifact, `${name} devArtifact`);
    const nativePaths =
      record.nativeRequiredPaths?.[targetParts.platform] ?? record.nativeRequiredPaths?.all ?? [];
    if (record.deliveryKind === "native" && !nativePaths.length)
      throw new Error(`${name}: no native assets declared for ${targetParts.platformKey}`);
    const requiredRuntimePaths = [
      ...(record.requiredRuntimePaths ?? []),
      ...nativePaths.map((path) =>
        path.replace(/\{(platformKey|executableSuffix)\}/g, (_, key) => targetParts[key]),
      ),
    ];
    for (const path of requiredRuntimePaths) {
      safePath(path, `${name} requiredRuntimePaths`);
      if (/[{}]/.test(path)) throw new Error(`${name}: unknown runtime path template ${path}`);
    }
    if (requireRuntime)
      for (const path of new Set([...(record.requiredSeedPaths ?? []), ...requiredRuntimePaths]))
        await requirePath(pluginRoot, path, `${name} (${targetParts.platformKey})`);
    plugins.push({
      ...record,
      marketplace: configuration.marketplace,
      packageName: packageManifest.name,
      version: manifest.version,
      requiresRuntime,
      requiredRuntimePaths,
    });
  }
  const compatibilityDefinitions = configuration.compatibilityDefinitions ?? [];
  for (const definition of compatibilityDefinitions) {
    if (
      names.has(definition.name) ||
      !definition.version ||
      !Array.isArray(definition.rootCandidates)
    )
      throw new Error(`Invalid compatibility-only plugin: ${definition.name}`);
    names.add(definition.name);
  }
  const releaseProfiles = configuration.releaseProfiles ?? {};
  for (const [profile, members] of Object.entries(releaseProfiles)) {
    if (
      !Array.isArray(members) ||
      members.length !== new Set(members).size ||
      members.some((name) => !plugins.some((plugin) => plugin.name === name))
    )
      throw new Error(`Invalid official plugin release profile: ${profile}`);
  }
  return {
    marketplace: configuration.marketplace,
    target: targetParts.platformKey,
    plugins,
    compatibilityDefinitions,
    releaseProfiles,
  };
}

export function selectOfficialPluginProfile(catalog, profile) {
  const members = catalog.releaseProfiles[profile];
  if (!members) throw new Error(`Unknown official plugin release profile: ${profile}`);
  return members.map((name) => catalog.plugins.find((plugin) => plugin.name === name));
}

export function runtimePluginDefinitions(catalog) {
  return [
    ...catalog.plugins.map(
      ({
        name,
        version,
        rootCandidates,
        defaultEnabled,
        listing,
        hostMcpServerNames,
        requiredSeedPaths,
        runtimeTopLevelPaths,
      }) => ({
        name,
        version,
        rootCandidates,
        ...(defaultEnabled === undefined ? {} : { defaultEnabled }),
        ...(listing ? { listing } : {}),
        ...(hostMcpServerNames ? { hostMcpServerNames } : {}),
        ...(requiredSeedPaths ? { requiredSeedPaths } : {}),
        ...(runtimeTopLevelPaths ? { runtimeTopLevelPaths } : {}),
      }),
    ),
    ...catalog.compatibilityDefinitions,
  ];
}
