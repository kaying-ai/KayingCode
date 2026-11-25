import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { resolveBuildAliases } from "../scripts/build.mjs";

const cliRoot = resolve(import.meta.dirname, "..");
const rootDirectory = resolve(cliRoot, "../../../..");
const sharedManifest = JSON.parse(
  readFileSync(resolve(rootDirectory, "packages/shared/package.json"), "utf8"),
);
const aliases = resolveBuildAliases({ rootDirectory });

test("every shared subpath export has an exact esbuild alias", () => {
  for (const subpath of Object.keys(sharedManifest.exports)) {
    if (subpath === ".") continue;
    const key = `@zcode/shared/${subpath.slice(2)}`;
    assert.ok(aliases[key], `missing alias for ${key}`);
  }
});

test("longest shared subpath aliases are resolved before their prefixes", () => {
  const keys = Object.keys(aliases);
  for (const [index, key] of keys.entries()) {
    assert.ok(index === 0 || keys[index - 1].length >= key.length);
  }
  assert.equal(
    aliases["@zcode/shared/managed-worktree"],
    resolve(rootDirectory, "packages/shared/src/managed-worktree/index.ts"),
  );
  assert.equal(
    aliases["@zcode/shared/preinstalled-tools/node"],
    resolve(rootDirectory, "packages/shared/src/preinstalled-tools/node.ts"),
  );
});
