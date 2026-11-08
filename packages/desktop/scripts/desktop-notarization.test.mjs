import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveMacNotarizationEnvironment,
  verifyLatestMacYmlDmgEntry,
  verifyNotarizedMacDistribution,
} from "./desktop-notarization.mjs";

test("notarization accepts a complete App Store Connect API key triple", () => {
  const resolved = resolveMacNotarizationEnvironment({
    APPLE_API_KEY: "AuthKey_XXXX.p8",
    APPLE_API_KEY_ID: "XXXX12345",
    APPLE_API_ISSUER: "11111111-2222-3333-4444-555555555555",
  });

  assert.equal(resolved.source, "notarization-api-key");
  assert.deepEqual(resolved.envPatch, {});
});

test("notarization rejects an incomplete API key triple", () => {
  assert.throws(
    () =>
      resolveMacNotarizationEnvironment({
        APPLE_API_KEY: "AuthKey_XXXX.p8",
        APPLE_API_ISSUER: "11111111-2222-3333-4444-555555555555",
      }),
    /APPLE_API_KEY、APPLE_API_KEY_ID 与 APPLE_API_ISSUER/u,
  );
});

test("notarization accepts a notarytool keychain profile", () => {
  const resolved = resolveMacNotarizationEnvironment({
    APPLE_KEYCHAIN_PROFILE: "kayingcode-release",
  });

  assert.equal(resolved.source, "notarization-keychain-profile");
});

test("notarization prefers the keychain profile over Apple ID credentials", () => {
  // 优先级必须与 notarize-helpers.resolveAuthorizationArgs 一致：
  // API key > 钥匙串 profile > Apple ID，否则预校验结论与公证 hook 实际使用的凭据脱节。
  const resolved = resolveMacNotarizationEnvironment({
    APPLE_KEYCHAIN_PROFILE: "kayingcode-release",
    APPLE_ID: "release@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "abcd-efgh-ijkl-mnop",
    APPLE_TEAM_ID: "9282PYW347",
  });

  assert.equal(resolved.source, "notarization-keychain-profile");
});

test("notarization accepts a complete app-specific password triple", () => {
  const resolved = resolveMacNotarizationEnvironment({
    APPLE_ID: "release@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "abcd-efgh-ijkl-mnop",
    APPLE_TEAM_ID: "9282PYW347",
  });

  assert.equal(resolved.source, "notarization-app-specific-password");
});

test("notarization rejects an incomplete app-specific password triple", () => {
  assert.throws(
    () =>
      resolveMacNotarizationEnvironment({
        APPLE_ID: "release@example.com",
      }),
    /APPLE_ID、APPLE_APP_SPECIFIC_PASSWORD 与 APPLE_TEAM_ID/u,
  );
});

test("notarization is enabled by default and fails closed without credentials", () => {
  assert.throws(() => resolveMacNotarizationEnvironment({}), /KAYINGCODE_ENABLE_MAC_NOTARIZE=0/u);
});

test("notarization keeps an explicit opt-out", () => {
  const resolved = resolveMacNotarizationEnvironment({
    KAYINGCODE_ENABLE_MAC_NOTARIZE: "0",
    APPLE_ID: "release@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "abcd-efgh-ijkl-mnop",
    APPLE_TEAM_ID: "9282PYW347",
  });

  assert.equal(resolved.source, "notarization-disabled");
});

test("notarization rejects an invalid opt-out value", () => {
  assert.throws(
    () => resolveMacNotarizationEnvironment({ KAYINGCODE_ENABLE_MAC_NOTARIZE: "yes" }),
    /invalid KAYINGCODE_ENABLE_MAC_NOTARIZE/u,
  );
});

const DEVELOPER_ID_DISPLAY_OUTPUT = [
  "Executable=/tmp/KayingCode.app/Contents/MacOS/KayingCode",
  "Identifier=com.lingdian.kayingai.agent.code",
  "Authority=Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)",
  "Authority=Developer ID Certification Authority",
  "Authority=Apple Root CA",
  "TeamIdentifier=9282PYW347",
  "flags=0x10000(runtime)",
].join("\n");

function createCaptureStub(results) {
  const calls = [];
  return {
    calls,
    captureCommand(command, args) {
      calls.push({ command, args });
      const result = results.shift();
      if (!result) {
        throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      }
      return result;
    },
  };
}

test("verifyNotarizedMacDistribution passes for a signed app and a stapled DMG", () => {
  const { captureCommand, calls } = createCaptureStub([
    { status: 0, stdout: "", stderr: DEVELOPER_ID_DISPLAY_OUTPUT },
    { status: 0, stdout: "", stderr: DEVELOPER_ID_DISPLAY_OUTPUT },
    { status: 0, stdout: "The validate action worked!", stderr: "" },
  ]);

  verifyNotarizedMacDistribution({
    appPath: "/tmp/KayingCode.app",
    dmgPath: "/tmp/KayingCode.dmg",
    captureCommand,
  });

  assert.deepEqual(
    calls.map((call) => call.command),
    ["codesign", "codesign", "xcrun"],
  );
  assert.deepEqual(calls[2].args, ["stapler", "validate", "/tmp/KayingCode.dmg"]);
});

