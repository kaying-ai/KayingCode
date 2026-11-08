/**
 * Shared Apple notarization utilities used by both the .app notarization hook
 * (scripts/notarize.cjs, afterSign) and the DMG notarization hook
 * (scripts/notarize-dmg.cjs, afterAllArtifactBuild).
 *
 * All functions are synchronous where possible (notarytool polling uses async
 * sleep). Credentials are resolved from environment variables in priority order:
 *   1. App Store Connect API key  (APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER)
 *   2. Keychain profile            (APPLE_KEYCHAIN_PROFILE [/ APPLE_KEYCHAIN])
 *   3. Apple App-Specific Password (APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID)
 */

const { spawnSync } = require("node:child_process");

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_TIMEOUT_MINUTES = 60;
const MAX_TRANSIENT_FAILURES = 5;

// ============================================================
// Authorization
// ============================================================

/**
 * Resolve notarytool authorization arguments from environment variables.
 * Returns null when no credentials are found (caller should skip notarization).
 */
function resolveAuthorizationArgs() {
  const apiKey = process.env.APPLE_API_KEY;
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const apiIssuer = process.env.APPLE_API_ISSUER;
  if (apiKey || apiKeyId || apiIssuer) {
    requireAll(
      [
        ["APPLE_API_KEY", apiKey],
        ["APPLE_API_KEY_ID", apiKeyId],
        ["APPLE_API_ISSUER", apiIssuer],
      ],
      "App Store Connect API key",
    );
    return ["--key", apiKey, "--key-id", apiKeyId, "--issuer", apiIssuer];
  }

  const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE;
  if (keychainProfile) {
    const args = ["--keychain-profile", keychainProfile];
    if (process.env.APPLE_KEYCHAIN) args.push("--keychain", process.env.APPLE_KEYCHAIN);
    return args;
  }

  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (appleId || password || teamId) {
    requireAll(
      [
        ["APPLE_ID", appleId],
        ["APPLE_APP_SPECIFIC_PASSWORD", password],
        ["APPLE_TEAM_ID", teamId],
      ],
      "Apple ID",
    );
    return ["--apple-id", appleId, "--password", password, "--team-id", teamId];
  }

  return null;
}

// ============================================================
// Notarization submission + polling
// ============================================================

/**
 * Submit a file (zip, dmg, pkg) to Apple Notary Service and return the
 * submission ID. Recovers from an interrupted submit response by querying
 * notarytool history for a matching entry.
 */
async function submitForNotarization(filePath, submissionName, authorization) {
  const submittedAfter = Date.now();
  try {
    const submission = runNotarytool([
      "submit",
      filePath,
      ...authorization,
      "--output-format",
      "json",
    ]);
    return requireString(submission.id, "submission id");
  } catch (error) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const submissionId = recoverSubmissionId(submissionName, submittedAfter, authorization);
      if (submissionId) {
        console.warn(
          `[notarize] Submit response was interrupted; recovered Submission ID: ${submissionId}`,
        );
        return submissionId;
      }
      if (attempt < 3) await sleep(5_000);
    }
    throw error;
  }
}

