#!/usr/bin/env bash
set -Eeuo pipefail

BOT_ROOT="${BOT_ROOT:-/opt/kaying-bot/kaying-taptap-daily}"
STATE_ROOT="${STATE_ROOT:-/srv/kaying-bot/kaying-taptap-daily}"
CONFIG_ROOT="${CONFIG_ROOT:-/etc/kaying-bot/kaying-taptap-daily}"
RUN_ROOT="${RUN_ROOT:-/run/kaying-bot/kaying-taptap-daily}"
WORKSPACE="${WORKSPACE:-$STATE_ROOT/workspace}"
ENV_FILE="${REPORT_ENV_FILE:-$CONFIG_ROOT/report.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

REPORT_DATE="${REPORT_DATE:-$(TZ=Asia/Shanghai date +%F)}"
SOURCE="${TAPTAP_DAILY_SOURCE:-http}"
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --source)
      SOURCE="${2:-}"
      shift
      ;;
    --source=*) SOURCE="${1#*=}" ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

case "$SOURCE" in
  http|import) ;;
  *)
    printf 'invalid source: %s (expected http or import)\n' "$SOURCE" >&2
    exit 2
    ;;
esac

KAYINGCODE_BIN="${KAYINGCODE_BIN:-$(command -v kayingcode || true)}"
if [ -z "$KAYINGCODE_BIN" ] || [ ! -x "$KAYINGCODE_BIN" ]; then
  printf 'kayingcode binary not found or not executable: %s\n' "${KAYINGCODE_BIN:-<empty>}" >&2
  exit 2
fi

MODE="${TAPTAP_DAILY_MODE:-build}"
TIMEOUT_SECONDS="${TAPTAP_DAILY_TIMEOUT_SECONDS:-3600}"
RETRY_TIMEOUT_SECONDS="${TAPTAP_DAILY_RETRY_TIMEOUT_SECONDS:-1200}"
CALENDAR_DAYS="${TAPTAP_DAILY_CALENDAR_DAYS:-30}"
MAX_NEW_GAMES="${TAPTAP_DAILY_MAX_NEW_GAMES:-6}"
MAX_TRACKS="${TAPTAP_DAILY_MAX_TRACKS:-8}"
CONCURRENCY="${TAPTAP_DAILY_CONCURRENCY:-5}"
SUBAGENT_MODEL="${TAPTAP_DAILY_SUBAGENT_MODEL:-}"

REPORT_DIR="$WORKSPACE/reports/$REPORT_DATE"
RUN_DIR="$WORKSPACE/runs/$REPORT_DATE"
mkdir -p "$WORKSPACE" "$REPORT_DIR" "$RUN_DIR" "$RUN_ROOT"

exec 9>"$RUN_ROOT/taptap-daily.lock"
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then
    printf 'another report run holds the lock; exiting\n' >&2
    exit 0
  fi
else
  LOCK_DIR="$RUN_ROOT/taptap-daily.lockdir"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    printf 'another report run holds the lock; exiting\n' >&2
    exit 0
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
fi

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date +%s)"

EXPECTED_SOURCE="$SOURCE"
if [ "$SOURCE" = "http" ]; then
  EXPECTED_SOURCE="web"
fi

if [ "$FORCE" -ne 1 ] && [ -s "$REPORT_DIR/report.json" ] && [ -s "$REPORT_DIR/report.html" ]; then
  if node "$BOT_ROOT/validate-run.mjs" \
    --date "$REPORT_DATE" \
    --workspace "$WORKSPACE" \
    --expect-source "$EXPECTED_SOURCE" \
    --started-at "$STARTED_AT" \
    --out "$RUN_DIR/run.json" >/dev/null 2>&1; then
    printf 'report already exists for %s; skipping (use --force to regenerate)\n' "$REPORT_DATE"
    exit 0
  fi
  printf 'existing report failed validation; regenerating %s\n' "$REPORT_DATE" >&2
fi

