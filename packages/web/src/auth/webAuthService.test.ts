import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initializeAccount, createWebAuthService } from "./webAuthService.js";
let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  vi.stubGlobal("location", {
    href: `https://relay.example/remote/v4?sid=test#authorize=${"A".repeat(43)}`,
  });
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
  expect(JSON.stringify([...data.values()])).not.toContain("A".repeat(43));
});
it("reopening a consumed invitation uses the existing valid browser session", async () => {
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