test("verifyNotarizedMacDistribution rejects an unsigned app", () => {
  const { captureCommand } = createCaptureStub([
    { status: 1, stdout: "", stderr: "code object is not signed at all" },
  ]);

  assert.throws(
    () =>
      verifyNotarizedMacDistribution({
        appPath: "/tmp/KayingCode.app",
        dmgPath: "/tmp/KayingCode.dmg",
        captureCommand,
      }),
    /缺少 Developer ID 签名/u,
  );
});

test("verifyNotarizedMacDistribution rejects an app whose display output claims no team identifier", () => {
  const { captureCommand } = createCaptureStub([
    {
      status: 0,
      stdout: "",
      stderr: [
        "Executable=/tmp/KayingCode.app/Contents/MacOS/KayingCode",
        "Identifier=com.lingdian.kayingai.agent.code",
        "Authority=Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)",
        "TeamIdentifier=not set",
      ].join("\n"),
    },
  ]);

  assert.throws(
    () =>
      verifyNotarizedMacDistribution({
        appPath: "/tmp/KayingCode.app",
        dmgPath: "/tmp/KayingCode.dmg",
        captureCommand,
      }),
    /未绑定正式签名团队/u,
  );
});

test("verifyNotarizedMacDistribution rejects an unstapled DMG", () => {
  const { captureCommand } = createCaptureStub([
    { status: 0, stdout: "", stderr: DEVELOPER_ID_DISPLAY_OUTPUT },
    { status: 0, stdout: "", stderr: DEVELOPER_ID_DISPLAY_OUTPUT },
    { status: 65, stdout: "/tmp/KayingCode.dmg does not have a ticket stapled to it.", stderr: "" },
  ]);

  assert.throws(
    () =>
      verifyNotarizedMacDistribution({
        appPath: "/tmp/KayingCode.app",
        dmgPath: "/tmp/KayingCode.dmg",
        captureCommand,
      }),
    /缺少公证 staple 票据/u,
  );
});

test("verifyNotarizedMacDistribution skips DMG notarization when explicitly disabled", () => {
  const { captureCommand, calls } = createCaptureStub([
    { status: 0, stdout: "", stderr: DEVELOPER_ID_DISPLAY_OUTPUT },
  ]);

  verifyNotarizedMacDistribution({
    appPath: "/tmp/KayingCode.app",
    dmgPath: "/tmp/KayingCode.dmg",
    requireDmgNotarization: false,
    captureCommand,
  });

  assert.equal(calls.length, 1);
});

test("verifyLatestMacYmlDmgEntry passes when the yml matches the re-signed DMG", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kayingcode-notarize-"));
  try {
    const dmgPath = join(dir, "KayingCode-3.15.0.dmg");
    const dmgBytes = Buffer.from("signed-dmg-bytes");
    await writeFile(dmgPath, dmgBytes);
    const ymlPath = join(dir, "latest-mac.yml");
    await writeFile(
      ymlPath,
      [
        "version: 3.15.0",
        "files:",
        "  - url: KayingCode-3.15.0.dmg",
        `    sha512: ${createHash("sha512").update(dmgBytes).digest("base64")}`,
        `    size: ${dmgBytes.length}`,
        "  - url: KayingCode-3.15.0-mac-arm64.zip",
        "    sha512: unused",
        "    size: 1",
        "path: KayingCode-3.15.0-mac-arm64.zip",
      ].join("\n"),
      "utf8",
    );

    verifyLatestMacYmlDmgEntry({ dmgPath, ymlPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyLatestMacYmlDmgEntry rejects a stale yml entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kayingcode-notarize-"));
  try {
    const dmgPath = join(dir, "KayingCode-3.15.0.dmg");
    await writeFile(dmgPath, "re-signed-dmg-bytes");
    const ymlPath = join(dir, "latest-mac.yml");
    const staleBytes = Buffer.from("pre-signing-bytes");
    await writeFile(
      ymlPath,
      [
        "version: 3.15.0",
        "files:",
        "  - url: KayingCode-3.15.0.dmg",
        `    sha512: ${createHash("sha512").update(staleBytes).digest("base64")}`,
        `    size: ${staleBytes.length}`,
        "path: KayingCode-3.15.0.dmg",
      ].join("\n"),
      "utf8",
    );

    assert.throws(() => verifyLatestMacYmlDmgEntry({ dmgPath, ymlPath }), /回写未生效/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyLatestMacYmlDmgEntry rejects a missing DMG entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kayingcode-notarize-"));
  try {
    const dmgPath = join(dir, "KayingCode-3.15.0.dmg");
    await writeFile(dmgPath, "bytes");
    const ymlPath = join(dir, "latest-mac.yml");
    await writeFile(ymlPath, "version: 3.15.0\nfiles: []\n", "utf8");

    assert.throws(() => verifyLatestMacYmlDmgEntry({ dmgPath, ymlPath }), /缺少 DMG 条目/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
