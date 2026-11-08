/**
 * macOS signer that preserves electron-builder's resolved identity hash and
 * handles native binaries that fail with errSecInternalComponent during the
 * standard @electron/osx-sign bulk pass.
 *
 * electron-builder 26.7 resolves a certificate to a unique SHA-1 hash, but its
 * default signing path passes the certificate name to @electron/osx-sign. When
 * the same certificate exists in multiple keychains, codesign rejects that
 * name as ambiguous. A custom signer receives the already-resolved hash and
 * can pass it through unchanged.
 *
 * Additionally, prebuilt/rebuilt .node N-API addons and native helper
 * executables (e.g. node-pty's spawn-helper) may fail with
 * errSecInternalComponent when signed with --options runtime (hardened
 * runtime) in the bulk pass. These are excluded from the bulk pass via
 * signIgnore and signed individually beforehand with progressive fallback
 * (hardened runtime + entitlements -> hardened runtime -> basic signing).
 * They must be signed before the bulk pass so the main bundle's CodeResources
 * seal is computed over their final signed bytes -- signing them afterward
 * mutates the files and breaks the seal, which @electron/notarize's pre-flight
 * codesign --verify rejects.
 */

const { createRequire } = require("node:module");
// 修复依据：Bun isolated 布局不会把 electron-builder 的传递依赖提升到 Desktop 根目录。
// 从 electron-builder 的安装位置解析其 app-builder-lib，确保 hook 与 builder 使用同一版本。
const requireFromElectronBuilder = createRequire(require.resolve("electron-builder/package.json"));
const { sign } = requireFromElectronBuilder("app-builder-lib/out/codeSign/macCodeSign");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// File-path regex patterns excluded from the bulk @electron/osx-sign pass
// because they fail there with errSecInternalComponent. They are signed
// individually beforehand with progressive fallback (see below).
const INDIVIDUALLY_SIGNED_PATTERNS = ["\\.node$", "spawn-helper$"];

module.exports = async function signMacWithResolvedIdentity(options) {
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    console.log("[sign] Skipped because CSC_IDENTITY_AUTO_DISCOVERY=false");
    return;
  }
  if (!options.identity) throw new Error("macOS signing identity was not resolved");

  // SSH/non-GUI sessions don't auto-unlock the login keychain, and it
  // re-locks on idle timeout -- which makes codesign fail with
  // errSecInternalComponent. When MACOS_KEYCHAIN_PASSWORD is provided, unlock
  // the keychain before signing so SSH builds work without a manual
  // `security unlock-keychain` every session. No-op otherwise (CI uses
  // CSC_LINK's isolated keychain; GUI builds are already unlocked).
  prepareKeychain();

  // Skip individually-signed binaries during the bulk @electron/osx-sign
  // pass -- they are signed individually beforehand with progressive
  // fallback strategies.
  if (!Array.isArray(options.signIgnore)) options.signIgnore = [];
  for (const pattern of INDIVIDUALLY_SIGNED_PATTERNS) {
    if (!options.signIgnore.includes(pattern)) options.signIgnore.push(pattern);
  }

  // Sign individually-handled binaries BEFORE the bulk pass. The bulk pass
  // seals the main bundle's CodeResources over every resource (including
  // signIgnore'd files), so these binaries must already be in their final
  // signed state when the seal is computed. Signing them afterward would
  // mutate the files and break the seal ("a sealed resource is missing or
  // invalid" / "file modified"), which @electron/notarize's pre-flight
  // `codesign --verify --deep --strict` rejects.
  signNativeBinariesIndividually(options);

  await signBulkPass(options);

  // Apple 公证会扫描 DMG 内的每一个 Mach-O，任何一个缺 Developer ID 签名 / 安全时间戳 /
  // hardened runtime 都会让整轮公证（约 10 分钟）被拒。bulk pass 之后在这里做一次
  // 本地 pre-flight 验收，把这类失败从“公证阶段远端拒绝”提前到“签名阶段本地即时失败”。
  verifyBundleSignedForNotarization(options.app);
};

// Run the bulk @electron/osx-sign pass. errSecInternalComponent here (often
// seen on stock Electron binaries like chrome_crashpad_handler) almost always
// means the Developer ID private key is not accessible to codesign
// non-interactively -- a locked keychain or an ACL that requires a GUI prompt
// (e.g. building over SSH). Surface a targeted hint before rethrowing so the
// real cause is not mistaken for a per-binary signing defect.
async function signBulkPass(options) {
  try {
    await sign(options);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("errSecInternalComponent")) {
      console.error(
        "[sign-macos] errSecInternalComponent in the bulk pass usually means the Developer ID " +
          "private key is not accessible to codesign non-interactively (locked keychain or an " +
          "ACL requiring a GUI prompt, e.g. over SSH). Fix once on the build host:\n" +
          "  security unlock-keychain ~/Library/Keychains/login.keychain-db\n" +
          "  security set-key-partition-list -S apple-tool:,apple: -s ~/Library/Keychains/login.keychain-db\n" +
          "or build with CSC_LINK/CSC_KEY_PASSWORD (p12) so electron-builder uses an isolated keychain.",
      );
    }
    throw err;
  }
}

