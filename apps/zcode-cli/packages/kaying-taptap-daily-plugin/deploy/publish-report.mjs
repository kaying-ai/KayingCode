#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values[name] = next;
      index += 1;
    } else {
      values[name] = true;
    }
  }
  return values;
}

function trimTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function buildText(report, baseUrl) {
  const lines = [
    `TapTap 游戏日报 ${report.reportDate}`,
    `质量：${report.dataQuality === "ok" ? "正常" : "降级"}`,
    `首发 ${report.counts.release7d} · 新开预约 ${report.counts.reservation7d} · 测试 ${report.counts.test7d}`,
  ];
  const topGenre =
    Array.isArray(report.topGenres) && report.topGenres.length > 0 ? report.topGenres[0] : null;
  if (topGenre) {
    lines.push(`最拥挤赛道：${topGenre.label} ${topGenre.score}（${topGenre.level}）`);
  }
  for (const item of (report.summary ?? []).slice(0, 3)) lines.push(`• ${item}`);
  const url = baseUrl ? `${baseUrl}/${report.reportDate}/` : report.reportUrl;
  if (url) lines.push(`报告：${url}`);
  return lines.join("\n");
}

function signFeishu(secret) {
  if (!secret) return {};
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64");
  return { timestamp, sign };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`webhook HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text;
}

const args = parseArgs(process.argv.slice(2));
const date = String(args.date ?? "");
const workspace = String(args.workspace ?? "");
const alert = typeof args.alert === "string" ? args.alert : "";
const strict = args.strict === true;
const baseUrl = trimTrailingSlash(process.env.REPORT_PUBLIC_BASE_URL);

try {
  let text;
  let webhook;
  if (alert) {
    webhook = process.env.LARK_ALERT_WEBHOOK_URL || process.env.LARK_WEBHOOK_URL || "";
    text = `❌ TapTap 游戏日报失败 ${date}\n${alert}`;
  } else {
    if (!date || !workspace) throw new Error("--date and --workspace are required");
    const report = JSON.parse(
      await readFile(join(workspace, "reports", date, "report.json"), "utf8"),
    );
    webhook = process.env.LARK_WEBHOOK_URL || "";
    text = buildText(report, baseUrl);
  }

  if (!webhook) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, skipped: true, reason: "webhook not configured" })}\n`,
    );
    process.exit(0);
  }

  const signature = signFeishu(process.env.LARK_WEBHOOK_SECRET);
  await postJson(webhook, {
    ...signature,
    msg_type: "text",
    content: { text },
  });
  process.stdout.write(`${JSON.stringify({ ok: true, published: true, alert: Boolean(alert) })}\n`);
} catch (error) {
  process.stderr.write(
    `[publish-report] WARNING: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(strict ? 1 : 0);
}
