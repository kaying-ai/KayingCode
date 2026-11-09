/**
 * electron-builder afterAllArtifactBuild hook -- "方案 B" DMG distribution.
 *
 * Instead of notarizing the .app separately (electron-builder's built-in
 * `notarize: true`), this hook runs AFTER all artifacts are built and:
 *   1. Signs each .dmg with the Developer ID Application certificate.
 *   2. Submits the signed .dmg to Apple Notary Service (Apple scans every
 *      binary inside the DMG, including the .app).
 *   3. Staples the notarization ticket to the .dmg.
 *   4. Removes the stale .dmg.blockmap (signing invalidated it).
 *
 * The .app itself is signed during electron-builder's pack phase (via
 * scripts/sign-macos.cjs) but is NOT individually notarized. The entire
 * distribution chain is validated through the DMG notarization, which is the
 * recommended approach for direct website distribution.
 *
 * latest-mac.yml fixup: electron-builder writes latest-mac.yml AFTER
 * afterAllArtifactBuild, using the pre-signing DMG hash/size. We register a
 * process 'exit' handler to re-write the DMG entry with the signed DMG's
 * actual hash/size once electron-builder has finished all I/O.
 *
 * Wire-up: set `afterAllArtifactBuild: "scripts/notarize-dmg.cjs"` and
 * `mac.notarize: false` in electron-builder.config.js (方案 B，迁移自 KayingCodex).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const yaml = require("js-yaml");
const {
  resolveAuthorizationArgs,
  submitForNotarization,
  waitForAccepted,
  runCommand,
  runCommandWithRetry,
} = require("./notarize-helpers.cjs");

// ============================================================
// Module-level state for the exit-time latest-mac.yml fixup
// ============================================================

const processedDmgs = [];
let outDir = null;

// electron-builder writes latest-mac.yml AFTER afterAllArtifactBuild returns,
// overwriting any hash/size we set during the hook. The 'exit' event fires
// synchronously after all of electron-builder's I/O is done, so we fix up
// latest-mac.yml there. This MUST be synchronous (no async/await).
process.once("exit", () => {
  if (processedDmgs.length === 0 || !outDir) return;
  try {
    fixupLatestMacYml(outDir, processedDmgs);
  } catch (err) {
    console.warn(`[notarize-dmg] latest-mac.yml fixup failed: ${err.message}`);
  }
});

// ============================================================
// Hook entry point
// ============================================================

module.exports = async function notarizeDmg(context) {
  if (process.platform !== "darwin") return;

  const dmgPaths = (context.artifactPaths || []).filter((p) => p.endsWith(".dmg"));
  if (dmgPaths.length === 0) return;

  if (process.env.APPLE_NOTARIZATION_SKIP === "true") {
    console.log("[notarize-dmg] Skipped because APPLE_NOTARIZATION_SKIP=true");
    return;
  }
  if (process.env.KAYINGCODE_ENABLE_MAC_NOTARIZE === "0") {
    console.log(
      "[notarize-dmg] Skipped because KAYINGCODE_ENABLE_MAC_NOTARIZE=0 (DMG signed only)",
    );
    return;
  }
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log(
      "[notarize-dmg] Skipped because CSC_IDENTITY_AUTO_DISCOVERY=false (unsigned build)",
    );
    return;
  }

  const authorization = resolveAuthorizationArgs();
  if (!authorization) {
    console.log("[notarize-dmg] No Apple credentials found; keeping DMG signed only");
    return;
  }

  const identity = resolveDeveloperIdIdentity();
  if (!identity) {
    console.warn(
      "[notarize-dmg] No Developer ID Application identity found; skipping DMG signing + notarization",
    );
    return;
  }

  outDir = context.outDir;
  prepareKeychain();

  for (const dmgPath of dmgPaths) {
    const label = path.basename(dmgPath);
    console.log(`\n[notarize-dmg] Processing ${label}`);

    signDmg(dmgPath, identity);
    console.log(`[notarize-dmg] Signed ${label} with Developer ID Application`);

    const submissionId = await submitForNotarization(dmgPath, label, authorization);
    console.log(`[notarize-dmg] Submission ID: ${submissionId}`);

    await waitForAccepted(submissionId, authorization, "notarize-dmg");

    runCommand("xcrun", ["stapler", "staple", dmgPath], "staple ticket to DMG");
    await runCommandWithRetry(
      runCommand,
      "xcrun",
      ["stapler", "validate", dmgPath],
      "validate stapled ticket",
    );
    console.log(`[notarize-dmg] Notarization ticket stapled to ${label}`);

    deleteStaleBlockmap(dmgPath);
    processedDmgs.push(dmgPath);
  }

  console.log("[notarize-dmg] All DMGs signed, notarized, and stapled");
};

// ============================================================
// DMG signing
// ============================================================

function signDmg(dmgPath, identity) {
  execFileSync("codesign", ["--sign", identity, "--force", "--timestamp", dmgPath], {
    stdio: "pipe",
    encoding: "utf-8",
  });
}

// ============================================================
// Post-signing metadata fixup (runs at process exit)
// ============================================================

/**
 * Recompute sha512/size for each signed DMG and update latest-mac.yml.
 * Called synchronously from the 'exit' handler, AFTER electron-builder has
 * written latest-mac.yml with the stale (pre-signing) DMG hash/size.
 */
