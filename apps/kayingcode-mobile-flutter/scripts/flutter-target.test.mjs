import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("android check reads the version after Flutter's first-run output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-flutter-target-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scriptDir = join(root, "scripts");
  const sdkBin = join(root, ".fvm", "flutter_sdk", "bin");
  const script = join(scriptDir, "flutter-target.mjs");
  await mkdir(scriptDir);
  await mkdir(sdkBin, { recursive: true });
  await copyFile(new URL("./flutter-target.mjs", import.meta.url), script);
  await writeFile(join(root, ".fvmrc"), '{"flutter":"3.35.5"}');
  await writeFile(join(root, ".flutter-version"), "3.35.5\n");
  const windows = process.platform === "win32";
  await writeFile(
    join(sdkBin, windows ? "flutter.bat" : "flutter"),
    windows
      ? '@echo off\r\ntype "%~dp0version.txt"\r\n'
      : '#!/bin/sh\ncat "$(dirname "$0")/version.txt"\n',
    { mode: 0o755 },
  );
  const versionFile = join(sdkBin, "version.txt");
  const bootstrap =
    "  % Total    % Received\r\nResolving dependencies...\nChanged 100 dependencies!\n";
  await writeFile(versionFile, `${bootstrap}{\n  "frameworkVersion": "3.35.5"\n}\n`);
  const { stdout } = await exec(process.execPath, [script, "android", "check"]);
  assert.match(stdout, /上游 Flutter 3\.35\.5/u);

  await writeFile(versionFile, `${bootstrap}{"frameworkVersion":"3.35.8-ohos"}\n`);
  await assert.rejects(
    exec(process.execPath, [script, "android", "check"]),
    /需要上游 Flutter 3\.35\.5/u,
  );
});
