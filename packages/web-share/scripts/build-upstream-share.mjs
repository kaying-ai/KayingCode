import { spawn } from "node:child_process";
import { cp, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stageUpstreamWeb } from "../../web/scripts/stage-upstream-web.mjs";

const shareRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(shareRoot, "../..");
const webRoot = resolve(repoRoot, "packages/web");

function command(bin, args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(bin, args, { cwd, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? done() : reject(new Error(`${bin} exited ${code}`))));
  });
}

// 修复原因：1261a317 切换上游 Web V2 后，packages/web/src/share 等官方源码不再复制进产品目录，
// 但 web-share 仍按相对路径引用它们，导致 build:bootstrap 在 vite 解析阶段失败。
// 这里改为与 @zcode/web 共用固定官方提交导出（.cache/upstream-web/<commit>），
// 只把本仓的 localrun 入口覆盖写回 stage，再在 stage 内构建分享页。
const { stage, source } = await stageUpstreamWeb({ webRoot, repoRoot });
const stagedShare = resolve(stage, "packages/web-share");
// 保留的本地差异：localrun 下禁用官方 OAuth 的入口与回调页；分享页主体仍来自官方导出。
await cp(resolve(shareRoot, "src"), resolve(stagedShare, "src"), {
  recursive: true,
  force: true,
});
// 上游与本地入口必须同时存在，否则下面构建出的可能是不带 localrun 降级的旧页面。
for (const relative of ["src/main.tsx", "src/ShareAuthPages.tsx"]) {
  await readFile(resolve(stagedShare, relative), "utf8");
}
const viteBin = resolve(repoRoot, "node_modules/vite/bin/vite.js");
await command(
  process.execPath,
  process.argv.includes("--dev")
    ? [viteBin, "--host", "127.0.0.1"]
    : [viteBin, "build", "--outDir", resolve(shareRoot, "dist"), "--emptyOutDir"],
  stagedShare,
);
console.log(`Official Web Share built from ${source.commit}`);
