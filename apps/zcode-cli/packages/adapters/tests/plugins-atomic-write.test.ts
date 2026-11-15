import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePluginTextIfChanged } from "../src/plugins/helpers.js";

const directories: string[] = [];

async function tempPath(name = "plugin.json"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kayingcode-plugin-write-"));
  directories.push(directory);
  return join(directory, "nested", name);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("writePluginTextIfChanged", () => {
  it("creates parents and replaces changed content", async () => {
    const path = await tempPath();
    await writePluginTextIfChanged(path, '{"enabled":true}\n');
    expect(await readFile(path, "utf8")).toBe('{"enabled":true}\n');

    await writePluginTextIfChanged(path, '{"enabled":false}\n');
    expect(await readFile(path, "utf8")).toBe('{"enabled":false}\n');
  });

  it("does not touch the file when the bytes are unchanged", async () => {
    const path = await tempPath();
    await writePluginTextIfChanged(path, '{"version":1}\n');
    const before = await stat(path);

    await writePluginTextIfChanged(path, '{"version":1}\n');
    const after = await stat(path);

    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);
  });

  it("leaves one complete document under concurrent writes", async () => {
    const path = await tempPath();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        writePluginTextIfChanged(path, `${JSON.stringify({ index })}\n`),
      ),
    );
    const parsed = JSON.parse(await readFile(path, "utf8")) as { index: number };
    expect(parsed.index).toBeGreaterThanOrEqual(0);
    expect(parsed.index).toBeLessThan(8);
  });
});
