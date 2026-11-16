#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  printf 'install.sh must run as root\n' >&2
  exit 2
fi

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_ROOT="${BOT_ROOT:-/opt/kaying-bot/kaying-taptap-daily}"
STATE_ROOT="${STATE_ROOT:-/srv/kaying-bot/kaying-taptap-daily}"
CONFIG_ROOT="${CONFIG_ROOT:-/etc/kaying-bot/kaying-taptap-daily}"
RUN_ROOT="${RUN_ROOT:-/run/kaying-bot/kaying-taptap-daily}"
SERVICE_USER="${SERVICE_USER:-taptap}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"

ENABLE=0
FORCE_LOCAL_PLUGIN=-1
while [ $# -gt 0 ]; do
  case "$1" in
    --enable) ENABLE=1 ;;
    --with-local-plugin) FORCE_LOCAL_PLUGIN=1 ;;
    --no-local-plugin) FORCE_LOCAL_PLUGIN=0 ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

install -d -m 0755 "$BOT_ROOT" "$BOT_ROOT/tools" "$BOT_ROOT/tools/taptap-daily"
install -d -m 0755 "$STATE_ROOT" "$STATE_ROOT/workspace" \
  "$STATE_ROOT/workspace/.kayingcode/workflows" \
  "$STATE_ROOT/workspace/tools/taptap-daily" \
  "$STATE_ROOT/workspace/reports" "$STATE_ROOT/workspace/runs" \
  "$STATE_ROOT/.kayingcode/cli/plugins/installed" \
  "$CONFIG_ROOT" "$RUN_ROOT"

