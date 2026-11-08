#!/usr/bin/env node

// 桌面打包态的 agent 运行时资产：把 agent 的 JS bundle（kayingcode.cjs）放进 bundled-agents/<platform>/glm，
// 由 app 内置的 Electron Node runtime（ELECTRON_RUN_AS_NODE）执行，替代以前随包内置的独立 Node 二进制。
//
// 为什么这么做：
// - agent 没有任何原生 NAPI 插件（ripgrep 是 WASM，其余纯 JS），可直接跑在 Electron 的 Node 上；
// - Electron 41 内置 Node 24.x，与 kayingcode-cli 的目标运行时一致；
// - 单平台体积从 ~180MB 降到 ~16MB，且同一份 JS 跨平台通用；
// - app-server 命令路径不会加载 @zcode/tui，所以这里天然不打包 TUI。
//
// 远端（SSH/WSL/Docker）没有 Electron，由 Source Server archive 自带目标 Node，互不影响。

// 修复原因：bootstrap 清理旧插件 dist 时使用 rmSync，漏导入会在构建前抛出 ReferenceError。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadOfficialPluginCatalog } from "../../../scripts/official-plugin-catalog.mjs";
import { runCommand } from "../../../scripts/spawn-command.mjs";
import { stageAgentBundle } from "./stage-agent-bundle.mjs";
import {
  isSharpRequiredByComputerUse,
  stageSharpIntoBundledAgents,
} from "./sharp-package-assets.mjs";
import { stageKoffiIntoBundledAgents } from "./koffi-package-assets.mjs";
import { BUNDLED_NPM_VERSION, stageBundledNpm } from "./bundled-npm-assets.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const cliBundlePath = resolve(repoRoot, "apps/zcode-cli/packages/cli/dist/kayingcode.cjs");
// CUA 的 MCP server 把 koffi 外部化（esbuild 打不进它按平台分发的 .node），运行期从插件自身
// 的 node_modules 解析。koffi 声明在 adapters 包的依赖里，所以以该包为解析起点；
// stageKoffiIntoBundledAgents 会依次尝试 <root>/node_modules/koffi 与 pnpm 虚拟 store。
const adaptersRoot = resolve(repoRoot, "apps/zcode-cli/packages/adapters");
const runEnv = {
  ...process.env,
};

