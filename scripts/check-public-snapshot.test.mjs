import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const check = fileURLToPath(new URL("./check-public-snapshot.mjs", import.meta.url));

test("public snapshot rejects a staged local signing configuration without reading its contents", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "kaying-public-snapshot-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await run("git", ["init", "-q"], { cwd });
  await mkdir(join(cwd, "spec"));
  const configName = "spec/windows-signing.local.json";
  const sampleName = "spec/windows-signing.example.json";
  const dummyContents = "fixture-only-password";
  await writeFile(join(cwd, sampleName), "{}");
  await run("git", ["add", "--", sampleName], { cwd });
  await run(process.execPath, [check], { cwd });

  await writeFile(join(cwd, configName), dummyContents);
  await run("git", ["add", "--", configName], { cwd });
  await assert.rejects(run(process.execPath, [check], { cwd }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /spec\/windows-signing\.local\.json/u);
    assert.doesNotMatch(error.stderr, /fixture-only-password/u);
    return true;
  });
});
