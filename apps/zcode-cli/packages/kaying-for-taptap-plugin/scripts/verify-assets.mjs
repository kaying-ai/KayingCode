import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const lockPath = join(packageRoot, "vendor", "instant-games-open-mcp", "upstream-lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));

for (const packageLock of lock.packages) {
  for (const fileName of packageLock.distFiles) {
    const filePath = join(packageRoot, "vendor", "instant-games-open-mcp", "dist", fileName);
    const contents = await readFile(filePath);
    const actual = createHash("sha512").update(contents).digest("hex");
    const expected = packageLock.distSha512?.[fileName];
    if (!expected || actual !== expected) {
      throw new Error(`Vendor integrity mismatch: ${fileName}`);
    }
  }
}

for (const relativePath of [
  ".kayingcode-plugin/plugin.json",
  "THIRD_PARTY_NOTICES.md",
  "dist/mcp/server.js",
  "vendor/instant-games-open-mcp/LICENSE",
  "commands/transcribe-web-game.md",
  "skills/threejs-to-taptapmaker/SKILL.md",
  "skills/threejs-to-taptapmaker/references/acceptance.md",
  "skills/threejs-to-taptapmaker/references/pipeline.md",
  "skills/threejs-to-taptapmaker/references/visual-compare.md",
  "skills/autodev-loop/SKILL.md",
  "skills/game-director/SKILL.md",
  "skills/game-publisher/SKILL.md",
  "skills/game-qa/SKILL.md",
  "skills/gameplay-engineer/SKILL.md",
  "skills/visual-repair-loop/SKILL.md",
  "skills/visual-repair-loop/references/visual-review.md",
]) {
  await access(join(packageRoot, relativePath));
}

const binaryName =
  process.platform === "win32" ? "kaying-for-taptap-core.exe" : "kaying-for-taptap-core";
const binaryPath = join(packageRoot, "bin", `${process.platform}-${process.arch}`, binaryName);
const binaryStat = await stat(binaryPath);
if (!binaryStat.isFile() || binaryStat.size === 0) {
  throw new Error(`Native runtime is missing or empty: ${binaryPath}`);
}
await access(binaryPath, process.platform === "win32" ? constants.F_OK : constants.X_OK);

const transcriptionBinaryName = process.platform === "win32" ? "t3m.exe" : "t3m";
const transcriptionBinaryPath = join(
  packageRoot,
  "bin",
  `${process.platform}-${process.arch}`,
  transcriptionBinaryName,
);
const transcriptionBinaryStat = await stat(transcriptionBinaryPath);
if (!transcriptionBinaryStat.isFile() || transcriptionBinaryStat.size === 0) {
  throw new Error(`Transcription runtime is missing or empty: ${transcriptionBinaryPath}`);
}
await access(
  transcriptionBinaryPath,
  process.platform === "win32" ? constants.F_OK : constants.X_OK,
);

process.stdout.write(
  `[kaying-for-taptap] assets verified for ${process.platform}-${process.arch}\n`,
);
