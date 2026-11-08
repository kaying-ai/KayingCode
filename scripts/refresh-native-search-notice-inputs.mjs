import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { hashBytes } from "./third-party-npm.mjs";

export function verifyNativeSourceRelocation(previous, current) {
  // 仅接受已审阅的结构搬迁；不能借更新输入哈希放行工具版本或归档来源变化。
  const relocated = previous
    .replaceAll(
      '"apps/kayingcode-cli/dependencies/native-search"',
      '"apps/zcode-cli/packages/cli/dependencies/native-search"',
    )
    .replaceAll('"apps/kayingcode-desktop/bundled-tools"', '"packages/desktop/bundled-tools"');
  if (relocated !== current)
    throw new Error("Native configuration changed beyond reviewed source relocation");
}

async function main(revision) {
  if (!/^[a-f0-9]{8,40}$/.test(revision ?? ""))
    throw new Error("Provide the recorded configuration commit");
  const root = resolve(import.meta.dirname, "..");
  const file = resolve(root, "third-party/native-search/sources.json");
  const inventory = JSON.parse(await readFile(file, "utf8"));
  const inputs = { ...inventory.inputs };
  for (const [source, expected] of Object.entries(inputs)) {
    const current = await readFile(resolve(root, source));
    if (hashBytes(current) === expected) continue;
    const { stdout: previous } = await promisify(execFile)(
      "git",
      ["show", `${revision}:${source}`],
      { cwd: root, encoding: "buffer" },
    );
    if (hashBytes(previous) !== expected)
      throw new Error(`Recorded input does not match ${revision}: ${source}`);
    verifyNativeSourceRelocation(previous.toString("utf8"), current.toString("utf8"));
    inputs[source] = hashBytes(current);
  }
  await writeFile(file, `${JSON.stringify({ ...inventory, inputs }, null, 2)}\n`);
  console.log(
    "Verified path-only native configuration relocation; archive and license records preserved",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
