import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("Linux release checksum signature verifies and detects modified artifacts", async (t) => {
  const dir = await mkdtemp("/tmp/kc-sign-");
  t.after(() => rm(dir, { recursive: true, force: true }));
  const home = join(dir, "gpg");
  await mkdir(home, { mode: 0o700 });
  const run = (args, opts = {}) =>
    spawnSync("gpg", ["--homedir", home, "--batch", ...args], { encoding: "utf8", ...opts });
  let result = run([
    "--pinentry-mode",
    "loopback",
    "--passphrase",
    "test-pass",
    "--quick-generate-key",
    "Test Release <test@example.invalid>",
    "ed25519",
    "sign",
    "1d",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const secret = run([
    "--pinentry-mode",
    "loopback",
    "--passphrase",
    "test-pass",
    "--armor",
    "--export-secret-keys",
  ]);
  const pub = run(["--armor", "--export"]);
  const pubPath = join(dir, "public.asc");
  await writeFile(pubPath, pub.stdout);
  for (const arch of ["x64", "arm64"]) {
    const native = arch === "x64" ? "x86_64" : "aarch64";
    const appArch = arch === "x64" ? "x86_64" : "arm64";
    const debArch = arch === "x64" ? "amd64" : "arm64";
    await writeFile(join(dir, `KayingCode-1.2.3-linux-${appArch}.AppImage`), "AppImage");
    await writeFile(join(dir, `KayingCode-1.2.3-linux-${debArch}.deb`), "deb");
    for (const ext of ["rpm", "pkg.tar.zst"])
      await writeFile(join(dir, `KayingCode-1.2.3-linux-${native}.${ext}`), ext);
  }
  for (const arch of ["x64", "arm64"]) {
    result = spawnSync("bash", ["scripts/sign-linux-release.sh", dir, "1.2.3", arch, pubPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        LINUX_GPG_PRIVATE_KEY: secret.stdout,
        LINUX_GPG_PASSPHRASE: "test-pass",
        TMPDIR: "/tmp",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      await readFile(join(dir, `SHA256SUMS-linux-${arch}`), "utf8"),
      new RegExp(`KayingCode-1.2.3-linux-${arch === "x64" ? "amd64" : "arm64"}\\.deb`),
    );
    assert.match(
      await readFile(join(dir, `SHA256SUMS-linux-${arch}`), "utf8"),
      new RegExp(`linux-${arch === "x64" ? "x86_64" : "aarch64"}\\.rpm`),
    );
  }
  await writeFile(join(dir, "KayingCode-1.2.3-linux-amd64.deb"), "modified");
  const check = spawnSync("shasum", ["-a", "256", "-c", "SHA256SUMS-linux-x64"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.notEqual(check.status, 0);
});
