import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initializeAccount, createWebAuthService } from "./webAuthService.js";
const invite = "A".repeat(43);
let data: Map<string, string>;
async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function openInvite(value = invite): void {
  vi.stubGlobal("location", {
    href: `https://relay.example/remote/v4?sid=test#authorize=${value}`,
  });
}
beforeEach(() => {
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  openInvite();
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
it("consumes fragment before claim and exposes a separate browser token", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      expect(history.replaceState).toHaveBeenCalledWith(null, "", "/remote/v4?sid=test");
      return Response.json({
        token: "B".repeat(43),
        userId: "user",
        expiresAt: Date.now() + 60000,
      });
    }),
  );
  await initializeAccount();
  expect(createWebAuthService().getZCodeJwtToken()).toBe("B".repeat(43));
  expect(JSON.stringify([...data.values()])).not.toContain(invite);
  expect(JSON.parse(data.get("kayingcode-web-account:v2")!).inviteDigest).toBe(await digest(invite));
});
it("reopening the same invitation keeps the session without another claim", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      token: "B".repeat(43),
      userId: "user",
      expiresAt: Date.now() + 60000,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await initializeAccount();
  openInvite();
  await initializeAccount();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(createWebAuthService().getZCodeJwtToken()).toBe("B".repeat(43));
});
it("a different invitation replaces the existing browser session", async () => {
  data.set(
    "kayingcode-web-account:v2",
    JSON.stringify({
      token: "B".repeat(43),
      userId: "user",
      expiresAt: Date.now() + 60000,
      inviteDigest: await digest(invite),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ token: "C".repeat(43), userId: "user", expiresAt: Date.now() + 60000 }),
    ),
  );
  openInvite("D".repeat(43));
  await initializeAccount();
  expect(createWebAuthService().getZCodeJwtToken()).toBe("C".repeat(43));
});
it("legacy session without an invitation digest still falls back after a failed claim", async () => {
  data.set(
    "kayingcode-web-account:v2",
    JSON.stringify({ token: "B".repeat(43), userId: "user", expiresAt: Date.now() + 60000 }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  await initializeAccount();
  expect(createWebAuthService().getZCodeJwtToken()).toBe("B".repeat(43));
});
it("claim network failure and invalid cached session lead to login, not blank bootstrap", async () => {
  data.set(
    "kayingcode-web-account:v2",
    JSON.stringify({ token: "invalid", expiresAt: Date.now() + 60000 }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network");
    }),
  );
  await expect(initializeAccount()).resolves.toBeUndefined();
  expect(createWebAuthService().getZCodeJwtToken()).toBeNull();
});