if [ "$SOURCE" = "import" ]; then
  IMPORT_DIR="$WORKSPACE/data/daily/$REPORT_DATE/import"
  if [ ! -s "$IMPORT_DIR/calendar.json" ] && [ ! -s "$IMPORT_DIR/calendar.csv" ]; then
    printf 'import data missing: %s (boards/calendar json or csv required)\n' "$IMPORT_DIR" >&2
    exit 1
  fi
fi

MODEL_ARG=""
if [ -n "$SUBAGENT_MODEL" ]; then
  MODEL_ARG="，subagent_model=\"${SUBAGENT_MODEL}\""
fi
PROMPT="使用 dynamic-workflows 技能。调用 CreateWorkflow，saved={\"name\":\"taptap-daily\",\"args\":{\"date\":\"${REPORT_DATE}\",\"source\":\"${SOURCE}\",\"calendarDays\":${CALENDAR_DAYS},\"maxNewGames\":${MAX_NEW_GAMES},\"maxTracks\":${MAX_TRACKS}}}，max_concurrency=${CONCURRENCY}${MODEL_ARG}。不要修改工作流脚本；不要使用 Bash、Read、WebFetch 检查文件，直接提交 saved workflow。完成后确认 reports/${REPORT_DATE}/report.html、report.md、report.json 存在。"

run_once() {
  local timeout_seconds="$1"
  local timeout_cmd=()
  if command -v timeout >/dev/null 2>&1; then
    timeout_cmd=(timeout --signal=TERM --kill-after=120 "$timeout_seconds")
  fi
  cd "$WORKSPACE"
  "${timeout_cmd[@]}" \
    "$KAYINGCODE_BIN" \
    --workflow-mode alwaysOn \
    --mode "$MODE" \
    --output-format stream-json \
    -p "$PROMPT" \
    > "$RUN_DIR/stream.jsonl" 2> "$RUN_DIR/stderr.log"
}

ATTEMPT=1
set +e
run_once "$TIMEOUT_SECONDS"
CODE=$?
set -e

if [ "$CODE" -ne 0 ] || [ ! -s "$REPORT_DIR/report.json" ]; then
  printf 'first attempt failed (exit %s); retrying in 30s\n' "$CODE" >&2
  sleep 30
  ATTEMPT=2
  set +e
  run_once "$RETRY_TIMEOUT_SECONDS"
  CODE=$?
  set -e
fi

DURATION_MS=$(( ($(date +%s) - START_EPOCH) * 1000 ))

if [ "$CODE" -eq 0 ] && [ -s "$REPORT_DIR/report.json" ]; then
  if node "$BOT_ROOT/validate-run.mjs" \
    --date "$REPORT_DATE" \
    --workspace "$WORKSPACE" \
    --expect-source "$EXPECTED_SOURCE" \
    --started-at "$STARTED_AT" \
    --duration-ms "$DURATION_MS" \
    --exit-code "$CODE" \
    --attempt "$ATTEMPT" \
    --out "$RUN_DIR/run.json"; then
    node "$BOT_ROOT/publish-report.mjs" --date "$REPORT_DATE" --workspace "$WORKSPACE" || true
    exit 0
  fi
fi

node "$BOT_ROOT/validate-run.mjs" \
  --date "$REPORT_DATE" \
  --workspace "$WORKSPACE" \
  --fail-message "workflow exit $CODE; stderr: $RUN_DIR/stderr.log" \
  --started-at "$STARTED_AT" \
  --duration-ms "$DURATION_MS" \
  --exit-code "$CODE" \
  --attempt "$ATTEMPT" \
  --out "$RUN_DIR/run.json" >/dev/null 2>&1 || true

node "$BOT_ROOT/publish-report.mjs" \
  --date "$REPORT_DATE" \
  --alert "工作流退出码 ${CODE}；日志：$RUN_DIR/stderr.log" || true

printf 'report failed for %s (exit %s); see %s\n' "$REPORT_DATE" "$CODE" "$RUN_DIR" >&2
exit 1