function fixupLatestMacYml(dir, dmgPaths) {
  const ymlPath = path.join(dir, "latest-mac.yml");
  if (!fs.existsSync(ymlPath)) {
    console.warn("[notarize-dmg] latest-mac.yml not found; skipping hash/size fixup");
    return;
  }

  const doc = yaml.load(fs.readFileSync(ymlPath, "utf-8"));
  if (!doc || !Array.isArray(doc.files)) {
    console.warn("[notarize-dmg] latest-mac.yml has no files array; skipping fixup");
    return;
  }

  let updatedCount = 0;
  for (const dmgPath of dmgPaths) {
    const dmgFilename = path.basename(dmgPath);
    const newSha512 = computeSha512Base64(dmgPath);
    const newSize = fs.statSync(dmgPath).size;

    for (const entry of doc.files) {
      if (entry.url !== dmgFilename) continue;
      entry.sha512 = newSha512;
      entry.size = newSize;
      updatedCount++;
      console.log(
        `[notarize-dmg] Fixed latest-mac.yml entry for ${dmgFilename} ` +
          `(size: ${newSize}, sha512: ${newSha512.slice(0, 16)}...)`,
      );
      break;
    }
  }

  if (updatedCount > 0) {
    const output = yaml.dump(doc, { lineWidth: -1, quotingType: "'" });
    fs.writeFileSync(ymlPath, output);
    console.log(`[notarize-dmg] latest-mac.yml updated (${updatedCount} DMG entry/entries fixed)`);
  }
}

function deleteStaleBlockmap(dmgPath) {
  const blockmapPath = `${dmgPath}.blockmap`;
  if (fs.existsSync(blockmapPath)) {
    fs.unlinkSync(blockmapPath);
    console.log(`[notarize-dmg] Removed stale blockmap: ${path.basename(blockmapPath)}`);
  }
}

function computeSha512Base64(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha512").update(data).digest("base64");
}

// ============================================================
// Identity resolution
// ============================================================

/**
 * Resolve a Developer ID Application code-signing identity (hash preferred).
 * Priority: CSC_NAME / APPLE_SIGNING_IDENTITY env var -> keychain search via
 * `security find-identity`. APPLE_SIGNING_IDENTITY 由 KayingCode 打包链
 * （desktop-code-signing.mjs 钥匙串探测）写入，CSC_NAME 是 KayingCodex CI 契约。
 * Returns the identity string (name or SHA-1 hash), or null if none found.
 */
function resolveDeveloperIdIdentity() {
  const envName = process.env.CSC_NAME ?? process.env.APPLE_SIGNING_IDENTITY;
  if (envName) return envName;

  try {
    const output = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return parseDeveloperIdIdentity(output);
  } catch {
    return null;
  }
}

/**
 * Parse `security find-identity -v -p codesigning` output and return the hash
 * of the first "Developer ID Application" identity. Each line looks like:
 *   1) 7CE321D2... "Developer ID Application: Company Name (TEAMID)"
 */
function parseDeveloperIdIdentity(output) {
  const lines = output.split("\n");
  for (const line of lines) {
    if (!line.includes("Developer ID Application")) continue;
    const match = line.match(/\b([0-9A-Fa-f]{40})\b/);
    if (match) return match[1];
  }
  return null;
}

// ============================================================
// Keychain preparation (mirrors sign-macos.cjs)
// ============================================================

function prepareKeychain() {
  if (process.platform !== "darwin") return;
  const password = process.env.MACOS_KEYCHAIN_PASSWORD;
  if (!password) return;
  const keychain =
    process.env.MACOS_KEYCHAIN || path.join(os.homedir(), "Library/Keychains/login.keychain-db");
  if (!fs.existsSync(keychain)) {
    console.warn(`[notarize-dmg] MACOS_KEYCHAIN_PASSWORD set but keychain not found: ${keychain}`);
    return;
  }
  try {
    execFileSync("security", ["unlock-keychain", "-p", password, keychain], { stdio: "pipe" });
    console.log(`[notarize-dmg] Unlocked keychain: ${keychain}`);
  } catch (err) {
    const stderr = String(err.stderr || err.message || "");
    console.warn(`[notarize-dmg] Keychain unlock failed: ${stderr.trim()}`);
  }
}
