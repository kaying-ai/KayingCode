import { runCommandAndReadStdout } from "../../../scripts/spawn-command.mjs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const MAC_DEVELOPER_ID_IDENTITY_PREFIX = "Developer ID Application:";
const MAC_KEYCHAIN_IDENTITY_LINE_PATTERN = /^\s*\d+\)\s+[0-9A-Fa-f]{40}\s+"(.+?)"\s*$/u;
// 默认要求签名后，无任何证书来源的报错必须直接给出全部出口：注入证书或显式关闭签名。
const MAC_SIGNING_CREDENTIALS_REQUIREMENT =
  'macOS 打包默认要求签名：请提供 CSC_LINK / MAC_CSC_LINK（P12）、APPLE_SIGNING_IDENTITY / CSC_NAME（钥匙串身份），或确保本机钥匙串存在可用的 "Developer ID Application" 证书；开发机如需未签名包请显式设置 KAYINGCODE_ENABLE_MAC_SIGN=0';

function readNonEmpty(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value : null;
}

function resolveWindowsSigningEnvironment({ env }) {
  if (readNonEmpty(env, "WIN_CSC_LINK") || readNonEmpty(env, "CSC_LINK")) {
    return { source: "windows-external-certificate", envPatch: {} };
  }
  // 修复依据：仓库内开发证书含私钥且已进入旧历史，公开源码不得再回退读取它。
  // 未注入外部证书时明确标记未签名开发包，正式发行由产物门禁拒绝。
  return { source: "windows-unsigned", envPatch: {} };
}

/** Read the ignored Windows-only signing file before any build work starts. */
export async function loadDesktopCodeSigningEnvironment(options) {
  const { targetOs, desktopRoot } = options;
  const explicit = resolveDesktopCodeSigningEnvironment(options);
  if (targetOs !== "win" || explicit.source !== "windows-unsigned") {
    return explicit;
  }

  const configPath = resolve(desktopRoot, "build", "cert", "windows-signing.local.json");
  let contents;
  try {
    contents = await readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return explicit;
    throw new Error(`无法读取 Windows 本机签名配置: ${configPath}`, { cause: error });
  }

  let config;
  try {
    config = JSON.parse(contents);
  } catch {
    // 修复依据：损坏的本机配置不能静默回退未签名构建；错误中不回显可能含口令的文件内容。
    throw new Error(`Windows 本机签名配置不是有效 JSON: ${configPath}`);
  }
  const certificateFile = config?.certificateFile;
  const certificatePassword = config?.certificatePassword;
  if (typeof certificateFile !== "string" || !isAbsolute(certificateFile.trim())) {
    throw new Error(`Windows 本机签名配置 certificateFile 必须是 absolute path: ${configPath}`);
  }
  if (typeof certificatePassword !== "string" || !certificatePassword.trim()) {
    throw new Error(`Windows 本机签名配置 certificatePassword 不能为空: ${configPath}`);
  }
  try {
    const certificateStat = await stat(certificateFile.trim());
    if (!certificateStat.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`Windows 本机签名证书文件不可访问: ${certificateFile.trim()}`);
  }
  return {
    source: "windows-local-config",
    envPatch: {
      CSC_LINK: certificateFile.trim(),
      CSC_KEY_PASSWORD: certificatePassword,
    },
  };
}

/**
 * 探测本机钥匙串中可用的 "Developer ID Application" 身份，返回完整身份串（含前缀）。
 * 仅匹配行尾以引号收尾的有效身份；`security find-identity -v` 列出的过期/不受信身份
 * 会在引号后追加错误标记，天然被排除。命令缺失或无钥匙串（如 Linux CI）一律返回 null。
 */
