import { describe, expect, it } from "vitest";
import {
  createCredentialCipherBridge,
  executeCredentialCipherRequest,
  type CredentialCipherRequest,
} from "./module.js";

describe("credential cipher bridge", () => {
  it("correlates replies and rejects pending work when disposed", async () => {
    const sent: CredentialCipherRequest[] = [];
    const bridge = createCredentialCipherBridge((request) => sent.push(request));
    const encrypted = bridge.cipher.encrypt("plain");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.operation).toBe("encrypt");
    bridge.receive({
      requestId: sent[0]!.requestId,
      result: { ok: true, value: "enc:v2:env:abc:cipher" },
    });
    await expect(encrypted).resolves.toBe("enc:v2:env:abc:cipher");

    const pending = bridge.cipher.decrypt("enc:v2:env:abc:cipher");
    bridge.dispose();
    await expect(pending).rejects.toThrow("Credential cipher bridge is closed");
  });

  it("rejects pending work on a malformed reply instead of leaving the lock held", async () => {
    const sent: CredentialCipherRequest[] = [];
    const bridge = createCredentialCipherBridge((request) => sent.push(request));
    const pending = bridge.cipher.encrypt("plain");
    bridge.receive({ requestId: sent[0]!.requestId, result: { ok: "bad" } });
    await expect(pending).rejects.toMatchObject({ code: "CREDENTIAL_CIPHER_INVALID_PAYLOAD" });
  });

  it("maps native failures to controlled error codes without leaking details", async () => {
    const reply = await executeCredentialCipherRequest(
      {
        encrypt: async () => {
          throw new Error("native keyring stack with machine path");
        },
        decrypt: async () => "unused",
      },
      { requestId: "00000000-0000-4000-8000-000000000000", operation: "encrypt", value: "x" },
    );
    expect(reply.result).toEqual({
      ok: false,
      error: {
        code: "CREDENTIAL_SECURE_STORAGE_UNAVAILABLE",
        message:
          "System credential storage is unavailable. Unlock the OS credential store and restart the application or CLI to retry.",
      },
    });
  });

  it("preserves the product decrypt error classification", async () => {
    const reply = await executeCredentialCipherRequest(
      {
        encrypt: async (value) => value,
        decrypt: async () => {
          throw Object.assign(new Error("bad"), {
            code: "KAYINGCODE_CREDENTIAL_DECRYPT_FAILED",
          });
        },
      },
      { requestId: "00000000-0000-4000-8000-000000000001", operation: "decrypt", value: "x" },
    );
    expect(reply.result.ok).toBe(false);
    if (!reply.result.ok)
      expect(reply.result.error.code).toBe("KAYINGCODE_CREDENTIAL_DECRYPT_FAILED");
  });
});