function recoverSubmissionId(submissionName, submittedAfter, authorization) {
  try {
    const response = runNotarytool(["history", ...authorization, "--output-format", "json"]);
    if (!Array.isArray(response.history)) return null;
    const matches = response.history.filter((entry) => {
      if (!entry || entry.name !== submissionName || typeof entry.createdDate !== "string") {
        return false;
      }
      const createdAt = Date.parse(entry.createdDate);
      return Number.isFinite(createdAt) && createdAt >= submittedAfter - 5_000;
    });
    if (matches.length !== 1) return null;
    return typeof matches[0].id === "string" ? matches[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Poll notarytool until the submission is Accepted. Throws on rejection or
 * timeout. Tolerates up to MAX_TRANSIENT_FAILURES consecutive network errors.
 */
async function waitForAccepted(submissionId, authorization, tag = "notarize") {
  const timeoutMinutes = readBoundedNumber(
    process.env.APPLE_NOTARIZATION_TIMEOUT_MINUTES,
    DEFAULT_TIMEOUT_MINUTES,
    5,
    180,
  );
  const pollIntervalMs =
    readBoundedNumber(
      process.env.APPLE_NOTARIZATION_POLL_SECONDS,
      DEFAULT_POLL_INTERVAL_MS / 1000,
      5,
      60,
    ) * 1000;
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let transientFailures = 0;
  let lastStatus = "";

  while (Date.now() < deadline) {
    try {
      const info = runNotarytool([
        "info",
        submissionId,
        ...authorization,
        "--output-format",
        "json",
      ]);
      const status = requireString(info.status, "submission status");
      transientFailures = 0;

      if (status !== lastStatus) {
        console.log(`[${tag}] Apple status: ${status}`);
        lastStatus = status;
      }
      if (status === "Accepted") return;
      if (status !== "In Progress" && status !== "Uploaded") {
        const log = fetchNotarizationLog(submissionId, authorization);
        throw new Error(
          `[${tag}] Apple rejected submission ${submissionId} (${status})` +
            `${log ? `\n${log}` : ""}`,
        );
      }
    } catch (error) {
      if (String(error).includes("Apple rejected submission")) throw error;
      transientFailures++;
      if (transientFailures > MAX_TRANSIENT_FAILURES) throw error;
      console.warn(
        `[${tag}] Status check failed (${transientFailures}/${MAX_TRANSIENT_FAILURES}); retrying`,
      );
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `[${tag}] Timed out after ${timeoutMinutes} minutes; submission ${submissionId} is still processing`,
  );
}

function fetchNotarizationLog(submissionId, authorization) {
  try {
    const result = runCommand(
      "xcrun",
      ["notarytool", "log", submissionId, ...authorization],
      "fetch notarization log",
    );
    return result.stdout.trim();
  } catch (error) {
    return `Unable to fetch Apple diagnostics: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ============================================================
// Command execution
// ============================================================

function runNotarytool(args) {
  let result;
  try {
    result = runCommand("xcrun", ["notarytool", ...args], `notarytool ${args[0]}`);
  } catch (error) {
    throw decorateNotarytoolError(error);
  }
  const output = result.stdout.trim();
  if (!output) throw new Error(`[notarize] notarytool ${args[0]} returned empty output`);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`[notarize] notarytool ${args[0]} returned invalid JSON:\n${output}`);
  }
}

/**
 * notarytool 的原始报错只给出 Apple 服务端返回码，不指出处理人与修复入口。
 * 这里对已知错误补充可执行的修复提示；403「协议未签署/过期」需要团队
 * Account Holder 在 App Store Connect 操作，打包机侧无法自动恢复。
 */
function decorateNotarytoolError(error) {
  const message = String(error?.message || error);
  if (message.includes("A required agreement is missing or has expired")) {
    return new Error(
      `${message}\n[notarize] Apple 返回 403：该团队在 App Store Connect 的法律协议未签署或已过期。` +
        "请让团队（Apple Developer Program）的 Account Holder 登录 " +
        "Agreements, Tax, and Banking 接受最新协议后重新打包：" +
        "https://appstoreconnect.apple.com/business#/agreements",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function runCommand(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw new Error(`[notarize] Could not ${label}: ${result.error.message}`);
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const termination =
      result.status === null ? `signal ${result.signal ?? "unknown"}` : `exit ${result.status}`;
    throw new Error(
      `[notarize] Failed to ${label} (${termination})${details ? `:\n${details}` : ""}`,
    );
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// ============================================================
// Small utilities
// ============================================================

function requireAll(entries, label) {
  const missing = entries.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`[notarize] Incomplete ${label} credentials; missing ${missing.join(", ")}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value) throw new Error(`[notarize] Missing ${label}`);
  return value;
}

function readBoundedNumber(raw, fallback, min, max) {
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  resolveAuthorizationArgs,
  submitForNotarization,
  waitForAccepted,
  fetchNotarizationLog,
  runNotarytool,
  runCommand,
  requireAll,
  requireString,
  readBoundedNumber,
  sleep,
};
