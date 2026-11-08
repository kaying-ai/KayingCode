import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readVerifiedNotices } from "./third-party-notices.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("notice validation requires the generating host platform", async () => {
  const root = await mkdtemp(join(tmpdir(), "third-party-notices-test-"));
  try {
    const notices = "# Test notices\n";
    const source = "source input\n";
    await writeFile(join(root, "THIRD-PARTY-NOTICES.md"), notices);
    await writeFile(join(root, "source.txt"), source);
    const inventory = {
      schemaVersion: 1,
      generatedOn: { os: process.platform, cpu: process.arch },
      noticesSha256: sha256(notices),
      inputs: { "source.txt": sha256(source) },
      reviewRequired: [],
    };
    const inventoryPath = join(root, "third-party/inventory.json");
    await mkdir(join(root, "third-party"), { recursive: true });
    await writeFile(inventoryPath, JSON.stringify(inventory));
    assert.equal(
      (await readVerifiedNotices(root, { requireComplete: true })).toString(),
      notices,
    );

    inventory.generatedOn.os =
      process.platform === "darwin" ? "win32" : "darwin";
    await writeFile(inventoryPath, JSON.stringify(inventory));
    await assert.rejects(
      readVerifiedNotices(root),
      /Third-party notices were generated on a different host platform/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
