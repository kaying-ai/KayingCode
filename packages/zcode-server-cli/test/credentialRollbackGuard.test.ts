import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SERVER_CREDENTIAL_FORMAT } from "../src/contracts.js";
import { ReleaseManager } from "../src/runtime/releaseManager.js";
import { resolveServerLayout } from "../src/runtime/paths.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(metadata: Record<string, unknown> | null) {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-release-credential-"));
  roots.push(root);
  const layout = resolveServerLayout(join(root, "server"));
  const releaseDir = join(layout.releasesDir, "1.0.0-linux-x64-abc");
  await mkdir(join(releaseDir, "runtime"), { recursive: true });
  if (metadata) {
    await writeFile(join(releaseDir, "runtime", "package.json"), JSON.stringify(metadata));
  }
  await mkdir(join(layout.dataBaseDir, ".kayingcode", "v2"), { recursive: true });
  await writeFile(
    join(layout.dataBaseDir, ".kayingcode", "v2", "credentials.json"),
    JSON.stringify({ key: "enc:v2:os:abcdefabcdefabcdefabcdef:cipher" }),
  );
  await writeFile(
    layout.pendingFile,
    JSON.stringify({ version: "1.0.0", releaseDir, target: "linux-x64" }),
  );
  return { layout, manager: new ReleaseManager(layout) };
}

describe("server credential rollback guard", () => {
  it("refuses to activate a release without the v2 format marker", async () => {
    const { manager, layout } = await fixture({ type: "module" });
    await expect(manager.applyPending()).rejects.toMatchObject({
      code: "CREDENTIAL_ROLLBACK_INCOMPATIBLE",
    });
    const credentials = JSON.parse(
      await readFile(join(layout.dataBaseDir, ".kayingcode", "v2", "credentials.json"), "utf8"),
    ) as { key: string };
    expect(credentials.key).toContain("enc:v2:");
  });

  it("activates a release that declares the v2 format", async () => {
    const { manager, layout } = await fixture({
      type: "module",
      kayingcodeCredentialFormat: SERVER_CREDENTIAL_FORMAT,
    });
    await expect(manager.applyPending()).resolves.toMatchObject({ version: "1.0.0" });
    await expect(readFile(layout.pendingFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
