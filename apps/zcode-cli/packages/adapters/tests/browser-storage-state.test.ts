import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  BrowserStateFileError,
  loadBrowserStorageState,
  resolveDefaultBrowserStatePath,
} from "../src/browser/storage-state.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const state = {
  cookies: [
    { name: "sid", value: "abc", domain: ".example.com", path: "/", httpOnly: true, secure: true },
  ],
  origins: [{ origin: "https://example.com", localStorage: [{ name: "k", value: "v" }] }],
};

it("loads a valid Playwright storage state", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-browser-state-"));
  roots.push(root);
  const path = join(root, "state.json");
  await writeFile(path, JSON.stringify(state));
  const loaded = await loadBrowserStorageState(path);
  expect(loaded.state.cookies).toHaveLength(1);
  expect(loaded.state.origins?.[0]?.localStorage).toEqual(state.origins[0].localStorage);
});

it("reports invalid JSON as a typed file error", async () => {
  const root = await mkdtemp(join(tmpdir(), "kayingcode-browser-state-"));
  roots.push(root);
  const path = join(root, "state.json");
  await writeFile(path, "{");
  await expect(loadBrowserStorageState(path)).rejects.toMatchObject({
    name: "BrowserStateFileError",
    code: "invalid_json",
  });
});

it("uses the product home directory for the default state path", () => {
  const root = join(tmpdir(), "kayingcode-home");
  const path = resolveDefaultBrowserStatePath(
    { HOME: root, USERPROFILE: root } as NodeJS.ProcessEnv,
    "linux",
  );
  expect(path).toBe(join(root, ".kayingcode", "cli", "browser-state.json"));
});

it("keeps the error type stable for missing explicit files", async () => {
  await expect(loadBrowserStorageState(join(tmpdir(), "missing-browser-state.json"))).rejects.toBeInstanceOf(
    BrowserStateFileError,
  );
});
