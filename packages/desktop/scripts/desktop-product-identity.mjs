import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

/**
 * 构建期开关：为真时安装包使用 Preview 身份，而后端环境仍由 `KAYINGCODE_ENV` 单独决定。
 * 典型用法是 `KAYINGCODE_ENV=production KAYINGCODE_PREVIEW_IDENTITY=1`，得到一个连接生产后端、
 * 可与正式版并排安装的 `KayingCode Preview`。
 */
export const KAYINGCODE_PREVIEW_IDENTITY_ENV = "KAYINGCODE_PREVIEW_IDENTITY";
export const KAYINGCODE_DEVELOPMENT_APP_ID = "dev.kayingcode.app.development";

const execFileAsync = promisify(execFile);

export async function resolveDesktopDevelopmentAppId(repositoryPath) {
  // 多个 clone 共用开发 ID 会让原生通知/应用解析命中另一个副本。
  // git common directory 让同一仓库的 worktree 共用身份；realpath 排除符号链接别名。
  const { stdout } = await execFileAsync("git", [
    "-C",
    repositoryPath,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const identity = await realpath(stdout.trim());
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return `${KAYINGCODE_DEVELOPMENT_APP_ID}.r${suffix}`;
}

const PRODUCTION_IDENTITY = Object.freeze({
  flavor: "production",
  appId: "com.lingdian.kayingai.agent.code",
  productName: "KayingCode",
  linuxExecutableName: "kayingcode",
  linuxPackageName: "kayingcode",
  cuaHelperInstallVariant: null,
});

const PREVIEW_IDENTITY = Object.freeze({
  flavor: "preview",
  appId: "com.lingdian.kayingai.agent.code.preview",
  productName: "KayingCode Preview",
  linuxExecutableName: "kayingcode-preview",
  linuxPackageName: "kayingcode-preview",
  cuaHelperInstallVariant: "preview",
});

export const desktopProductIdentities = Object.freeze({
  production: PRODUCTION_IDENTITY,
  preview: PREVIEW_IDENTITY,
});

function normalizeDesktopKayingCodeEnv(env) {
  return env.KAYINGCODE_ENV?.trim().toLowerCase() === "production" ? "production" : "test";
}

/**
 * 开关只有一种开启拼写 `1`（`0` / 空 = 关闭），与 CI workflow 规则和 release 门的
 * `$KAYINGCODE_PREVIEW_IDENTITY == "1"` 精确比较保持同一套语义。其它拼写在构建期直接失败，
 * 避免 `true` 之类在 YAML 路由层漏匹配、却在脚本层被当成开启，把 Preview 包打进生产验收目录。
 */
export function isPreviewIdentityRequested(env = process.env) {
  const value = env[KAYINGCODE_PREVIEW_IDENTITY_ENV]?.trim() ?? "";
  if (value === "1") {
    return true;
  }
  if (value === "" || value === "0") {
    return false;
  }
  throw new Error(
    `invalid ${KAYINGCODE_PREVIEW_IDENTITY_ENV}=${env[KAYINGCODE_PREVIEW_IDENTITY_ENV]}; expected 1 or 0`,
  );
}

/**
 * 产品身份（flavor）与后端环境（`KAYINGCODE_ENV`）是两个轴：
 * - `KAYINGCODE_ENV=test` 一律是 Preview，测试后端不能顶着正式 `KayingCode` 身份覆盖用户的正式安装；
 * - `KAYINGCODE_ENV=production` 默认是正式身份，显式 `KAYINGCODE_PREVIEW_IDENTITY=1` 时改用 Preview 身份。
 * 未知 `KAYINGCODE_ENV` 继续按 test 处理，和共享层 normalizeKayingCodeEnv 的 fail-safe 默认值一致。
 */
export function resolveDesktopProductFlavor(env = process.env) {
  if (isPreviewIdentityRequested(env)) {
    return "preview";
  }
  return normalizeDesktopKayingCodeEnv(env) === "production" ? "production" : "preview";
}

export function resolveDesktopProductIdentity(env = process.env) {
  return desktopProductIdentities[resolveDesktopProductFlavor(env)];
}

/**
 * 产物文件名后缀标记的是后端环境而不是身份：`_TEST` 只出现在测试后端的安装包上。
 * 生产后端的 Preview 包靠 productName（`KayingCode Preview-<version>-...`）与正式包区分。
 */
export function resolveDesktopArtifactSuffix(env = process.env) {
  return normalizeDesktopKayingCodeEnv(env) === "test" ? "_TEST" : "";
}

/**
 * 返回 Windows Shell 使用的 AppUserModelId；开发态返回 null，调用方必须跳过 setAppUserModelId。
 *
 * 打包态必须复用 electron-builder 的 appId，否则快捷方式里的 AUMID、开始菜单索引
 * 和运行中的 Electron 进程会被 Windows 视为三个不同的应用。
 *
 * 修复依据：Windows 11 任务栏对设置了自定义 AUMID 的窗口，只按开始菜单索引中
 * 匹配该 AUMID 的快捷方式解析任务栏图标。开发态没有启动器管理的快捷方式，
 * 设置自定义 AUMID 后任务栏要么显示通用文档图标（无匹配快捷方式），要么命中
 * 机器上残留的旧快捷方式缓存图标（2026-10-03 实机复现：`dev.kayingcode.app.development`
 * 命中用户固定产生的 `KayingCode Dev.lnk`，重品牌 exe 资源、窗口 HICON 乃至
 * `ie4uinit -show` 都无法让加粗后的新 KY 图标上任务栏）。开发态不设置 AUMID 时
 * Shell 按默认 exe 路径身份解析，才会读取重品牌副本的图标资源与窗口 HICON。
 * 历史 `cn.aminer.kayingcode` 仍禁止恢复：它已被索引到旧 `Electron.lnk`。
 * `dev.kayingcode.app.development` 仅作为 macOS 按仓库派生开发 bundle ID 的命名空间。
 */
export function resolveWindowsAppUserModelIdForFlavor(flavor, runtime = { isPackaged: true }) {
  if (runtime.isPackaged === false) {
    return null;
  }
  return desktopProductIdentities[flavor === "preview" ? "preview" : "production"].appId;
}

export function resolveWindowsAppUserModelId(env = process.env, runtime = { isPackaged: true }) {
  return resolveWindowsAppUserModelIdForFlavor(resolveDesktopProductFlavor(env), runtime);
}
