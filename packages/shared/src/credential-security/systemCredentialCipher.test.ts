import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLegacyCredentialCipher,
  createSystemCredentialCipher,
  migrateCredentialRecord,
  type CredentialKeyStore,
} from "./module.js";

const tempRoots: string[] = [];

async function fixture(): Promise<{ filePath: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-credential-security-"));
  tempRoots.push(root);
  return { filePath: join(root, "credentials.json"), root };
}

function memoryKeyStore(
  initial: string | null = null,
): CredentialKeyStore & { value: string | null } {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(value: string) {
      this.value = value;
    },
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("system credential cipher", () => {
  it("writes v2 env ciphertext and roundtrips empty and multibyte values", async () => {
    const { filePath } = await fixture();
    const cipher = createSystemCredentialCipher({
      filePath,
      env: { KAYINGCODE_CREDENTIAL_SECRET: "unit-test-secret" },
    });

    const encrypted = await cipher.encrypt("凭据 secret");
    expect(encrypted).toMatch(/^enc:v2:env:[a-f0-9]{24}:/u);
    await expect(cipher.decrypt(encrypted)).resolves.toBe("凭据 secret");

    const empty = await cipher.encrypt("");
    await expect(cipher.decrypt(empty)).resolves.toBe("");
    await expect(cipher.decrypt("plain-text")).resolves.toBe("plain-text");
  });

  it("decrypts legacy v1 values with raw, trimmed and fallback keys", async () => {
    const { filePath } = await fixture();
    const rawSecret = " legacy-secret ";
    const legacyRaw = createLegacyCredentialCipher({
      KAYINGCODE_CREDENTIAL_SECRET: rawSecret,
    });
    const cipher = createSystemCredentialCipher({
      filePath,
      env: { KAYINGCODE_CREDENTIAL_SECRET: rawSecret },
    });

    await expect(cipher.decrypt(legacyRaw.encrypt("old"))).resolves.toBe("old");
  });

  it("fails closed on unknown enc prefixes", async () => {
    const { filePath } = await fixture();
    const cipher = createSystemCredentialCipher({
      filePath,
      env: { KAYINGCODE_CREDENTIAL_SECRET: "secret" },
    });
    await expect(cipher.decrypt("enc:v3:unknown")).rejects.toMatchObject({
      code: "KAYINGCODE_CREDENTIAL_DECRYPT_FAILED",
    });
  });

  it("migrates legacy and plaintext values without partially rewriting broken entries", async () => {
    const { filePath } = await fixture();
    const cipher = createSystemCredentialCipher({
      filePath,
      env: { KAYINGCODE_CREDENTIAL_SECRET: "migration-secret" },
    });
    const legacy = createLegacyCredentialCipher({
      KAYINGCODE_CREDENTIAL_SECRET: "migration-secret",
    });
    const current = await cipher.encrypt("current");
    const record = {
      broken: "enc:v1:bad.bad.bad",
      current,
      legacy: legacy.encrypt("old"),
      plain: "plain",
    };

    const migrated = await migrateCredentialRecord(record, cipher);
    expect(migrated).not.toBeNull();
    expect(migrated?.broken).toBe(record.broken);
    expect(migrated?.current).toBe(record.current);
    expect(migrated?.legacy).toMatch(/^enc:v2:env:/u);
    expect(migrated?.plain).toMatch(/^enc:v2:env:/u);
    await expect(cipher.decrypt(migrated!.legacy!)).resolves.toBe("old");
    await expect(cipher.decrypt(migrated!.plain!)).resolves.toBe("plain");
  });

  it("uses one injected OS entry and refuses to recreate a lost key", async () => {
    const { filePath } = await fixture();
    const store = memoryKeyStore();
    const cipher = createSystemCredentialCipher({ filePath, env: {}, keyStore: store });
    await cipher.initialize();
    expect(store.value).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const encrypted = await cipher.encrypt("os-value");
    expect(encrypted).toMatch(/^enc:v2:os:/u);

    store.value = null;
    const lost = createSystemCredentialCipher({
      filePath: join(filePath, "..", "other-credentials.json"),
      env: {},
      keyStore: memoryKeyStore(),
    });
    await expect(lost.decrypt(encrypted)).rejects.toMatchObject({
      code: "CREDENTIAL_SECURE_STORAGE_UNAVAILABLE",
    });
  });

  it("shares the source key with copied credentials at another path", async () => {
    const source = await fixture();
    const target = await fixture();
    const sourceStore = memoryKeyStore();
    const targetStore = memoryKeyStore();
    const sourceCipher = createSystemCredentialCipher({
      filePath: source.filePath,
      env: {},
      keyStore: sourceStore,
    });
    const encrypted = await sourceCipher.encrypt("copied");
    await writeFile(source.filePath, JSON.stringify({ credential: encrypted }));
    await writeFile(target.filePath, JSON.stringify({ credential: encrypted }));

    await sourceCipher.shareKeyWithCopiedCredentials(target.filePath, targetStore);
    const targetCipher = createSystemCredentialCipher({
      filePath: target.filePath,
      env: {},
      keyStore: targetStore,
    });
    await expect(targetCipher.decrypt(encrypted)).resolves.toBe("copied");
    expect(targetStore.value).toBe(sourceStore.value);
    expect(await readFile(target.filePath, "utf8")).toContain(encrypted);
  });
});
