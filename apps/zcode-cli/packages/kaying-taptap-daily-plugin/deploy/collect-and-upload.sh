#!/usr/bin/env bash
# 在一台可以访问 www.taptap.cn 的机器上运行：
#   1. 用本机 collector 采集当日 TapTap 数据；
#   2. 导出 boards.json/calendar.json；
#   3. 通过 SSH 上传到服务器的 import 目录。
#
# 服务器出口被 TapTap WAF 拦截时，用它配合服务器上的 TAPTAP_DAILY_SOURCE=import。
# 建议在服务器 09:00 定时任务之前运行（例如本机 08:40）。
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
REPORT_DATE="${REPORT_DATE:-$(TZ=Asia/Shanghai date +%F)}"
WORK_ROOT="${WORK_ROOT:-$HOME/.cache/kaying-taptap-daily}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_STATE="${REMOTE_STATE:-/srv/kaying-bot/kaying-taptap-daily}"
REMOTE_USER="${REMOTE_USER:-root}"
CALENDAR_DAYS="${CALENDAR_DAYS:-30}"
BOARD_LIMIT="${BOARD_LIMIT:-50}"

if [ -z "$REMOTE_HOST" ]; then
  printf 'REMOTE_HOST is required, e.g. REMOTE_HOST=1.2.3.4 %s\n' "$0" >&2
  exit 2
fi
if [ -z "${KAYINGCODE_NODE:-}" ]; then
  KAYINGCODE_NODE="$(command -v node || true)"
fi
if [ -z "$KAYINGCODE_NODE" ] || [ ! -x "$KAYINGCODE_NODE" ]; then
  printf 'node not found; set KAYINGCODE_NODE\n' >&2
  exit 2
fi
if [ ! -f "$PLUGIN_ROOT/dist/collector.mjs" ]; then
  printf 'collector not built: %s/dist/collector.mjs\n' "$PLUGIN_ROOT" >&2
  printf 'run: pnpm --filter @kayingcode/kaying-taptap-daily-plugin run build\n' >&2
  exit 2
fi

DAY_DIR="$WORK_ROOT/$REPORT_DATE"
IMPORT_DIR="$DAY_DIR/import"
mkdir -p "$DAY_DIR"

printf '[sync] collecting %s on local network\n' "$REPORT_DATE"
"$KAYINGCODE_NODE" "$PLUGIN_ROOT/dist/collector.mjs" \
  --date "$REPORT_DATE" \
  --calendar-days "$CALENDAR_DAYS" \
  --board-limit "$BOARD_LIMIT" \
  --out "$DAY_DIR/snapshot.json" \
  --raw-dir "$DAY_DIR/raw"

printf '[sync] exporting import files\n'
"$KAYINGCODE_NODE" "$PLUGIN_ROOT/scripts/export-import.mjs" \
  --snapshot "$DAY_DIR/snapshot.json" \
  --out-dir "$IMPORT_DIR"

REMOTE_TARGET="$REMOTE_USER@$REMOTE_HOST"
REMOTE_IMPORT="$REMOTE_STATE/workspace/data/daily/$REPORT_DATE/import"

printf '[sync] uploading to %s:%s\n' "$REMOTE_TARGET" "$REMOTE_IMPORT"
ssh -o StrictHostKeyChecking=accept-new "$REMOTE_TARGET" \
  "mkdir -p '$REMOTE_IMPORT' && chown -R taptap:taptap '$REMOTE_IMPORT'"
scp -o StrictHostKeyChecking=accept-new \
  "$IMPORT_DIR/boards.json" "$IMPORT_DIR/calendar.json" \
  "$REMOTE_TARGET:$REMOTE_IMPORT/"
ssh -o StrictHostKeyChecking=accept-new "$REMOTE_TARGET" \
  "chown -R taptap:taptap '$REMOTE_IMPORT' && ls -lh '$REMOTE_IMPORT'"

printf '[sync] done: %s\n' "$REPORT_DATE"
printf 'server will use TAPTAP_DAILY_SOURCE=import at its scheduled run\n'
