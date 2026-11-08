import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  findMacDeveloperIdKeychainIdentity,
  loadDesktopCodeSigningEnvironment,
  resolveDesktopCodeSigningEnvironment,
} from "./desktop-code-signing.mjs";

async function createLocalSigningFixture(t, contents) {
  const desktopRoot = await mkdtemp(join(tmpdir(), "kayingcode-signing-"));
  t.after(() => rm(desktopRoot, { recursive: true, force: true }));
  const configDir = join(desktopRoot, "build", "cert");
  await mkdir(configDir, { recursive: true });
  const certificateFile = join(desktopRoot, "local-test.pfx");
  await writeFile(certificateFile, "test certificate");
  if (contents !== null) {
    await writeFile(
      join(configDir, "windows-signing.local.json"),
      typeof contents === "function" ? contents(certificateFile) : contents,
    );
  }
  return { desktopRoot, certificateFile };
}

test("Windows without external certificate produces an unsigned development package", () => {
  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "win",
    desktopRoot: "unused",
    env: {},
    certificateExists: () => {
      throw new Error("repository certificates must not be read");
    },
  });
  assert.equal(resolved.source, "windows-unsigned");
  assert.deepEqual(resolved.envPatch, {});
});

test("Windows never overwrites an externally injected release certificate", () => {
  const env = {
    CSC_LINK: "external-release-certificate",
    CSC_KEY_PASSWORD: "external-password",
  };

  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "win",
    desktopRoot: "unused",
    env,
  });

  assert.equal(resolved.source, "windows-external-certificate");
  assert.deepEqual(resolved.envPatch, {});
  assert.deepEqual(env, {
    CSC_LINK: "external-release-certificate",
    CSC_KEY_PASSWORD: "external-password",
  });
});

test("Windows loads ignored local signing config when no environment certificate exists", async (t) => {
  const { desktopRoot, certificateFile } = await createLocalSigningFixture(t, (path) =>
    JSON.stringify({ certificateFile: path, certificatePassword: "local-secret" }),
  );
  const resolved = await loadDesktopCodeSigningEnvironment({
    targetOs: "win",
    desktopRoot,
    env: {},
  });
  assert.equal(resolved.source, "windows-local-config");
  assert.deepEqual(resolved.envPatch, {
    CSC_LINK: certificateFile,
    CSC_KEY_PASSWORD: "local-secret",
  });
});

test("Windows environment certificate wins without reading invalid local config", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(t, "not json");
  const resolved = await loadDesktopCodeSigningEnvironment({
    targetOs: "win",
    desktopRoot,
    env: { CSC_LINK: "external.pfx", CSC_KEY_PASSWORD: "external-secret" },
  });
  assert.equal(resolved.source, "windows-external-certificate");
  assert.deepEqual(resolved.envPatch, {});
});

test("Windows WIN_CSC_LINK also wins over local config", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(t, "not json");
  const resolved = await loadDesktopCodeSigningEnvironment({
    targetOs: "win",
    desktopRoot,
    env: { WIN_CSC_LINK: "external.pfx", WIN_CSC_KEY_PASSWORD: "external-secret" },
  });
  assert.equal(resolved.source, "windows-external-certificate");
  assert.deepEqual(resolved.envPatch, {});
});

test("Windows missing local config remains unsigned", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(t, null);
  const resolved = await loadDesktopCodeSigningEnvironment({
    targetOs: "win",
    desktopRoot,
    env: {},
  });
  assert.equal(resolved.source, "windows-unsigned");
});

test("Windows invalid local signing config fails before packaging without revealing password", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(
    t,
    JSON.stringify({ certificateFile: "relative.pfx", certificatePassword: "do-not-log-me" }),
  );
  await assert.rejects(
    () => loadDesktopCodeSigningEnvironment({ targetOs: "win", desktopRoot, env: {} }),
    (error) => {
      assert.match(error.message, /certificateFile.*absolute/u);
      assert.doesNotMatch(error.message, /do-not-log-me/u);
      return true;
    },
  );
});

test("Windows malformed local JSON fails instead of building unsigned", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(t, "not json");
  await assert.rejects(
    () => loadDesktopCodeSigningEnvironment({ targetOs: "win", desktopRoot, env: {} }),
    /不是有效 JSON/u,
  );
});

test("Windows local config requires a password and an accessible certificate file", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(t, (path) =>
    JSON.stringify({ certificateFile: path, certificatePassword: "" }),
  );
  await assert.rejects(
    () => loadDesktopCodeSigningEnvironment({ targetOs: "win", desktopRoot, env: {} }),
    /certificatePassword 不能为空/u,
  );
  await writeFile(
    join(desktopRoot, "build", "cert", "windows-signing.local.json"),
    JSON.stringify({
      certificateFile: join(desktopRoot, "missing.pfx"),
      certificatePassword: "do-not-log-me",
    }),
  );
  await assert.rejects(
    () => loadDesktopCodeSigningEnvironment({ targetOs: "win", desktopRoot, env: {} }),
    (error) => {
      assert.match(error.message, /证书文件不可访问/u);
      assert.doesNotMatch(error.message, /do-not-log-me/u);
      return true;
    },
  );
});

