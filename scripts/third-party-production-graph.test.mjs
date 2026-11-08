import assert from "node:assert/strict";
import test from "node:test";
import { readProductionProjectGraphs, assertProductionGraphs } from "./third-party-npm.mjs";

test("production inventory visits every workspace without overlapping pnpm scans", async () => {
  let active = 0;
  let peak = 0;
  const projects = ["app", "lib", "cli", "desktop", "mobile", "web"].map((name) => ({ name }));
  const { locked, actual } = await readProductionProjectGraphs(async (args) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    if (args.includes("-1")) return projects;
    assert.ok(args.filter((arg) => arg === "--filter").length <= 4);
    return args.flatMap((arg, index) =>
      arg === "--filter"
        ? [
            {
              name: args[index + 1],
              dependencies: { dep: { name: `dep-${args[index + 1]}`, version: "1.0.0" } },
            },
          ]
        : [],
    );
  });
  assert.equal(peak, 1);
  assert.deepEqual(
    actual.map((project) => project.name),
    projects.map((project) => project.name),
  );
  assert.deepEqual(
    [...assertProductionGraphs(locked, actual).keys()].sort(),
    projects.map(({ name }) => `dep-${name}@1.0.0`).sort(),
  );
});

test("a missing workspace graph fails instead of publishing a partial inventory", async () => {
  await assert.rejects(
    readProductionProjectGraphs(async (args) => {
      if (args.includes("-1")) return [{ name: "app" }];
      return args.includes("--lockfile-only") ? [{ name: "app" }] : [];
    }),
    /Incomplete production graph for app/,
  );
});
