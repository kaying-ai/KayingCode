import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readVerifiedNotices } from "../../../../../scripts/third-party-notices.mjs";
import { seaUploadBinaryNames, uploadSeaBinaries } from "./upload-sea-smb.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");

async function fixture(t, { stale = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "sea-license-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distDir = join(root, "dist");
  const rootDirectory = join(root, "apps/zcode-cli/packages/cli");
  await mkdir(distDir, { recursive: true });
  await mkdir(rootDirectory, { recursive: true });
  await mkdir(join(root, "third-party"));
  const notice = "Publisher notice fixture\n";
  await writeFile(join(root, "THIRD-PARTY-NOTICES.md"), notice);
  await writeFile(join(root, "tracked-input.md"), "current input");
  await writeFile(
    join(root, "third-party/inventory.json"),
    JSON.stringify({
      schemaVersion: 1,
      generatedOn: { os: process.platform, cpu: process.arch },
      noticesSha256: hash(notice),
      inputs: stale ? { "tracked-input.md": hash("previous input") } : {},
      reviewRequired: [{ id: "fixture-component", reason: "publisher material pending" }],
    }),
  );
  for (const name of seaUploadBinaryNames())
    await writeFile(join(distDir, name), `fixture:${name}`);
  return {
    root,
    options: {
      rootDirectory,
      distDir,
      destinationRoot: join(root, "destination"),
      version: "license-policy-fixture",
      smbUrl: "smb://example.invalid/share",
      force: false,
    },
  };
}

test("SEA upload accepts material reviews while explicit strict verification still fails", async (t) => {
  const { root, options } = await fixture(t);
  await assert.rejects(
    readVerifiedNotices(root, { requireComplete: true }),
    /Unresolved third-party material obligations/u,
  );
  const result = await uploadSeaBinaries(options);
  assert.equal(result.status, "uploaded");
  assert.equal(result.files.length, seaUploadBinaryNames().length);
  for (const name of seaUploadBinaryNames())
    assert.equal(await readFile(join(result.destination, name), "utf8"), `fixture:${name}`);
});

test("SEA upload does not make stale inventory an implicit precondition", async (t) => {
  const { root, options } = await fixture(t, { stale: true });
  await assert.rejects(readVerifiedNotices(root), /Third-party input changed/u);
  assert.equal((await uploadSeaBinaries(options)).status, "uploaded");
});

test("SEA upload still rejects missing required binaries before publishing", async (t) => {
  const { options } = await fixture(t);
  await unlink(join(options.distDir, seaUploadBinaryNames()[0]));
  await assert.rejects(uploadSeaBinaries(options), /Missing SEA binaries/u);
  await assert.rejects(stat(options.destinationRoot), { code: "ENOENT" });
});
