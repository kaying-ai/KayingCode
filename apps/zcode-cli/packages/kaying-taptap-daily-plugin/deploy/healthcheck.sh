#!/usr/bin/env bash
set -Eeuo pipefail

BOT_ROOT="${BOT_ROOT:-/opt/kaying-bot/kaying-taptap-daily}"
STATE_ROOT="${STATE_ROOT:-/srv/kaying-bot/kaying-taptap-daily}"
CONFIG_ROOT="${CONFIG_ROOT:-/etc/kaying-bot/kaying-taptap-daily}"
WORKSPACE="${WORKSPACE:-$STATE_ROOT/workspace}"
ENV_FILE="${REPORT_ENV_FILE:-$CONFIG_ROOT/report.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

LATEST_RUN="$(node - "$WORKSPACE" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const workspace = process.argv[2];
const runsDir = path.join(workspace, "runs");
let best = null;
try {
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(runsDir, entry.name, "run.json");
    try {
      const stat = fs.statSync(candidate);
      if (!best || stat.mtimeMs > best.mtimeMs) best = { path: candidate, mtimeMs: stat.mtimeMs };
    } catch {}
  }
} catch {}
if (best) process.stdout.write(best.path);
NODE
)"
if [ -z "$LATEST_RUN" ]; then
  node "$BOT_ROOT/publish-report.mjs" --date "$(TZ=Asia/Shanghai date +%F)" --alert "未找到任何 run.json；日报服务可能从未成功运行" || true
  printf 'healthcheck failed: no run.json found\n' >&2
  exit 1
fi

if ! node - "$LATEST_RUN" "$WORKSPACE" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [runPath, workspace] = process.argv.slice(2);
const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
const finished = Date.parse(run.finishedAt || run.startedAt || "");
if (!Number.isFinite(finished)) {
  console.error(`invalid finishedAt in ${runPath}`);
  process.exit(1);
}
const ageHours = (Date.now() - finished) / 3_600_000;
if (!["success", "degraded"].includes(run.status)) {
  console.error(`latest status is ${run.status}: ${runPath}`);
  process.exit(1);
}
if (ageHours > 26) {
  console.error(`latest report is ${ageHours.toFixed(1)}h old: ${runPath}`);
  process.exit(1);
}
const reportHtml = path.join(workspace, "reports", run.reportDate, "report.html");
if (!fs.existsSync(reportHtml)) {
  console.error(`report.html missing: ${reportHtml}`);
  process.exit(1);
}
const indexHtml = path.join(workspace, "reports", "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error(`archive index missing: ${indexHtml}`);
  process.exit(1);
}
console.log(`healthcheck ok: ${run.reportDate} ${run.status} age=${ageHours.toFixed(1)}h`);
NODE
then
  node "$BOT_ROOT/publish-report.mjs" --date "$(TZ=Asia/Shanghai date +%F)" --alert "健康检查失败；最新 run：$LATEST_RUN" || true
  exit 1
fi
