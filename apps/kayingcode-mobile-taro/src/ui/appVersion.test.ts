import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { appVersion } from "./appVersion";

test("displayed mobile version matches the package manifest", async () => {
  const manifestPath = fileURLToPath(new URL("../../package.json", import.meta.url));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version: string };
  assert.equal(appVersion, manifest.version);
});
