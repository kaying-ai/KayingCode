import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateSourceMap } from "./generate-source-map.mjs";

test("map uses actual manifests, public exports, workspace dependencies and governance; check rejects stale data", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "source-map-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["apps/client", "packages/library", "plugins", "tools", "config"])
    await mkdir(join(root, path), { recursive: true });
  const client = {
    name: "@test/client",
    version: "1.0.0",
    dependencies: { "@test/library": "workspace:*" },
    scripts: { test: "node --test", start: "node start.mjs" },
  };
  await writeFile(join(root, "apps/client/package.json"), JSON.stringify(client));
  await writeFile(
    join(root, "packages/library/package.json"),
    JSON.stringify({
      name: "@test/library",
      version: "2.0.0",
      exports: { ".": "./dist/index.js", "./node": "./dist/node.js" },
    }),
  );
  await writeFile(
    join(root, "architecture-policy.yaml"),
    "modules:\n  - id: library\n    roots: [packages/library/src]\n    managed: true\n",
  );
  await writeFile(
    join(root, "config/official-plugins.json"),
    JSON.stringify({ schemaVersion: 1, marketplace: "kayingcode-plugins-official", plugins: [] }),
  );
  await writeFile(join(root, ".oxfmtrc.json"), "{}");
  assert.equal(await generateSourceMap(root), 2);
  const map = await readFile(join(root, "SOURCE_PACKAGES.md"), "utf8");
  assert.match(map, /@test\/client/);
  assert.match(map, /\[apps\/client\]\(apps\/client\/package\.json\)/);
  assert.match(map, /library（受治理）/);
  assert.match(map, /\.\/node/);
  assert.doesNotMatch(map, /node start.mjs/);
  await generateSourceMap(root, { check: true });
  client.version = "1.1.0";
  await writeFile(join(root, "apps/client/package.json"), JSON.stringify(client));
  await assert.rejects(generateSourceMap(root, { check: true }), /stale/);
});
