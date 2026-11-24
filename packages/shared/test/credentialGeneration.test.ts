import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeCredentialRecordLocked } from "../src/credential-security/systemCredentialCipher.js";
import {
  captureCredentialFileGuard,
  credentialGeneration,
  withCredentialFileRead,
  withCredentialGeneration,
} from "../src/node/privateFilePersistence.js";

const dirs: string[] = [];

async function tempCredentials(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kayingcode-credential-generation-"));
  dirs.push(dir);
  return join(dir, "credentials.json");
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("credential generation guard", () => {
  it("rejects a captured guard after the recovery generation advances", async () => {
    const file = await tempCredentials();
    const guard = await captureCredentialFileGuard(file);
    await writeFile(`${file}.recovery-generation`, "new-generation");

    await expect(guard(async () => "ok")).rejects.toMatchObject({
      code: "ZCODE_CREDENTIAL_STORE_CHANGED",
    });
  });

  it("reuses the outer generation inside withCredentialGeneration", async () => {
    const file = await tempCredentials();
    await writeFile(`${file}.recovery-generation`, "generation-a");

    await withCredentialGeneration(file, async () => {
      // 外层代次作用域内重新领取必须沿用原代次，不能在迟到响应里换新值。
      assert.equal(await credentialGeneration(file), "generation-a");
      await expect(withCredentialGeneration(file, async () => "ok")).resolves.toBe("ok");
    });
  });

  it("rejects a read that spans a generation change", async () => {
    const file = await tempCredentials();
    await writeFile(`${file}.recovery-generation`, "generation-a");

    await expect(
      withCredentialFileRead(file, async () => {
        await writeFile(`${file}.recovery-generation`, "generation-b");
        return "stale";
      }),
    ).rejects.toMatchObject({ code: "ZCODE_CREDENTIAL_STORE_CHANGED" });
  });
});

describe("writeCredentialRecordLocked", () => {
  it("rejects new os ciphertext when the store is not pinned to os", async () => {
    const file = await tempCredentials();
    await expect(
      writeCredentialRecordLocked(file, { "oauth:zai": "enc:v2:os:new-value" }),
    ).rejects.toThrow(/secure storage is unavailable/i);
  });

  it("allows os ciphertext after the source marker is pinned", async () => {
    const file = await tempCredentials();
    await writeFile(join(file, "..", "credential-source"), "os\n");

    await writeCredentialRecordLocked(file, { "oauth:zai": "enc:v2:os:new-value" });
    const record = JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
    expect(record).toEqual({ "oauth:zai": "enc:v2:os:new-value" });
  });
});