install -m 0755 "$BUNDLE_DIR"/dist/*.mjs "$BOT_ROOT/tools/taptap-daily/"
install -m 0755 "$BUNDLE_DIR"/dist/*.mjs "$STATE_ROOT/workspace/tools/taptap-daily/"
install -m 0755 "$BUNDLE_DIR/run-report.sh" "$BUNDLE_DIR/validate-run.mjs" \
  "$BUNDLE_DIR/publish-report.mjs" "$BUNDLE_DIR/healthcheck.sh" "$BOT_ROOT/"
install -m 0644 "$BUNDLE_DIR/workflows/taptap-daily.dwf.ts" \
  "$STATE_ROOT/workspace/.kayingcode/workflows/taptap-daily.dwf.ts"

if [ ! -f "$CONFIG_ROOT/report.env" ]; then
  install -m 0640 -o root -g "$SERVICE_GROUP" "$BUNDLE_DIR/report.env.example" "$CONFIG_ROOT/report.env"
  printf 'created %s; edit KAYINGCODE_BIN / webhook / base URL before enabling\n' "$CONFIG_ROOT/report.env"
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
LOCAL_PLUGIN=0
if [ "$FORCE_LOCAL_PLUGIN" -eq 1 ]; then
  LOCAL_PLUGIN=1
elif [ "$FORCE_LOCAL_PLUGIN" -eq 0 ]; then
  LOCAL_PLUGIN=0
elif [ -d "$BUNDLE_DIR/plugin" ] && ! find "$STATE_ROOT/.kayingcode/cli/plugins/cache" \
  -maxdepth 6 -type d -name kaying-taptap-daily 2>/dev/null | grep -q .; then
  LOCAL_PLUGIN=1
fi

if [ "$LOCAL_PLUGIN" -eq 1 ]; then
  PLUGIN_ROOT="$STATE_ROOT/.kayingcode/cli/plugins/installed/kaying-taptap-daily"
  rm -rf "$PLUGIN_ROOT"
  install -d -m 0755 "$PLUGIN_ROOT"
  cp -R "$BUNDLE_DIR/plugin/." "$PLUGIN_ROOT/"
  if [ -z "$NODE_BIN" ]; then
    printf 'node not found; cannot register local plugin automatically\n' >&2
    exit 1
  fi
  "$NODE_BIN" - "$STATE_ROOT" "$PLUGIN_ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [stateRoot, pluginRoot] = process.argv.slice(2);
const pluginState = path.join(stateRoot, ".kayingcode", "cli", "plugins");
fs.mkdirSync(pluginState, { recursive: true });
const installedFile = path.join(pluginState, "installed_plugins.json");
let installed = { plugins: [] };
try {
  installed = JSON.parse(fs.readFileSync(installedFile, "utf8"));
} catch {}
const plugins = Array.isArray(installed.plugins)
  ? installed.plugins.filter((plugin) => plugin && plugin.id !== "kaying-taptap-daily")
  : [];
plugins.push({ id: "kaying-taptap-daily", marketplace: "inline", installPath: pluginRoot });
fs.writeFileSync(installedFile, `${JSON.stringify({ ...installed, plugins }, null, 2)}\n`);
const configFile = path.join(stateRoot, ".kayingcode", "cli", "config.json");
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configFile, "utf8"));
} catch {}
config.plugins = config.plugins || {};
config.plugins.enabledPlugins = {
  ...(config.plugins.enabledPlugins || {}),
  "kaying-taptap-daily@inline": true,
};
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
NODE
else
  if [ -n "$NODE_BIN" ]; then
    "$NODE_BIN" - "$STATE_ROOT" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [stateRoot] = process.argv.slice(2);
const configFile = path.join(stateRoot, ".kayingcode", "cli", "config.json");
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configFile, "utf8"));
} catch {}
config.plugins = config.plugins || {};
config.plugins.enabledPlugins = {
  ...(config.plugins.enabledPlugins || {}),
  "kaying-taptap-daily@kayingcode-plugins-official": true,
};
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
NODE
  fi
fi

render_unit() {
  local source="$1"
  local target="$2"
  sed \
    -e "s|@BOT_ROOT@|$BOT_ROOT|g" \
    -e "s|@STATE_ROOT@|$STATE_ROOT|g" \
    -e "s|@CONFIG_ROOT@|$CONFIG_ROOT|g" \
    -e "s|@RUN_ROOT@|$RUN_ROOT|g" \
    -e "s|@SERVICE_USER@|$SERVICE_USER|g" \
    "$source" > "$target"
  chmod 0644 "$target"
}

for unit in \
  kaying-bot-taptap-daily.service \
  kaying-bot-taptap-daily.timer \
  kaying-bot-taptap-daily-health.service \
  kaying-bot-taptap-daily-health.timer; do
  render_unit "$BUNDLE_DIR/$unit" "$UNIT_DIR/$unit"
done

chown -R "$SERVICE_USER:$SERVICE_GROUP" "$STATE_ROOT" "$RUN_ROOT"
chown -R root:root "$BOT_ROOT"
chmod 0755 "$BOT_ROOT"

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload
  if [ "$ENABLE" -eq 1 ]; then
    systemctl enable --now kaying-bot-taptap-daily.timer kaying-bot-taptap-daily-health.timer
    printf 'timers enabled\n'
  fi
else
  printf 'systemctl not available; install units manually\n' >&2
fi

printf '\nInstalled kaying-taptap-daily:\n'
printf '  BOT_ROOT=%s\n' "$BOT_ROOT"
printf '  STATE_ROOT=%s\n' "$STATE_ROOT"
printf '  CONFIG=%s\n' "$CONFIG_ROOT/report.env"
if [ "$LOCAL_PLUGIN" -eq 1 ]; then
  printf '  plugin=local (%s)\n' "$STATE_ROOT/.kayingcode/cli/plugins/installed/kaying-taptap-daily"
else
  printf '  plugin=official cache\n'
fi
printf '\nNext:\n'
printf '  1. Edit %s (KAYINGCODE_BIN, model provider, webhook, public base URL).\n' "$CONFIG_ROOT/report.env"
printf '  2. Dry run: sudo -u %s REPORT_DATE=%s %s/run-report.sh --force\n' "$SERVICE_USER" "$(TZ=Asia/Shanghai date +%F)" "$BOT_ROOT"
printf '  3. Enable: systemctl enable --now kaying-bot-taptap-daily.timer\n'
printf '  4. Verify: systemctl list-timers | grep kaying-bot-taptap-daily; journalctl -u kaying-bot-taptap-daily -n 100\n'
