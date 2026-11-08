import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stageAgentBundle } from "../packages/desktop/scripts/stage-agent-bundle.mjs";
import {
  computeAgentBuildFingerprint,
  readAgentBuildStamp,
  resolveAgentBuildStampPath,
  writeAgentBuildStamp,
} from "./agent-build-fingerprint.mjs";
import { loadOfficialPluginCatalog } from "./official-plugin-catalog.mjs";
import { generateOfficialPluginCatalog } from "./generate-official-plugin-catalog.mjs";
import { runCommand } from "./spawn-command.mjs";

// adapters tsc 在内存受限机器上会 OOM（exit 134），给整条构建链路提高堆上限。
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : ""}--max-old-space-size=8192`;
import {
  stageBuiltinProviderConfig,
  resolveBuiltinProviderBuildEnvironment,
} from "./builtin-provider-config.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await generateOfficialPluginCatalog(repoRoot);
const platformKey = `${process.platform}-${process.arch}`;
const useTurboBuild = process.env.KAYINGCODE_DESKTOP_AGENT_BUILD_MODE === "turbo";
const useBootstrapWithRemoteBuild = process.env.KAYINGCODE_BOOTSTRAP_WITH_REMOTE === "1";
const agentBundleSourcePath = resolve(repoRoot, "apps/zcode-cli/packages/cli/dist/kayingcode.cjs");
const runEnv = {
  ...process.env,
  KAYINGCODE_ENV: await resolveBuiltinProviderBuildEnvironment({ root: repoRoot }),
};
// 桌面 Agent 构建有普通逐包构建和 bootstrap:with-remote 直跑 tsc 两条路径。
// 过去两条路径分别维护依赖顺序，新增 workspace 依赖时只更新了 bootstrap 依赖，
// 干净 CI 中该依赖的 dist 尚不存在，bootstrap 会因无法解析类型入口而失败。
// 两条路径统一从这一份有序清单派生，避免后续新增 workspace 依赖时再次漂移。
const cliWorkspaceBuilds = [
  { packageName: "@zcode/shared-types", packageDir: "agent-cli-types" },
  { packageName: "@zcode/contracts", packageDir: "agent-contracts" },
  // dynamic-workflow 的 tsc 构建依赖 gitignored 的 libs.generated.ts，
  // 而 bare-tsc 路径（runBootstrapWithRemoteBuild）不会执行 package build script，
  // 所以需要先跑生成脚本；必须排在 @zcode/core 之前，core 依赖 dynamic-workflow。
  {
    packageName: "@zcode/dynamic-workflow",
    packageDir: "dynamic-workflow",
    prepareScript: "scripts/generate-libs.mjs",
  },
  // dynamic-workflow-runtime 的类型入口是 dist/index.d.ts，必须先于 bootstrap 构建。
  { packageName: "@zcode/dynamic-workflow-runtime", packageDir: "dynamic-workflow-runtime" },
  { packageName: "@zcode/core", packageDir: "agent-runtime" },
  { packageName: "@zcode/adapters", packageDir: "agent-adapters" },
  { packageName: "@zcode/i18n", packageDir: "agent-i18n" },
  { packageName: "@zcode/telemetry", packageDir: "agent-telemetry" },
  { packageName: "@zcode/bootstrap", packageDir: "agent-bootstrap" },
];
// 官方插件 manifest 可以在 server.js 缺失时被 filesystem seed，直到 session
// 连接 MCP 才报错，造成“Helper ready 但 CUA 工具不存在”的半启动状态。所有普通 Dev 必需的
// 独立 MCP runtime 必须集中登记，并在构建后验证真实入口文件，再允许 Agent bundle 启动。
const { plugins: releasePlugins } = await loadOfficialPluginCatalog(repoRoot);
const requiredDevPluginRuntimeBuilds = releasePlugins
  .filter(({ devArtifact }) => devArtifact)
  .map((plugin) => ({
    packageName: plugin.packageName,
    buildScript: plugin.devBuildScript ?? "build",
    artifactPath: `${plugin.sourceRoot}/${plugin.devArtifact}`,
  }));
const defaultBuildTasks = [
  ...cliWorkspaceBuilds.map(({ packageName }) => ({ packageName, buildScript: "build" })),
  ...requiredDevPluginRuntimeBuilds,
];

async function verifyRequiredDevPluginRuntimeArtifacts() {
  for (const runtime of requiredDevPluginRuntimeBuilds) {
    const artifactPath = resolve(repoRoot, runtime.artifactPath);
    try {
      await access(artifactPath);
    } catch (error) {
      throw new Error(
        `[build-desktop-agent-cli] ${runtime.packageName} build succeeded without required MCP runtime: ${artifactPath}`,
        { cause: error },
      );
    }
  }
}

function requiredPluginRuntimeArtifactPaths() {
  return requiredDevPluginRuntimeBuilds.map(({ artifactPath }) => resolve(repoRoot, artifactPath));
}

function stagedAgentBundleReady() {
  return existsSync(
    resolve(repoRoot, "packages/desktop/bundled-agents", platformKey, "glm/kayingcode.cjs"),
  );
}

function requiredPluginRuntimeArtifactsReady() {
  return requiredPluginRuntimeArtifactPaths().every((artifactPath) => existsSync(artifactPath));
}

/**
 * 源码未变且产物齐全时跳过整条重建链。
 * 只覆盖普通 dev / turbo 路径；bootstrap:with-remote 有自己的复用语义，保持不动。
 */
function trySkipAgentRebuild({ fingerprint }) {
  const stampPath = resolveAgentBuildStampPath(repoRoot, platformKey);
  const stamp = readAgentBuildStamp(stampPath);
  if (!stamp || stamp.fingerprint !== fingerprint) {
    return false;
  }
  if (!existsSync(agentBundleSourcePath) || !stagedAgentBundleReady()) {
    return false;
  }
  if (!requiredPluginRuntimeArtifactsReady()) {
    return false;
  }
  console.log(
    `[build-desktop-agent-cli] inputs unchanged (fingerprint ${fingerprint.slice(0, 12)}), reuse staged agent bundle`,
  );
  return true;
}

function commitAgentBuildStamp({ fingerprint, mode }) {
  writeAgentBuildStamp(resolveAgentBuildStampPath(repoRoot, platformKey), fingerprint, {
    mode,
    platform: platformKey,
  });
}

/**
 * 构建过程会重写若干生成物（libs.generated.ts、browser-client.mjs、vendor 同步等），
 * 它们也参与指纹。stamp 必须记「构建完成后」的指纹，否则第一次构建刚写完 stamp 就失效。
 */
function commitStampAfterBuild(mode) {
  commitAgentBuildStamp({
    fingerprint: computeAgentBuildFingerprint(repoRoot),
    mode,
  });
}

/**
 * 把刚构建出的 agent bundle 暂存进 bundled-agents。
 *
 * 必须做：dev 未打包时 agent 二进制由 desktopRuntimeEnv.ts 的
 * resolveBundledKayingCodeAgentBinaryPath() 解析，候选**只有** bundled-agents/，没有
 * cli/dist/。只靠打包链暂存会让 dev 一直跑上一次打包留下的那份 —— 实测陈旧
 * 3 天，任何 agent CLI 侧改动在 dev 里静默不生效，把「改动没进去」伪装成「代码没作用」。
 * 实现与打包链共用 stage-agent-bundle.mjs，两边不可能再各自漂移。
 *
 * dev 只跑宿主平台，所以 platformKey 直接取 process；打包链的跨平台 target 由它自己解析。
 */
function stageDevAgentBundle() {
  stageAgentBundle({
    repoRoot,
    platformKey: `${process.platform}-${process.arch}`,
  });
}

async function runBootstrapWithRemoteBuild() {
  if (existsSync(resolve(repoRoot, "apps/zcode-cli/packages/cli/dist/kayingcode.cjs"))) {
    await stageBuiltinProviderConfig({
      root: repoRoot,
      env: runEnv,
      directory: resolve(repoRoot, "apps/zcode-cli/packages/cli/dist/provider"),
    });
    console.log("[build-desktop-agent-cli] reuse existing kayingcode-cli desktop agent bundle");
    return;
  }

  for (const { packageDir, prepareScript } of cliWorkspaceBuilds) {
    // bootstrap:with-remote 会在 remote assets 阶段构建 agent bundle。
    // 过去经包管理器逐包执行 tsc 时会再走 shim/env node 层，低内存本地环境里容易长时间卡住。
    // 这里只有 bootstrap 专用环境变量生效，直接复用当前 Node 启动 TypeScript CLI。
    // bare tsc 绕过 package build script，所以带 prepareScript 的包（dynamic-workflow）
    // 必须先手动跑生成脚本补齐 gitignored 的 libs.generated.ts，否则 tsc 因缺文件报错。
    if (prepareScript) {
      runCommand(process.execPath, [prepareScript], {
        cwd: `packages/${packageDir}`,
        env: runEnv,
        stdio: "inherit",
      });
    }
    runCommand(process.execPath, ["../../node_modules/typescript/bin/tsc"], {
      cwd: `packages/${packageDir}`,
      env: runEnv,
      stdio: "inherit",
    });
  }

  runCommand(process.execPath, ["scripts/build.mjs", "--desktop-agent"], {
    cwd: "apps/zcode-cli/packages/cli",
    env: runEnv,
    stdio: "inherit",
  });
}

if (useBootstrapWithRemoteBuild) {
  await runBootstrapWithRemoteBuild();
  stageDevAgentBundle();
  process.exit(0);
}

// dev:desktop 每次启动都会走到这里。指纹未变时整段重建（约 20s+）直接跳过，
// 只付出一次元数据哈希（亚百毫秒）。变更来源见 agent-build-fingerprint.mjs。
const agentBuildFingerprint = computeAgentBuildFingerprint(repoRoot);
if (trySkipAgentRebuild({ fingerprint: agentBuildFingerprint })) {
  process.exit(0);
}

if (!useTurboBuild) {
  // Linux 容器 demo 里没有仓库级 turbo 根，`turbo --cwd apps/zcode-cli/packages/cli`
  // 会把 apps/zcode-cli/packages/cli 当根目录，并拒绝 turbo.json 中指向 ../../packages/shared 的 inputs。
  // 同时 agent 子 workspace 不包含根 packages/shared，但 agent 包依赖 @zcode/shared。
  // 因此默认改用仓库根 workspace 的明确包顺序构建（pnpm --filter），避免 WDIO 前置构建卡在子 workspace 解析。
  for (const { packageName, buildScript } of defaultBuildTasks) {
    runCommand("pnpm", ["--filter", packageName, "run", buildScript], {
      env: runEnv,
      stdio: "inherit",
    });
  }

  await verifyRequiredDevPluginRuntimeArtifacts();
  runCommand("pnpm", ["--filter", "@zcode/cli", "run", "build:desktop-agent"], {
    env: runEnv,
    stdio: "inherit",
  });
  stageDevAgentBundle();
  commitStampAfterBuild("sequential");
  process.exit(0);
}

// turbo 路径只调度 build:desktop-agent 及其 workspace 依赖，不包含 3 个独立 MCP plugin
// runtime。走到这里说明指纹已变，插件源可能一并变过，必须与串行路径一样总是重建，
// 不能只在产物缺失时补，否则会留下陈旧 server.js。
for (const runtime of requiredDevPluginRuntimeBuilds) {
  runCommand("pnpm", ["--filter", runtime.packageName, "run", runtime.buildScript], {
    env: runEnv,
    stdio: "inherit",
  });
}

runCommand(
  "pnpm",
  ["exec", "turbo", "--skip-infer", "run", "build:desktop-agent", "--filter=@zcode/cli"],
  {
    env: runEnv,
    stdio: "inherit",
  },
);
await verifyRequiredDevPluginRuntimeArtifacts();
stageDevAgentBundle();
commitStampAfterBuild("turbo");
