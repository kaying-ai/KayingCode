import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = String(pkg.version);
const outRoot = join(root, "dist-deploy");
const stage = join(outRoot, `kaying-taptap-daily-${version}`);

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "inherit" });

await cp(join(root, "dist"), join(stage, "dist"), { recursive: true });
await cp(join(root, "workflows"), join(stage, "workflows"), { recursive: true });

for (const entry of await readdir(join(root, "deploy"))) {
  // 本地采集上传脚本依赖仓库内的 scripts/export-import.mjs，不作为服务器部署包内容。
  if (entry === "collect-and-upload.sh") continue;
  await cp(join(root, "deploy", entry), join(stage, entry), { recursive: true });
}

const pluginDir = join(stage, "plugin");
await mkdir(pluginDir, { recursive: true });
for (const entry of [
  ".zcode-plugin",
  ".kayingcode-plugin",
  "dist",
  "skills",
  "commands",
  "workflows",
  "spec",
  "package.json",
]) {
  await cp(join(root, entry), join(pluginDir, entry), { recursive: true });
}

await writeFile(join(stage, "VERSION"), `${version}\n`, "utf8");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const files = (await walk(stage)).sort();
const lines = [];
for (const file of files) {
  const relativePath = file.slice(stage.length + 1);
  if (relativePath === "SHA256SUMS") continue;
  const hash = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  lines.push(`${hash}  ${relativePath}`);
}
await writeFile(join(stage, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");

const tarball = join(outRoot, `kaying-taptap-daily-${version}.tar.gz`);
await rm(tarball, { force: true });
execFileSync("tar", ["-czf", tarball, "-C", outRoot, `kaying-taptap-daily-${version}`], {
  stdio: "inherit",
});

console.log(
  JSON.stringify({
    ok: true,
    version,
    stage,
    tarball,
    files: files.length,
  }),
);
