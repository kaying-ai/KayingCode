import assert from "node:assert/strict";
import { test } from "vitest";
import { gameDevelopmentPluginListingSchema } from "../src/game-development-plugin-listing.js";
import { kayingcodePluginStoreListingSchema } from "../src/kayingcode-protocol/index.js";

test("legacy listings and explicit game source declarations survive protocol parsing", () => {
  assert.deepEqual(kayingcodePluginStoreListingSchema.parse({ displayName: "Legacy" }), {
    displayName: "Legacy",
  });
  for (const source of [
    undefined,
    { kind: "closed-source" },
    { kind: "open-source", repositoryUrl: "https://github.com/example/game-plugin" },
  ]) {
    const gameDevelopment = { engines: [], stages: ["assets"], ...(source ? { source } : {}) };
    assert.deepEqual(
      kayingcodePluginStoreListingSchema.parse({ gameDevelopment }).gameDevelopment,
      gameDevelopment,
    );
  }
});

test("invalid tags and unsafe or non-repository GitHub links are rejected", () => {
  const base = { engines: ["unity"], stages: ["development"] };
  for (const value of [
    { ...base, engines: ["unknown"] },
    { ...base, stages: [] },
    { ...base, stages: ["unknown"] },
    { ...base, typo: true },
    { ...base, source: { kind: "open-source" } },
    { ...base, source: { kind: "closed-source", repositoryUrl: "https://github.com/a/b" } },
    ...[
      "javascript:alert(1)",
      "http://github.com/a/b",
      "https://github.com.evil.test/a/b",
      "https://user:pass@github.com/a/b",
      "https://github.com:8443/a/b",
      "https://github.com/a",
      "https://github.com/a/b/issues",
      "https://github.com/a/b?x=1",
    ].map((repositoryUrl) => ({ ...base, source: { kind: "open-source", repositoryUrl } })),
  ])
    assert.equal(gameDevelopmentPluginListingSchema.safeParse(value).success, false);
});

test("TapTap Maker is a valid engine in protocol listings", () => {
  const gameDevelopment = { engines: ["taptap-maker", "threejs"], stages: ["publishing"] };
  assert.deepEqual(
    kayingcodePluginStoreListingSchema.parse({ gameDevelopment }).gameDevelopment,
    gameDevelopment,
  );
});