// 修复原因：同一台 Mac 上可能同时在 login.keychain-db 与 /Library/Keychains/System.keychain
// 各装一张 subject 与 Team 完全相同、但 SHA-1 不同的 "Developer ID Application" 证书
// （系统级那份通常由 MDM 或管理员部署）。cua 插件的 swift 打包脚本按身份**名称**调
// codesign，两份同名证书会让 codesign 直接报 ambiguous 而中断整个 agent bundle 构建。
// 该脚本提供了 KAYING_COMPUTER_USE_CODESIGN_KEYCHAIN 把身份查找收敛到单个 keychain，
// 这里在检测到同名重复时自动钉到一个用户 keychain，避免打包被本机证书副本意外打断。
function resolveAmbiguousCodesignKeychain(env) {
  if (process.platform !== "darwin") return undefined;
  // 用户已显式指定 keychain / 身份或关闭自动发现时保持原样，不覆盖显式配置。
  if (env.KAYING_COMPUTER_USE_CODESIGN_KEYCHAIN) return undefined;
  if (env.KAYING_COMPUTER_USE_CODESIGN_IDENTITY) return undefined;
  const mode = env.KAYING_COMPUTER_USE_CODESIGN_MODE;
  if (mode !== undefined && mode !== "" && mode !== "auto") return undefined;

  const listIdentities = (keychain) => {
    const args = ["find-identity", "-v", "-p", "codesigning"];
    if (keychain) args.push(keychain);
    try {
      const output = execFileSync("security", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return [...output.matchAll(/"([^"]*Developer ID Application: [^"]*)"/gu)].map(
        (match) => match[1],
      );
    } catch {
      return [];
    }
  };

  // 不传 keychain 时 security 会聚合所有搜索列表，同名证书会出现多行。
  const counts = new Map();
  for (const name of listIdentities(undefined)) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const ambiguousName = [...counts].find(([, occurrences]) => occurrences > 1)?.[0];
  if (!ambiguousName) return undefined;

  let userKeychains = [];
  try {
    userKeychains = execFileSync("security", ["list-keychains", "-d", "user"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((line) => line.trim().replace(/^"|"$/gu, ""))
      .filter(Boolean);
  } catch {
    return undefined;
  }
  const keychain = userKeychains.find((candidate) =>
    listIdentities(candidate).includes(ambiguousName),
  );
  if (!keychain) return undefined;
  console.log(
    `[prepare:agent-bundle] codesign identity "${ambiguousName}" exists in multiple keychains; pinning ${keychain}`,
  );
  return keychain;
}

const ambiguousCodesignKeychain = resolveAmbiguousCodesignKeychain(runEnv);
if (ambiguousCodesignKeychain) {
  runEnv.KAYING_COMPUTER_USE_CODESIGN_KEYCHAIN = ambiguousCodesignKeychain;
}

// 平台目录命名：darwin/win32/linux + x64/arm64，
// 支持 KAYINGCODE_TARGET_OS / KAYINGCODE_TARGET_ARCH 覆盖（交叉打包时由 CI 注入）。
function normalizePlatform(raw) {
  switch (raw) {
    case "mac":
    case "macos":
    case "darwin":
    case "osx":
      return "darwin";
    case "win":
    case "windows":
    case "win32":
      return "win32";
    case "linux":
      return "linux";
    default:
      return raw;
  }
}

function normalizeArch(raw) {
  switch (raw) {
    case "x86_64":
    case "x64":
    case "amd64":
      return "x64";
    case "aarch64":
    case "arm64":
      return "arm64";
    default:
      return raw;
  }
}

const platform = normalizePlatform(process.env.KAYINGCODE_TARGET_OS || "") || process.platform;
const arch = normalizeArch(process.env.KAYINGCODE_TARGET_ARCH || "") || process.arch;
const platformKey = `${platform}-${arch}`;
const glmDir = resolve(desktopRoot, "bundled-agents", platformKey, "glm");
// kayingcode.cjs / .node-bundle-meta.json 的落点由 stage-agent-bundle.mjs 自己解析（同源）。
// 运行时与内容插件从同一发行清单派生，打包路径仍保留稳定 package 身份。
const { plugins: releasePlugins } = await loadOfficialPluginCatalog(repoRoot, {
  target: platformKey,
});
const officialPluginPackages = releasePlugins.map((plugin) => ({
  ...plugin,
  relativePath: plugin.sourceRoot,
  runtimeBuildScript: plugin.bootstrapBuildScript,
}));
const BROWSER_USE_PLUGIN_PACKAGE_NAME = releasePlugins.find(
  ({ name }) => name === "browser-use",
).packageName;
const includedOfficialPluginTopLevelPaths = new Set([
  ".mcp.json",
  ".kayingcode-plugin",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  // Electron 生产资源复制有独立白名单，遗漏 agents 会让首启 filesystem seed 永久缺少子代理。
  "agents",
  "bin",
  "commands",
  "dist",
  "docs",
  "hooks",
  "output-styles",
  "native",
  "package.json",
  "scripts",
  "skills",
  "templates",
  "upstream-lock.json",
  "vendor",
]);

// 内置技能包（非插件）：dynamic-workflows 这类技能由产品功能直接依赖（/workflow 展开后模型
// 要加载它），所以不能走插件体系——不进市场、无启停开关、不可卸载。运行期由
// apps/zcode-cli/packages/bootstrap/src/app/bundled-skills.ts 以 source: "bundled"、
// scope: "system" 的 skill root 发现，其 rootCandidates 首项正是 `packages/bundled-skills`
// （相对 kayingcode.cjs 所在目录），因此这里 stage 到 glm/packages/bundled-skills。
// requiredPaths 与那边的 BUNDLED_SKILL_PACK_REQUIRED_PATHS 一一对应：少一个文件则整包拒收，
// 宁可让构建失败，也不要装出一个引用文件缺失的技能。
const bundledSkillPack = {
  relativePath: "apps/zcode-cli/packages/bundled-skills",
  stagedPath: "packages/bundled-skills",
  topLevelPaths: ["skills"],
  requiredPaths: [
    "skills/dynamic-workflows/SKILL.md",
    "skills/dynamic-workflows/patterns.md",
    "skills/dynamic-workflows/examples.md",
  ],
};
const excludedOfficialPluginAssetNames = new Set([
  ".DS_Store",
  ".venv",
  "__pycache__",
  "node_modules",
  // 插件源码树里的构建缓存目录（如 cua vendor 的 SwiftPM .build/arm64-release/release
  // 符号链接指向构建机工作区的绝对路径）。staging 复制后会让 macOS 签名阶段的
  // codesign --verify --deep --strict 报 "invalid destination for symbolic link in bundle"。
  // 运行时只使用 native/ 下的构建产物，.build 纯属残留，直接排除。
  ".build",
  // Rust 工作区的 target/ 同为构建残留（taptap 的 native/core、threejs-to-taptapmaker），
  // 里面是未签名的 build-script-build 与 proc-macro dylib，Apple 公证扫描会直接拒绝
  // （"not signed with a valid Developer ID certificate"）。运行时只用 bin/ 下的产物。
  "target",
]);

function shouldCopyOfficialPluginAsset(sourcePath) {
  const name = basename(sourcePath);
  return !excludedOfficialPluginAssetNames.has(name) && !name.endsWith(".pyc");
}
const isBootstrapWithRemote = process.env.KAYINGCODE_BOOTSTRAP_WITH_REMOTE === "1";

function buildCliBundle() {
  console.log("[prepare:agent-bundle] building kayingcode-cli app-server bundle ...");
  // 复用仓库根脚本（turbo build:desktop-agent --filter=@zcode/cli），命中缓存时几乎瞬时。
  runCommand(process.execPath, [resolve(repoRoot, "scripts/build-desktop-agent-cli.mjs")], {
    cwd: repoRoot,
    env: runEnv,
  });
  if (!existsSync(cliBundlePath)) {
    throw new Error(
      `[prepare:agent-bundle] expected cli bundle missing after build: ${cliBundlePath}`,
    );
  }
}

function buildOfficialPluginRuntimes() {
  for (const plugin of officialPluginPackages) {
    if (!plugin.requiresRuntime) continue;
    console.log(`[prepare:agent-bundle] building ${plugin.packageName} runtime ...`);
    if (isBootstrapWithRemote) {
      buildOfficialPluginRuntimeForBootstrap(plugin);
      assertOfficialPluginRuntime(plugin);
      continue;
    }

    // Bug 原因：根 package.json 没有 workspaces 字段、仓库也没有 bun.lock 时，bun 的
    // `--filter` 会退化成递归扫描 cwd 下所有 package.json，把 mock-cdn 里解包的同名插件
    // 副本也当成构建目标；esbuild 于是去解析 mock-cdn/releases/<ver>/glm/<platform>/
    // packages/<pkg>/src/server.ts，首次完整打包必然失败（本地 macOS 复现）。
    // pnpm 只认 pnpm-workspace.yaml 的成员，不会命中 mock-cdn，也与
    // build-desktop-agent-cli.mjs 调用 taptap 插件构建的方式保持一致。
    runCommand("pnpm", ["run", "--filter", plugin.packageName, plugin.buildScript ?? "build"], {
      cwd: repoRoot,
      env: runEnv,
    });
    assertOfficialPluginRuntime(plugin);
  }
}

function buildOfficialPluginRuntimeForBootstrap(plugin) {
  const pluginRoot = resolve(repoRoot, plugin.relativePath);
  const hasCompleteRuntime = plugin.requiredRuntimePaths.every((relativePath) =>
    existsSync(resolve(pluginRoot, ...relativePath.split("/"))),
  );
  if (plugin.packageName !== BROWSER_USE_PLUGIN_PACKAGE_NAME && hasCompleteRuntime) {
    console.log(
      `[prepare:agent-bundle] reuse existing official plugin runtime: ${plugin.packageName}`,
    );
    return;
  }

  // bootstrap:with-remote 会连续构建 remote assets 和桌面 agent bundle。
  // 通过包管理器逐包进入插件 build 时，tsc shim 在本地低内存环境中容易被 SIGKILL；
  // 这里仅在 bootstrap 开关下用当前 Node 直接执行等价 tsc + build-mcp，不改变插件自身 build 脚本。
  // browser-use 的 server 与 browser-client 是同一发布对；即使旧 server.js 存在也必须重建，
  // 否则会把旧 server 与当前 client（或缺失 client）一起 stage 到桌面安装包。
  runCommand(process.execPath, [resolve(repoRoot, "node_modules/typescript/bin/tsc")], {
    cwd: pluginRoot,
    env: process.env,
  });
  runCommand(process.execPath, [plugin.runtimeBuildScript], {
    cwd: pluginRoot,
    env: process.env,
  });
}

function assertOfficialPluginRuntime(plugin) {
  const pluginRoot = resolve(repoRoot, plugin.relativePath);
  for (const relativePath of plugin.requiredRuntimePaths) {
    const runtimePath = resolve(pluginRoot, ...relativePath.split("/"));
    if (!existsSync(runtimePath)) {
      throw new Error(`[prepare:agent-bundle] missing official plugin runtime: ${runtimePath}`);
    }
  }
}

function stageBundle() {
  // 实现已抽到 stage-agent-bundle.mjs：dev 链（scripts/build-desktop-agent-cli.mjs）
  // 必须用同一份，否则 dev 会继续跑上一次打包留下的陈旧 agent。
  stageAgentBundle({ repoRoot, platformKey });
}

function stageOfficialPlugins() {
  for (const plugin of officialPluginPackages) {
    const sourceRoot = resolve(repoRoot, plugin.relativePath);
    const manifestPath = resolve(sourceRoot, ".kayingcode-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`[prepare:agent-bundle] missing official plugin manifest: ${manifestPath}`);
    }

    const targetRoot = resolve(glmDir, plugin.stagedPath);
    mkdirSync(targetRoot, { recursive: true });
    for (const entryName of includedOfficialPluginTopLevelPaths) {
      const sourcePath = resolve(sourceRoot, entryName);
      if (!existsSync(sourcePath)) continue;
      cpSync(sourcePath, resolve(targetRoot, entryName), {
        recursive: true,
        filter: shouldCopyOfficialPluginAsset,
      });
    }
    for (const relativePath of plugin.requiredSeedPaths ?? []) {
      const stagedAssetPath = resolve(targetRoot, ...relativePath.split("/"));
      if (!existsSync(stagedAssetPath)) {
        throw new Error(
          `[prepare:agent-bundle] missing staged official plugin seed asset: ${stagedAssetPath}`,
        );
      }
    }
    console.log(`[prepare:agent-bundle] staged official plugin ${plugin.stagedPath}`);
  }
}

function stageBundledSkillPack() {
  const sourceRoot = resolve(repoRoot, bundledSkillPack.relativePath);
  const targetRoot = resolve(glmDir, bundledSkillPack.stagedPath);
  mkdirSync(targetRoot, { recursive: true });
  for (const entryName of bundledSkillPack.topLevelPaths) {
    const sourcePath = resolve(sourceRoot, entryName);
    if (!existsSync(sourcePath)) continue;
    cpSync(sourcePath, resolve(targetRoot, entryName), {
      recursive: true,
      filter: shouldCopyOfficialPluginAsset,
    });
  }
  for (const relativePath of bundledSkillPack.requiredPaths) {
    const stagedAssetPath = resolve(targetRoot, ...relativePath.split("/"));
    if (!existsSync(stagedAssetPath)) {
      throw new Error(
        `[prepare:agent-bundle] missing staged bundled skill asset: ${stagedAssetPath}`,
      );
    }
  }
  console.log(`[prepare:agent-bundle] staged bundled skill pack ${bundledSkillPack.stagedPath}`);
}

// stdio MCP 的 npm/npx 回退（用户没装 Node 时由 Electron Node 运行随包 npm）。
// tarball 按 sha512 缓存在 node_modules/.cache，重复打包不再下载。
async function stageBundledNpmRuntime() {
  const stagedRoot = await stageBundledNpm({
    cacheDir: resolve(repoRoot, "node_modules", ".cache", "kayingcode-bundled-npm"),
    glmDir,
  });
  console.log(`[prepare:agent-bundle] staged npm@${BUNDLED_NPM_VERSION} into ${stagedRoot}`);
}

function stageSharpForNodeReplPlugin() {
  if (!isSharpRequiredByComputerUse({ desktopPackageRoot: desktopRoot })) {
    console.log(
      "[prepare:agent-bundle] Computer Use package does not declare sharp, skip sharp staging",
    );
    return;
  }
  // `sharp` 仍然外部化——它包含无法内联的 native .node，运行时从**所在包**的 node_modules
  // 解析。2026-09-11 起 node_repl 宿主的 bundle 归 @zcode/node-repl-host，所以 sharp 必须
  // stage 到宿主目录，否则宿主里的 `import sharp` 在打包后的 app 里解析不到。
  // CUA screenshot / get_app_state 的 native 依赖仍要放进 CUA plugin 自己的 node_modules；
  // Browser Use 目录保留一份兼容 staging。三份 staging 都位于 plugin 子目录下，避免
  // electron-builder 过滤 extraResources 根目录的 node_modules。
  const pluginStagedDirs = [
    [NODE_REPL_HOST_PACKAGE_NAME, resolve(glmDir, "packages", "node-repl-host")],
    [BROWSER_USE_PLUGIN_PACKAGE_NAME, resolve(glmDir, "packages", "browser-use-plugin")],
    [CUA_PLUGIN_PACKAGE_NAME, resolve(glmDir, "packages", "kayingcode-cua-plugin")],
  ];
  for (const [packageName, pluginStagedDir] of pluginStagedDirs) {
    if (!existsSync(resolve(pluginStagedDir, ".kayingcode-plugin", "plugin.json"))) {
      console.log(`[prepare:agent-bundle] ${packageName} not staged, skip sharp staging`);
      continue;
    }
    stageSharpIntoBundledAgents({
      desktopPackageRoot: desktopRoot,
      glmDir: pluginStagedDir,
      targetPlatform: { os: platform, arch },
    });
    console.log(
      `[prepare:agent-bundle] staged sharp into ${resolve(pluginStagedDir, "node_modules")} (${platform}-${arch})`,
    );
  }
}

function stageKoffiForCuaPlugin() {
  const cuaPluginStagedDir = resolve(glmDir, "packages", "kayingcode-cua-plugin");
  if (!existsSync(resolve(cuaPluginStagedDir, ".kayingcode-plugin", "plugin.json"))) {
    console.log("[prepare:agent-bundle] kayingcode-cua-plugin not staged, skip koffi staging");
    return;
  }
  stageKoffiIntoBundledAgents({
    koffiPackageRoot: adaptersRoot,
    glmDir: cuaPluginStagedDir,
    targetPlatform: { os: platform, arch },
  });
  console.log(
    `[prepare:agent-bundle] staged koffi into ${resolve(cuaPluginStagedDir, "node_modules")} (${platform}-${arch})`,
  );
}

// 修复原因：Electron 生产包只带 resources/glm/kayingcode.cjs 时，app-server 进程的
// __dirname 附近没有官方插件目录，启动时 seed 找不到 source，用户侧不会自动得到内置插件。
// 这里把官方插件按 bootstrap 的 rootCandidates 期望放到 glm/packages/*-plugin，
// 让 Electron Node 运行 kayingcode.cjs 时复用同一套 filesystem seed 逻辑。
// browser-use runtime 的声明生成依赖 @zcode/core/dist。CI 干净检出没有该产物，
// 必须先构建 CLI 依赖，再构建官方插件；开发机残留的 dist 曾掩盖这个顺序问题。
buildCliBundle();
buildOfficialPluginRuntimes();
stageBundle();
stageOfficialPlugins();
stageBundledSkillPack();
await stageBundledNpmRuntime();
stageKoffiForCuaPlugin();
stageSharpForNodeReplPlugin();