// ============================================================
// Native binary signing with progressive fallback
// ============================================================

function signNativeBinariesIndividually(options) {
  const appPath = options.app;
  const identity = resolveIdentity(options.identity);
  const entitlements = resolveEntitlementsPath(options.entitlements);

  // 修复原因：`.node` 被 INDIVIDUALLY_SIGNED_PATTERNS 从 bulk pass 里排除，只在这里补签。
  // 但本函数原先只扫 app.asar.unpacked，而 resources/glm（prepare:agent-bundle staging 出来的
  // agent 运行时资产）里的原生依赖完全落在签名盲区：bulk pass 跳过它、这里又不看它，
  // 于是 CUA 的 koffi.node 以未签名状态进包，公证 pre-flight 直接判
  // "not signed with a valid Developer ID certificate; ... no secure timestamp; ... no hardened
  // runtime"。glm 与 asar.unpacked 一样是额外资源目录，同属 bulk pass 的 seal 范围，
  // 所以必须同样在 bulk 之前签完。
  const resourceRoot = path.join(appPath, "Contents", "Resources");
  const signingRoots = [
    path.join(resourceRoot, "app.asar.unpacked"),
    path.join(resourceRoot, "glm"),
  ].filter((root) => fs.existsSync(root));
  if (signingRoots.length === 0) return;

  const targets = signingRoots.flatMap((root) => collectIndividuallySignedBinaries(root));
  if (targets.length === 0) return;

  const strategies = buildSigningStrategies(entitlements);
  let signed = 0;
  let failed = 0;

  for (const file of targets) {
    const label = signWithFallback(file, identity, strategies);
    if (label) {
      console.log(`[sign-macos] Signed ${path.basename(file)} (${label})`);
      signed++;
    } else {
      console.warn(`[sign-macos] WARNING: Could not sign ${path.basename(file)}`);
      failed++;
    }
  }

  if (signed > 0 || failed > 0) {
    console.log(`[sign-macos] Native binary signing: ${signed} signed, ${failed} failed`);
  }
}

// Collect every binary excluded from the bulk pass that must be signed
// individually: N-API .node addons plus every node-pty spawn-helper executable
// (build/Release and each prebuilds/darwin-* slice -- all Mach-O, no .node
// extension, so they are located by name rather than extension).
// root 可以是 app.asar.unpacked，也可以是 resources/glm：两者都可能有 .node。
// spawn-helper 的查找起点不一定存在（resources/glm 下没有顶层 node_modules），
// findFilesByName 的 walk 不吞 ENOENT，所以先确认再进。
function collectIndividuallySignedBinaries(root) {
  const targets = findFilesByExtension(root, ".node");
  const nodeModulesDir = path.join(root, "node_modules");
  if (fs.existsSync(nodeModulesDir)) {
    for (const helper of findFilesByName(nodeModulesDir, "spawn-helper")) {
      targets.push(helper);
    }
  }
  return targets;
}

function buildSigningStrategies(entitlements) {
  const strategies = [];
  // Strategy 1: hardened runtime + entitlements (strictest, required for notarization)
  if (entitlements) {
    strategies.push({
      label: "runtime+entitlements",
      args: ["--options", "runtime", "--entitlements", entitlements],
    });
  }
  // Strategy 2: hardened runtime only (entitlements not needed for dylibs --
  // the main executable's disable-library-validation covers runtime loading)
  strategies.push({
    label: "runtime",
    args: ["--options", "runtime"],
  });
  // Strategy 3: basic signing without hardened runtime (last resort for
  // binaries whose Mach-O structure is incompatible with --options runtime)
  strategies.push({
    label: "basic",
    args: [],
  });
  return strategies;
}

function signWithFallback(file, identity, strategies) {
  for (const strategy of strategies) {
    try {
      execFileSync(
        "codesign",
        ["--sign", identity, "--force", "--timestamp", ...strategy.args, file],
        {
          stdio: "pipe",
          encoding: "utf-8",
        },
      );
      return strategy.label;
    } catch (err) {
      const stderr = String(err.stderr || "");
      // Log non-errSecInternalComponent errors for diagnosis
      if (!stderr.includes("errSecInternalComponent")) {
        console.warn(`[sign-macos] "${strategy.label}" failed: ${stderr.trim()}`);
      }
    }
  }
  return null;
}

// ============================================================
// Helpers
// ============================================================

