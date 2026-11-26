import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
  createSharedKayingCodeCredentialStore,
  type SharedKayingCodeCredentialStoreOptions,
} from "../src/auth/shared-credentials.js";

const asyncCipher = {
  async encrypt(value: string) {
    return `v2:${value}`;
  },
  async decrypt(value: string) {
    return value.startsWith("v2:") ? value.slice(3) : value;
  },
};

test("shared credential store awaits async system cipher for every read/write path", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-shared-credentials-"));
  try {
    const options: SharedKayingCodeCredentialStoreOptions = {
      baseDir: root,
      cipher: asyncCipher,
    };
    const store = createSharedKayingCodeCredentialStore(options);

    await store.saveMany({ alpha: "one", beta: "two" });
    assert.deepEqual(await store.loadMany(["alpha", "beta"]), { alpha: "one", beta: "two" });
    assert.equal(await store.load("alpha"), "one");
    assert.equal(await store.deleteIfValue("alpha", "wrong"), false);
    assert.equal(await store.deleteIfValue("alpha", "one"), true);

    await store.saveReplacing("gamma", "three", ["beta"]);
    assert.equal(await store.load("beta"), null);
    assert.equal(await store.load("gamma"), "three");

    const raw = JSON.parse(await readFile(store.filePath, "utf8")) as Record<string, string>;
    assert.equal(raw.gamma, "v2:three");
    assert.equal(raw.alpha, undefined);
    assert.equal(raw.beta, undefined);
  } finally {
    // vitest 的测试上下文没有 node:test 的 t.after，用 finally 保证临时目录清理。
    await rm(root, { recursive: true, force: true });
  }
});

test("shared credential store rejects a malformed cipher result instead of writing promises", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-shared-credentials-bad-"));
  try {
    const store = createSharedKayingCodeCredentialStore({
      baseDir: root,
      cipher: {
        encrypt: async () => {
          throw new Error("keyring unavailable");
        },
        decrypt: async (value) => value,
      },
    });
    await assert.rejects(store.save("alpha", "one"), /keyring unavailable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
