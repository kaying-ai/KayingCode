import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const signerSourcePath = join(import.meta.dirname, "sign-macos.cjs");

test("macOS signer loads app-builder-lib from electron-builder's dependency tree", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-macos-signer-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const signerPath = join(root, "desktop", "scripts", "sign-macos.cjs");
  const electronBuilderManifest = join(
    root,
    "desktop",
    "node_modules",
    "electron-builder",
    "package.json",
  );
  const appBuilderSignModule = join(
    root,
    "desktop",
    "node_modules",
    "electron-builder",
    "node_modules",
    "app-builder-lib",
    "out",
    "codeSign",
    "macCodeSign.js",
  );
  await Promise.all(
    [signerPath, electronBuilderManifest, appBuilderSignModule].map((path) =>
      mkdir(dirname(path), { recursive: true }),
    ),
  );
  await Promise.all([
    copyFile(signerSourcePath, signerPath),
    writeFile(
      electronBuilderManifest,
      JSON.stringify({ name: "electron-builder", version: "0.0.0" }),
    ),
    writeFile(appBuilderSignModule, "exports.sign = async () => {};\n"),
  ]);

  const { stdout } = await execFileAsync(process.execPath, [
    "-e",
    "const signer = require(process.argv[1]); process.stdout.write(typeof signer)",
    signerPath,
  ]);
  assert.equal(stdout, "function");
});