test("macOS does not read Windows local signing config", async (t) => {
  const { desktopRoot } = await createLocalSigningFixture(t, "not json");
  const resolved = await loadDesktopCodeSigningEnvironment({
    targetOs: "mac",
    desktopRoot,
    env: { KAYINGCODE_ENABLE_MAC_SIGN: "0" },
  });
  assert.equal(resolved.source, "macos-signing-disabled");
});

test("macOS maps KayingCodex secret aliases and enables signing", () => {
  const env = {
    MAC_CSC_LINK: "base64-p12",
    MAC_CSC_KEY_PASSWORD: "p12-password",
  };

  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "mac",
    desktopRoot: "unused",
    env,
  });

  assert.equal(resolved.source, "macos-p12-certificate");
  assert.deepEqual(resolved.envPatch, {
    CSC_LINK: "base64-p12",
    CSC_KEY_PASSWORD: "p12-password",
    KAYINGCODE_ENABLE_MAC_SIGN: "1",
  });
  assert.equal(env.CSC_LINK, undefined);
});

test("macOS keeps canonical CSC values ahead of KayingCodex aliases", () => {
  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "mac",
    desktopRoot: "unused",
    env: {
      CSC_LINK: "canonical-p12",
      CSC_KEY_PASSWORD: "canonical-password",
      MAC_CSC_LINK: "alias-p12",
      MAC_CSC_KEY_PASSWORD: "alias-password",
    },
  });

  assert.equal(resolved.source, "macos-p12-certificate");
  assert.deepEqual(resolved.envPatch, {
    KAYINGCODE_ENABLE_MAC_SIGN: "1",
  });
});

test("macOS keeps an explicit signing opt-out", () => {
  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "mac",
    desktopRoot: "unused",
    env: {
      KAYINGCODE_ENABLE_MAC_SIGN: "0",
      MAC_CSC_LINK: "base64-p12",
      MAC_CSC_KEY_PASSWORD: "p12-password",
    },
  });

  assert.equal(resolved.source, "macos-signing-disabled");
  // 禁用签名时同步写入 CSC_IDENTITY_AUTO_DISCOVERY=false，
  // 让自定义 sign-macos.cjs / notarize-dmg.cjs hook 与 electron-builder 主体一致短路。
  assert.deepEqual(resolved.envPatch, { CSC_IDENTITY_AUTO_DISCOVERY: "false" });
});

test("macOS fails closed when signing is explicitly required without a certificate", () => {
  assert.throws(
    () =>
      resolveDesktopCodeSigningEnvironment({
        targetOs: "mac",
        desktopRoot: "unused",
        env: { KAYINGCODE_ENABLE_MAC_SIGN: "1" },
        findDeveloperIdKeychainIdentity: () => null,
      }),
    /requires|默认要求签名/u,
  );
});

test("macOS discovers a local keychain Developer ID identity by default", () => {
  const identity =
    "Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)";

  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "mac",
    desktopRoot: "unused",
    env: {},
    findDeveloperIdKeychainIdentity: () => identity,
  });

  assert.equal(resolved.source, "macos-keychain-discovered");
  assert.deepEqual(resolved.envPatch, {
    APPLE_SIGNING_IDENTITY: identity,
    KAYINGCODE_ENABLE_MAC_SIGN: "1",
  });
});

test("macOS fails closed by default when no env certificate and no keychain identity exist", () => {
  assert.throws(
    () =>
      resolveDesktopCodeSigningEnvironment({
        targetOs: "mac",
        desktopRoot: "unused",
        env: {},
        findDeveloperIdKeychainIdentity: () => null,
      }),
    /KAYINGCODE_ENABLE_MAC_SIGN=0/u,
  );
});

test("macOS skips keychain discovery when an env identity already exists", () => {
  let probeCalls = 0;
  const resolved = resolveDesktopCodeSigningEnvironment({
    targetOs: "mac",
    desktopRoot: "unused",
    env: { APPLE_SIGNING_IDENTITY: "Developer ID Application: Existing (TEAMID)" },
    findDeveloperIdKeychainIdentity: () => {
      probeCalls += 1;
      return null;
    },
  });

  assert.equal(probeCalls, 0);
  assert.equal(resolved.source, "macos-keychain-identity");
  assert.deepEqual(resolved.envPatch, { KAYINGCODE_ENABLE_MAC_SIGN: "1" });
});

test("keychain discovery only accepts valid Developer ID Application identities", () => {
  const fakeOutput = [
    '   1) 4D6A73A58842E5671218CB791A962B5046F9F117 "Apple Development: Someone (FZP72S7HZ5)"',
    '   2) A938018EC0F893078AADEB93BF5620D0910D16AD "Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)"',
    '   3) 7D37624E9A9E11B15E5579E0A2C49E3FB607A63B "Apple Distribution: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)" (CSSMERR_TP_CERT_EXPIRED)',
    "     3 valid identities found",
    "",
  ].join("\n");

  const identity = findMacDeveloperIdKeychainIdentity({
    runFindIdentitiesCommand: () => fakeOutput,
  });

  assert.equal(
    identity,
    "Developer ID Application: Beijing Kaying Intelligent Technology Co., Ltd (9282PYW347)",
  );
});

test("keychain discovery returns null when the security command is unavailable", () => {
  const identity = findMacDeveloperIdKeychainIdentity({
    runFindIdentitiesCommand: () => {
      throw new Error("spawnSync security ENOENT");
    },
  });

  assert.equal(identity, null);
});
