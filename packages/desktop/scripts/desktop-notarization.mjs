import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

import { load } from "js-yaml";

function readNonEmpty(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value : null;
}

// 默认要求公证后，无凭据的报错必须直接列出全部凭据契约与显式跳过出口，
// 让打包在 prepare/build 之前就能拿到可执行的修复路径。
const MAC_NOTARIZATION_CREDENTIALS_REQUIREMENT =
  "macOS 打包默认要求公证：请提供 APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER（App Store Connect API），" +
  "或先用 `xcrun notarytool store-credentials` 保存凭据并提供 APPLE_KEYCHAIN_PROFILE，" +
  "或提供 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID（专用密码）；" +
  "开发机如需跳过公证请显式设置 KAYINGCODE_ENABLE_MAC_NOTARIZE=0";

/**
 * 归一化 macOS 公证凭据。凭据本身已在环境中，公证 hook（notarize-dmg.cjs →
 * notarize-helpers.cjs）直接读取；这里的职责只有两个：提前校验凭据完整性
 * （公证 hook 在凭据缺失时会静默降级为“仅签名 DMG”，不能让它把未公证包
 * 伪装成正常发布产物），以及向调用方报告凭据来源类型。
 * 优先级必须与 notarize-helpers.resolveAuthorizationArgs 保持一致：
 * App Store Connect API key > notarytool 钥匙串 profile > Apple ID 专用密码。
 */
export function resolveMacNotarizationEnvironment(env) {
  const requested = readNonEmpty(env, "KAYINGCODE_ENABLE_MAC_NOTARIZE");
  if (requested && requested !== "0" && requested !== "1") {
    throw new Error(`invalid KAYINGCODE_ENABLE_MAC_NOTARIZE=${requested}; expected 1 or 0`);
  }
  if (requested === "0") {
    return { source: "notarization-disabled", envPatch: {} };
  }

  const appleApiKey = readNonEmpty(env, "APPLE_API_KEY");
  const appleApiKeyId = readNonEmpty(env, "APPLE_API_KEY_ID");
  const appleApiIssuer = readNonEmpty(env, "APPLE_API_ISSUER");
  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error(
        "macOS 公证凭据不完整：APPLE_API_KEY、APPLE_API_KEY_ID 与 APPLE_API_ISSUER 必须同时提供",
      );
    }
    return { source: "notarization-api-key", envPatch: {} };
  }

  const keychainProfile = readNonEmpty(env, "APPLE_KEYCHAIN_PROFILE");
  if (keychainProfile) {
    return { source: "notarization-keychain-profile", envPatch: {} };
  }

  const appleId = readNonEmpty(env, "APPLE_ID");
  const appleIdPassword = readNonEmpty(env, "APPLE_APP_SPECIFIC_PASSWORD");
  const appleTeamId = readNonEmpty(env, "APPLE_TEAM_ID");
  if (appleId || appleIdPassword || appleTeamId) {
    if (!appleId || !appleIdPassword || !appleTeamId) {
      throw new Error(
        "macOS 公证凭据不完整：APPLE_ID、APPLE_APP_SPECIFIC_PASSWORD 与 APPLE_TEAM_ID 必须同时提供",
      );
    }
    return { source: "notarization-app-specific-password", envPatch: {} };
  }

  throw new Error(MAC_NOTARIZATION_CREDENTIALS_REQUIREMENT);
}

function defaultCaptureCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: typeof result.status === "number" ? result.status : -1,
    stdout: result.stdout ?? "",
    stderr: result.error
      ? `${result.error.message}\n${result.stderr ?? ""}`
      : (result.stderr ?? ""),
  };
}

/**
 * 断言单个产物（.app 或 .dmg）是 Developer ID 签名并绑定了正式签名团队。
 * 方案 B 下 .app 不盖 staple 票据，因此这里不做 stapler 校验；票据验收在 DMG 上进行。
 */
function verifyDeveloperIdSignature(path, captureCommand) {
  const displayResult = captureCommand("codesign", ["-dvv", path]);
  const displayOutput = `${displayResult.stdout}\n${displayResult.stderr}`;
  if (
    displayResult.status !== 0 ||
    !displayOutput.includes("Authority=Developer ID Application:")
  ) {
    throw new Error(`打包产物缺少 Developer ID 签名，拒绝流出: ${path}\n${displayOutput.trim()}`);
  }
  if (/TeamIdentifier=not set\b/.test(displayOutput)) {
    throw new Error(`打包产物未绑定正式签名团队，拒绝流出: ${path}\n${displayOutput.trim()}`);
  }
}

/**
 * 打包后的机械验收（方案 B 语义）：
 * - `.app` 必须是 Developer ID 签名（签名与公证凭据都缺失时 electron-builder / 公证 hook
 *   都只 warn 不报错，这道验收是“未签名包不流出”的兜底）。
 * - 开启公证时，DMG 必须是 Developer ID 签名且 `stapler validate` 通过——
 *   notarize-dmg.cjs 若被跳过，这里必须失败，禁止“能生成但未公证”的产物伪装成发布包。
 */
export function verifyNotarizedMacDistribution({
  appPath,
  dmgPath,
  requireDmgNotarization = true,
  captureCommand = defaultCaptureCommand,
}) {
  verifyDeveloperIdSignature(appPath, captureCommand);
  if (!requireDmgNotarization) {
    return;
  }
  verifyDeveloperIdSignature(dmgPath, captureCommand);
  const stapleResult = captureCommand("xcrun", ["stapler", "validate", dmgPath]);
  if (stapleResult.status !== 0) {
    const stapleOutput = `${stapleResult.stdout}\n${stapleResult.stderr}`.trim();
    throw new Error(`打包产物缺少公证 staple 票据，拒绝流出: ${dmgPath}\n${stapleOutput}`);
  }
}

/**
 * notarize-dmg.cjs 对 DMG 重签名后依赖进程退出时的 fixup 回写 latest-mac.yml；
 * 若回写被跳过或失败，更新链路会拿到重签名前的旧 sha512/size 导致差分更新校验失败。
 * 这里在 bundle 末尾机械校验 DMG 条目与实际文件一致。
 */
export function verifyLatestMacYmlDmgEntry({ dmgPath, ymlPath }) {
  const doc = load(readFileSync(ymlPath, "utf8"));
  const dmgFileName = basename(dmgPath);
  const entry = doc?.files?.find((file) => file?.url === dmgFileName);
  if (!entry) {
    throw new Error(`latest-mac.yml 缺少 DMG 条目 ${dmgFileName}: ${ymlPath}`);
  }

  const actualSha512 = createHash("sha512").update(readFileSync(dmgPath)).digest("base64");
  const actualSize = statSync(dmgPath).size;
  if (entry.sha512 !== actualSha512 || entry.size !== actualSize) {
    throw new Error(
      `latest-mac.yml 的 DMG 条目与重签名后的实际文件不一致（公证 hook 的回写未生效）: ${ymlPath}\n` +
        `entry: size=${entry.size} sha512=${entry.sha512}\n` +
        `actual: size=${actualSize} sha512=${actualSha512}`,
    );
  }
}
