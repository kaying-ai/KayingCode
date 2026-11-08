import assert from "node:assert/strict";
import { test } from "vitest";
import {
  tapMakerProjectsRequestSchema,
  tapMakerProjectsResultSchema,
} from "../src/tapmaker-projects.js";

test("TapMaker management accepts only bounded, explicit operations", () => {
  assert.equal(
    tapMakerProjectsRequestSchema.safeParse({ action: "list", candidateDirectories: [] }).success,
    true,
  );
  for (const input of [
    { action: "delete", appId: "game" },
    { action: "restore", appId: "", projectName: "Game", selectedDirectory: "/games" },
    { action: "restore", appId: "game", projectName: "Game", selectedDirectory: "" },
    { action: "authorize", env: "rnd" },
    { action: "list", candidateDirectories: [42] },
  ])
    assert.equal(tapMakerProjectsRequestSchema.safeParse(input).success, false);
});

test("TapMaker results validate before crossing the service boundary", () => {
  assert.equal(
    tapMakerProjectsResultSchema.safeParse({ action: "list", projects: [] }).success,
    true,
  );
  assert.equal(
    tapMakerProjectsResultSchema.safeParse({ action: "restore", projectRoot: "" }).success,
    false,
  );
  assert.equal(tapMakerProjectsResultSchema.safeParse({ action: "authorize" }).success, true);
  assert.equal(
    tapMakerProjectsResultSchema.safeParse({ action: "list", projects: [{ id: "a", name: "A" }] })
      .success,
    false,
  );
});