export function findMacDeveloperIdKeychainIdentity({
  runFindIdentitiesCommand = runCommandAndReadStdout,
} = {}) {
  try {
    const output = runFindIdentitiesCommand("security", [
      "find-identity",
      "-v",
      "-p",
      "codesigning",
    ]);
    const identityNames = output
      .split("\n")
      .map((line) => MAC_KEYCHAIN_IDENTITY_LINE_PATTERN.exec(line)?.[1])
      .filter(
        (name) => typeof name === "string" && name.startsWith(MAC_DEVELOPER_ID_IDENTITY_PREFIX),
      );
    return identityNames[0] ?? null;
  } catch {
    return null;
  }
}

export function resolveMacSigningEnvironment(
  env,
  { findDeveloperIdKeychainIdentity = findMacDeveloperIdKeychainIdentity } = {},
) {
  const requested = readNonEmpty(env, "KAYINGCODE_ENABLE_MAC_SIGN");
  if (requested && requested !== "0" && requested !== "1") {
    throw new Error(`invalid KAYINGCODE_ENABLE_MAC_SIGN=${requested}; expected 1 or 0`);
  }
  if (requested === "0") {
    // 与 KayingCodex CI 的未签名构建语义一致：同时写入 CSC_IDENTITY_AUTO_DISCOVERY=false，
    // 让 electron-builder 主体不再找身份，自定义 sign-macos.cjs / notarize-dmg.cjs hook 也短路。
    return {
      source: "macos-signing-disabled",
      envPatch: { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    };
  }

  const cscLink = readNonEmpty(env, "CSC_LINK") ?? readNonEmpty(env, "MAC_CSC_LINK");
  const cscPassword =
    readNonEmpty(env, "CSC_KEY_PASSWORD") ?? readNonEmpty(env, "MAC_CSC_KEY_PASSWORD");
  const keychainIdentity =
    readNonEmpty(env, "APPLE_SIGNING_IDENTITY") ?? readNonEmpty(env, "CSC_NAME");

  if (!cscLink && !keychainIdentity) {
    const discoveredIdentity = findDeveloperIdKeychainIdentity();
    if (!discoveredIdentity) {
      // 修复依据：旧默认在“未显式要求签名且无证书”时静默产出未签名包（source=macos-unsigned），
      // 产物存在容易被误认为已走完发布签名链路。新默认 fail-closed：无任何证书来源立即失败，
      // 只有显式 KAYINGCODE_ENABLE_MAC_SIGN=0 才允许未签名开发包。
      throw new Error(MAC_SIGNING_CREDENTIALS_REQUIREMENT);
    }
    // 钥匙串发现的身份以完整 "Developer ID Application: ..." 串写入子进程环境；
    // electron-builder.config.js 会按既有规则归一化掉前缀再交给 mac.identity。
    return {
      source: "macos-keychain-discovered",
      envPatch: {
        APPLE_SIGNING_IDENTITY: discoveredIdentity,
        KAYINGCODE_ENABLE_MAC_SIGN: "1",
      },
    };
  }

  const envPatch = {};
  if (!readNonEmpty(env, "CSC_LINK") && cscLink) {
    envPatch.CSC_LINK = cscLink;
  }
  if (!readNonEmpty(env, "CSC_KEY_PASSWORD") && cscPassword) {
    envPatch.CSC_KEY_PASSWORD = cscPassword;
  }
  if (requested !== "1") {
    envPatch.KAYINGCODE_ENABLE_MAC_SIGN = "1";
  }

  return {
    source: cscLink ? "macos-p12-certificate" : "macos-keychain-identity",
    envPatch,
  };
}

/**
 * Normalize signing inputs for the electron-builder child process without
 * mutating the caller environment or logging credential values.
 */
export function resolveDesktopCodeSigningEnvironment({
  targetOs,
  env = process.env,
  findDeveloperIdKeychainIdentity,
}) {
  if (targetOs === "win") {
    return resolveWindowsSigningEnvironment({ env });
  }
  if (targetOs === "mac") {
    return resolveMacSigningEnvironment(env, { findDeveloperIdKeychainIdentity });
  }
  return { source: "not-applicable", envPatch: {} };
}
