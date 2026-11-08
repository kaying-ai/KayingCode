#!/usr/bin/env node
// 开工前检查 GitHub 产品主线和当前分支的跟踪 ref。
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
let devRef = "origin/main";
let maxBehindDev = 50;
let doFetch = true;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--no-fetch") doFetch = false;
  else if (arg === "--dev-ref" && args[index + 1] && !args[index + 1].startsWith("--"))
    devRef = args[++index];
  else if (arg === "--max-behind-dev" && args[index + 1] !== undefined)
    maxBehindDev = Number(args[++index]);
  else {
    console.error(`[freshness] 参数无效或缺值：${arg}`);
    process.exit(2);
  }
}
if (!Number.isInteger(maxBehindDev) || maxBehindDev < 0) {
  console.error("[freshness] --max-behind-dev 需要一个非负整数");
  process.exit(2);
}
async function git(...gitArgs) {
  return (await execFile("git", gitArgs, { encoding: "utf8" })).stdout.trim();
}
async function hasCommonHistory(baseRef) {
  try {
    await git("merge-base", "HEAD", baseRef);
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
}
const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
if (doFetch) {
  let trackingRemote;
  try {
    trackingRemote = await git("config", "--get", `branch.${branch}.remote`);
  } catch {
    /* 未设置 tracking。 */
  }
  const remotes = new Set((await git("remote")).split("\n"));
  // 修复原因：旧脚本只 fetch 旧仓库 origin，当前分支若跟踪另一个 remote 会读取过期 refs。
  for (const remote of new Set(["origin", trackingRemote])) {
    if (remote && remote !== "." && remotes.has(remote)) await git("fetch", remote, "--prune");
  }
}
let upstream;
try {
  upstream = await git("rev-parse", "--abbrev-ref", "@{upstream}");
} catch {
  console.warn(`[freshness] ${branch} 没有远端跟踪分支，跳过 behind-remote 检查。`);
}
const failures = [];
if (upstream) {
  const behind = Number(await git("rev-list", "--count", `HEAD..${upstream}`));
  if (behind > 0)
    failures.push(
      `${branch} 落后 ${upstream} ${behind} 个提交：先 git merge --ff-only ${upstream}`,
    );
}
let report = "ZCode 镜像只检查跟踪 ref";
if (branch !== "zcode-main") {
  let exists = true;
  try {
    await git("rev-parse", "--verify", `${devRef}^{commit}`);
  } catch {
    exists = false;
  }
  if (!exists)
    failures.push(
      `找不到开发基线 ${devRef}，请先 fetch 或通过 --dev-ref 指定；请核对 origin 是否指向 GitHub 产品库。`,
    );
  else if (!(await hasCommonHistory(devRef))) {
    // GitHub 的审查快照与旧 Gitee 历史分开，提交数阈值无法识别迁移前的分支。
    failures.push(
      `${branch} 与开发基线 ${devRef} 没有共同祖先。浅克隆请先补齐历史，旧工作区请从 GitHub 重建开发分支。`,
    );
  } else {
    const ahead = Number(await git("rev-list", "--count", `${devRef}..HEAD`));
    const behind = Number(await git("rev-list", "--count", `HEAD..${devRef}`));
    report = `相对 ${devRef}：ahead ${ahead} / behind ${behind}（阈值 ${maxBehindDev}）`;
    if (behind > maxBehindDev) {
      const message = `落后 ${devRef} ${behind} 个提交，超过阈值 ${maxBehindDev}`;
      if (ahead === 0) failures.push(`${message}：git merge --ff-only ${devRef} 或重建分支`);
      else
        console.warn(
          `[freshness] 警告：${message}，当前分支另有 ${ahead} 个提交；请先确认合并状态再同步。`,
        );
    }
  }
}
if (failures.length) {
  console.error("[freshness] 基线过期/不可用，停止开工：");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `[freshness] 基线新鲜：${branch}${upstream ? `（跟踪 ${upstream}）` : ""}，${report}${doFetch ? "" : "；使用本地缓存 refs"}`,
);
