import { expect, it, vi } from "vitest";
import { createDesktopRemoteAccount } from "./desktopRemoteAccount.js";
it("persists the owner before registration and shares concurrent initialization", async () => {
  let stored: string | null = null;
  const calls: string[] = [];
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(new URL(String(url)).pathname);
    expect(stored).toMatch(/^[A-Za-z0-9_-]{43}$/);
    if (String(url).endsWith("/register")) return Response.json({ userId: "owner" });
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${stored}`);
    return Response.json({ invitation: "i".repeat(43) });
  });
  const account = createDesktopRemoteAccount({
    origin: "https://relay.example",
    credentials: {
      load: async () => stored,
      save: async (_key, value) => {
        stored = value;
      },
    },
    fetch: request as typeof fetch,
  });
  const [first, second] = await Promise.all([account.getLogin(), account.getLogin()]);
  expect(first).toEqual(second);
  expect(calls).toEqual(["/api/v1/account/register"]);
  const fragment = await account.createMobileAuthorization(new AbortController().signal);
  expect(fragment).toBe(`authorize=${"i".repeat(43)}`);
  expect(fragment).not.toContain(stored);
});
it("a failed registration retries the same durable owner instead of creating another identity", async () => {
  let stored: string | null = null;
  const secrets: string[] = [];
  const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    secrets.push(JSON.parse(String(init?.body)).ownerSecret);
    return Response.json({ userId: "owner" }, { status: secrets.length === 1 ? 503 : 200 });
  });
  const account = createDesktopRemoteAccount({
    origin: "https://relay.example",
    credentials: {
      load: async () => stored,
      save: async (_key, value) => {
        stored = value;
      },
    },
    fetch: request as typeof fetch,
  });
  await expect(account.getLogin()).rejects.toThrow();
  await expect(account.getLogin()).resolves.toMatchObject({ userId: "owner" });
  expect(secrets[0]).toBe(secrets[1]);
});
