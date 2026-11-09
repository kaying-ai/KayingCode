import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const requested = process.argv[2];
if (!requested) {
  console.error("Usage: node scripts/release-notes.mjs <version|kaying-code-vX.Y.Z>");
  process.exit(1);
}

const version = requested.replace(/^kaying-code-v/, "");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
const lines = changelog.split(/\r?\n/u);
const start = lines.findIndex((line) =>
  new RegExp(`^## \\[?${escaped}\\]?(?:\\(|\\s|\\[|$)`, "u").test(line),
);
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
const section = lines
  .slice(start, end === -1 ? undefined : end)
  .join("\n")
  .trimEnd();

console.log(`KayingCode ${version}`);
console.log();
console.log(section);
console.log();
console.log("---");
console.log("安装包与校验值见下方 Assets。");
console.log("Installers and checksums are attached under Assets.");
console.log();
console.log(
  "Windows 当前使用自签证书，安装时可能提示“未知发布者”。Windows installers use a self-signed certificate and may show “Unknown publisher”.",
);