function prepareKeychain() {
  if (process.platform !== "darwin") return;
  const password = process.env.MACOS_KEYCHAIN_PASSWORD;
  if (!password) return;
  const keychain =
    process.env.MACOS_KEYCHAIN || path.join(os.homedir(), "Library/Keychains/login.keychain-db");
  if (!fs.existsSync(keychain)) {
    console.warn(`[sign-macos] MACOS_KEYCHAIN_PASSWORD set but keychain not found: ${keychain}`);
    return;
  }
  try {
    execFileSync("security", ["unlock-keychain", "-p", password, keychain], { stdio: "pipe" });
    console.log(`[sign-macos] Unlocked keychain: ${keychain}`);
  } catch (err) {
    const stderr = String(err.stderr || err.message || "");
    console.warn(`[sign-macos] Keychain unlock failed: ${stderr.trim()}`);
  }
}

function resolveIdentity(identity) {
  if (typeof identity === "string") return identity;
  if (identity && typeof identity === "object")
    return identity.hash || identity.name || String(identity);
  return String(identity);
}

function resolveEntitlementsPath(entitlements) {
  if (!entitlements) return null;
  if (path.isAbsolute(entitlements) && fs.existsSync(entitlements)) return entitlements;
  const fromCwd = path.resolve(entitlements);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return null;
}

function findFilesByExtension(dir, ext) {
  const results = [];
  function walk(d) {
    // 打包产物里可能含符号链接与权限异常的目录；扫描只为补签，不该因个别目录读不到而中断整轮签名。
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith(ext)) results.push(fullPath);
    }
  }
  walk(dir);
  return results;
}

function findFilesByName(dir, name) {
  const results = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name === name) results.push(fullPath);
    }
  }
  walk(dir);
  return results;
}

// ============================================================
// Notarization pre-flight: every Mach-O must be release-signable
// ============================================================

const MACH_O_MAGICS = new Set([
  "feedface",
  "feedfacf",
  "cafebabe",
  "cafebabf",
  "cffaedfe",
  "cefaedfe",
  "bebafeca",
  "bfbafeca",
]);

function isMachOFile(filePath) {
  let magic;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(4);
      const read = fs.readSync(fd, buffer, 0, 4, 0);
      if (read < 4) return false;
      magic = buffer.toString("hex");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
  return MACH_O_MAGICS.has(magic);
}

/**
 * 校验单个 Mach-O 的 codesign -dvv 输出是否满足 Apple 公证要求：
 * Developer ID 签名 + 团队标识 + 安全时间戳 + hardened runtime。
 * 返回失败原因数组；空数组表示合格。
 */
function machoNotarizationDefects(displayOutput) {
  const defects = [];
  if (!displayOutput.includes("Authority=Developer ID Application:")) {
    defects.push("not signed with a valid Developer ID certificate");
  }
  if (/TeamIdentifier=not set\b/.test(displayOutput)) {
    defects.push("signature is not bound to a team identifier");
  }
  if (!/^Timestamp=\S+/m.test(displayOutput) || /^Timestamp=unavailable\b/m.test(displayOutput)) {
    defects.push("signature does not include a secure timestamp");
  }
  // codesign 在 flags 括号里列出全部标志名（如 0x10000(runtime)、0x21002(adhoc,linker-signed,runtime)）。
  if (!/\bflags=0x[0-9a-f]+\([^)]*\bruntime\b[^)]*\)/.test(displayOutput)) {
    defects.push("executable does not have the hardened runtime enabled");
  }
  return defects;
}

function verifyBundleSignedForNotarization(appPath) {
  const failures = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // 符号链接不重复检查：目标文件会在自身所在目录被扫到。
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isMachOFile(fullPath)) {
        // codesign -dvv 的签名详情输出在 stderr；未签名时退出码非 0。
        const result = spawnSync("codesign", ["-dvv", fullPath], { encoding: "utf8" });
        const displayOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
        const defects = machoNotarizationDefects(displayOutput);
        if (defects.length === 0 && result.status !== 0) {
          defects.push(`codesign -dvv exited with ${result.status}`);
        }
        if (defects.length > 0) {
          failures.push({ file: path.relative(appPath, fullPath), defects });
        }
      }
    }
  };

  walk(appPath);
  if (failures.length > 0) {
    const details = failures
      .map((failure) => `- ${failure.file}\n    ${failure.defects.join("; ")}`)
      .join("\n");
    throw new Error(
      `[sign-macos] ${failures.length} Mach-O file(s) are not release-signable; ` +
        "Apple notarization would reject the submission:\n" +
        details,
    );
  }
  console.log(
    "[sign-macos] Notarization pre-flight passed: every Mach-O is Developer ID signed with timestamp and hardened runtime",
  );
}

// Exported for tests.
module.exports.machoNotarizationDefects = machoNotarizationDefects;
module.exports.isMachOFile = isMachOFile;
module.exports.verifyBundleSignedForNotarization = verifyBundleSignedForNotarization;
