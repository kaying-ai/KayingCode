import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLegacyCredentialCipher,
  createSystemCredentialCipher,
} from "@zcode/shared/credential-security";
import { createCredentialService } from "../src/credential/credentialService.js";
import { getDataBaseDir, setDataBaseDir } from "../src/paths.js";

const env = { KAYINGCODE_CREDENTIAL_SECRET: "credential-service-test" };
let originalBaseDir: string;
let root = "";

beforeEach(async () => {
  originalBaseDir = getDataBaseDir();
  root = await mkdtemp(join(tmpdir(), "kayingcode-credential-service-"));
  setDataBaseDir(root);
  await mkdir(join(root, ".kayingcode", "v2"), { recursive: true });
});

afterEach(async () => {
  setDataBaseDir(originalBaseDir);
  await rm(root, { recursive: true, force: true });
});

describe("credential service v2 migration", () => {
  it("reads v1, migrates the whole record, and writes v2 on save", async () => {
    const filePath = join(root, ".kayingcode", "v2", "credentials.json");
    const legacy = createLegacyCredentialCipher(env);
    await writeFile(
      filePath,
      JSON.stringify({ "test:key": legacy.encrypt("legacy-value") }, null, 2),
    );
    const cipher = createSystemCredentialCipher({ filePath, env });
    const service = createCredentialService({ cipherProvider: cipher });

    await expect(service.load("test:key")).resolves.toBe("legacy-value");
    const migrated = JSON.parse(await readFile(filePath, "utf8"));
    expect(migrated["test:key"]).toMatch(/^enc:v2:env:/u);

    await service.save("test:key", "new-value");
    await expect(service.load("test:key")).resolves.toBe("new-value");
  });

  it("keeps an unrelated undecryptable legacy entry while reading a valid key", async () => {
    const filePath = join(root, ".kayingcode", "v2", "credentials.json");
    const legacy = createLegacyCredentialCipher(env);
    await writeFile(
      filePath,
      JSON.stringify(
        {
          broken: "enc:v1:bad.bad.bad",
          "test:key": legacy.encrypt("ok"),
        },
        null,
        2,
      ),
    );
    const cipher = createSystemCredentialCipher({ filePath, env });
    const service = createCredentialService({ cipherProvider: cipher });

    await expect(service.load("test:key")).resolves.toBe("ok");
    const current = JSON.parse(await readFile(filePath, "utf8"));
    expect(current.broken).toBe("enc:v1:bad.bad.bad");
    expect(current["test:key"]).toMatch(/^enc:v2:env:/u);
  });
});
