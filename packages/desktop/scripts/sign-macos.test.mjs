import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  isMachOFile,
  machoNotarizationDefects,
  verifyBundleSignedForNotarization,
} = require("./sign-macos.cjs");

const RELEASE_SIGNED_DISPLAY = [
  "Executable=/tmp/KayingCode.app/Contents/MacOS/KayingCode",
  "Identifier=com.lingdian.kayingai.agent.code",
  "Format=Mach-O thin (arm64)",
  "CodeDirectory v=20500 size=548 flags=0x10000(runtime) hashes=6+7 location=embedded",
  "Authority=Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)",
  "Authority=Developer ID Certification Authority",
  "Authority=Apple Root CA",
  "Timestamp=Oct 3, 2026 at 22:25:00",
  "TeamIdentifier=9282PYW347",
].join("\n");

test("machoNotarizationDefects accepts a Developer ID signature with timestamp and runtime", () => {
  assert.deepEqual(machoNotarizationDefects(RELEASE_SIGNED_DISPLAY), []);
});

test("machoNotarizationDefects mirrors Apple's rejection reasons for an ad-hoc binary", () => {
  const defects = machoNotarizationDefects(
    [
      "Executable=/tmp/build-script-build",
      "Identifier=kaying_for_taptap_core-073a17836e3d2d2f",
      "CodeDirectory v=20400 size=27400 flags=0x20002(adhoc,linker-signed) hashes=852+0 location=embedded",
      "Signature=adhoc",
      "TeamIdentifier=not set",
    ].join("\n"),
  );

  assert.deepEqual(defects, [
    "not signed with a valid Developer ID certificate",
    "signature is not bound to a team identifier",
    "signature does not include a secure timestamp",
    "executable does not have the hardened runtime enabled",
  ]);
});

test("machoNotarizationDefects rejects a Developer ID signature without a secure timestamp", () => {
  const defects = machoNotarizationDefects(
    RELEASE_SIGNED_DISPLAY.replace("Timestamp=Oct 3, 2026 at 22:25:00\n", ""),
  );

  assert.deepEqual(defects, ["signature does not include a secure timestamp"]);
});

test("machoNotarizationDefects accepts runtime alongside other flags", () => {
  const display = RELEASE_SIGNED_DISPLAY.replace(
    "flags=0x10000(runtime)",
    "flags=0x21002(adhoc,linker-signed,runtime)",
  );

  assert.deepEqual(machoNotarizationDefects(display), []);
});

test("isMachOFile detects Mach-O magic and ignores non-executables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kayingcode-sign-preflight-"));
  try {
    const machoPath = join(dir, "binary");
    await writeFile(machoPath, Buffer.from("cffaedfe07000001", "hex"));
    const textPath = join(dir, "script.js");
    await writeFile(textPath, "console.log(1)");

    assert.equal(isMachOFile(machoPath), true);
    assert.equal(isMachOFile(textPath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyBundleSignedForNotarization passes a fully signed bundle and fails on ad-hoc residue", async () => {
  const appRoot = await mkdtemp(join(tmpdir(), "kayingcode-sign-preflight-bundle-"));
  try {
    const macosDir = join(appRoot, "Contents", "MacOS");
    await mkdir(macosDir, { recursive: true });
    await writeFile(join(macosDir, "KayingCode"), Buffer.from("cffaedfe07000001", "hex"));

    // 打桩 codesign：让所有 Mach-O 都返回合格输出，验证 walk 与判定闭环。
    const originalPath = process.env.PATH;
    const stubDir = join(appRoot, "..", "codesign-stub");
    await mkdir(stubDir, { recursive: true });
    await writeFile(
      join(stubDir, "codesign"),
      [
        "#!/bin/sh",
        'if [ "$1" = "-dvv" ]; then',
        "  cat <<'EOF' >&2",
        "Authority=Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)",
        "TeamIdentifier=9282PYW347",
        "Timestamp=Oct 3, 2026 at 22:25:00",
        "flags=0x10000(runtime)",
        "EOF",
        "  exit 0",
        "fi",
        "exit 0",
      ].join("\n"),
      { mode: 0o755 },
    );
    process.env.PATH = `${stubDir}:${originalPath}`;
    try {
      verifyBundleSignedForNotarization(appRoot);

      await writeFile(join(macosDir, "residue"), Buffer.from("cffaedfe07000001", "hex"));
      await writeFile(
        join(stubDir, "codesign"),
        [
          "#!/bin/sh",
          'if [ "$1" = "-dvv" ]; then',
          "  cat <<'EOF' >&2",
          "Signature=adhoc",
          "TeamIdentifier=not set",
          "EOF",
          "  exit 0",
          "fi",
          "exit 0",
        ].join("\n"),
        { mode: 0o755 },
      );
      assert.throws(
        () => verifyBundleSignedForNotarization(appRoot),
        /not release-signable.*residue/su,
      );
    } finally {
      process.env.PATH = originalPath;
    }
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});
