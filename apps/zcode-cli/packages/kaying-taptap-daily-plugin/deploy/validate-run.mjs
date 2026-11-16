#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));
const date = String(args.date ?? "");
const workspace = String(args.workspace ?? "");
const expectedSource = String(args["expect-source"] ?? "");
const startedAt = String(args["started-at"] ?? new Date().toISOString());
const durationMs = Number(args["duration-ms"] ?? 0);
const exitCode = Number(args["exit-code"] ?? 0);
const attempt = Number(args.attempt ?? 1);
const out = String(args.out ?? join(workspace, "runs", date, "run.json"));
const failMessage = typeof args["fail-message"] === "string" ? args["fail-message"] : "";

if (!date || !workspace) {
  process.stderr.write("[validate-run] --date and --workspace are required\n");
  process.exit(2);
}

const errors = [];
const warnings = [];
let status = "success";

if (failMessage) {
  errors.push(failMessage);
} else {
  const reportDir = join(workspace, "reports", date);
  const dataDir = join(workspace, "data", "daily", date);
  let snapshot;
  let metrics;
  let report;
  let markdown;
  try {
    snapshot = await readJson(join(dataDir, "snapshot.json"));
    metrics = await readJson(join(dataDir, "metrics.json"));
    report = await readJson(join(reportDir, "report.json"));
    markdown = await readFile(join(reportDir, "report.md"), "utf8");
    await readFile(join(reportDir, "report.html"), "utf8");
  } catch (error) {
    errors.push(
      `required artifact missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (snapshot) {
    if (snapshot.schemaVersion !== 1)
      errors.push(`snapshot.schemaVersion is ${snapshot.schemaVersion}`);
    if (snapshot.reportDate !== date)
      errors.push(`snapshot.reportDate ${snapshot.reportDate} != ${date}`);
    if (typeof snapshot.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.contentHash)) {
      errors.push("snapshot.contentHash is invalid");
    } else {
      const { contentHash, ...rest } = snapshot;
      const recomputed = sha256(stableStringify(rest));
      if (recomputed !== contentHash) errors.push("snapshot.contentHash does not match content");
    }
    const boards = ["download", "reserve", "pop"];
    const totalItems = boards.reduce(
      (sum, board) => sum + (snapshot.boards?.[board]?.items?.length ?? 0),
      0,
    );
    if (totalItems === 0) errors.push("all three boards are empty");
    if ((snapshot.calendar?.daysAvailable ?? 0) < 7) {
      errors.push(`calendar daysAvailable ${snapshot.calendar?.daysAvailable ?? 0} < 7`);
    }
    if (expectedSource && snapshot.source?.kind !== expectedSource) {
      errors.push(`snapshot.source.kind ${snapshot.source?.kind} != expected ${expectedSource}`);
    }
    for (const warning of snapshot.warnings ?? []) {
      if (String(warning.code).includes("failed"))
        warnings.push(`${warning.code}: ${warning.message}`);
    }
  }

  if (snapshot && metrics) {
    if (metrics.schemaVersion !== 1)
      errors.push(`metrics.schemaVersion is ${metrics.schemaVersion}`);
    if (metrics.reportDate !== date)
      errors.push(`metrics.reportDate ${metrics.reportDate} != ${date}`);
    if (metrics.snapshotHash !== snapshot.contentHash)
      errors.push("metrics.snapshotHash != snapshot.contentHash");
    if (typeof metrics.genres?.length !== "number" || metrics.genres.length === 0) {
      errors.push("metrics.genres is empty");
    }
  }

  if (snapshot && report) {
    if (report.schemaVersion !== 1) errors.push(`report.schemaVersion is ${report.schemaVersion}`);
    if (report.reportDate !== date)
      errors.push(`report.reportDate ${report.reportDate} != ${date}`);
    if (report.snapshotHash !== snapshot.contentHash)
      errors.push("report.snapshotHash != snapshot.contentHash");
    if (report.dataQuality !== metrics?.dataQuality)
      warnings.push("report.dataQuality != metrics.dataQuality");
  }

  if (markdown) {
    const headings = [
      "## 01 今日速览",
      "## 02 新游发现",
      "## 03 热门游戏",
      "## 04 题材赛道",
      "## 05 机会与风险",
      "## 06 数据说明",
      "## 07 附录",
    ];
    for (const heading of headings) {
      if (!markdown.includes(heading)) errors.push(`report.md missing heading: ${heading}`);
    }
    if (/TODO|FIXME|\{\{|\bundefined\b/.test(markdown)) {
      errors.push("report.md contains placeholders");
    }
    if (markdown.length < 2_000) warnings.push("report.md is shorter than 2000 chars");
  }

  if (errors.length > 0) status = "failed";
  else if (report?.dataQuality === "degraded" || warnings.length > 0) status = "degraded";
}

if (typeof args.status === "string") status = args.status;
if (failMessage) status = "failed";
const run = {
  reportDate: date,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: Number.isFinite(durationMs) ? durationMs : 0,
  exitCode: Number.isFinite(exitCode) ? exitCode : 0,
  attempt: Number.isFinite(attempt) ? attempt : 1,
  status,
  errors,
  warnings,
};
await writeJson(out, run);
if (errors.length > 0) {
  process.stderr.write(`[validate-run] FAILED: ${errors.join("; ")}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ ok: true, out, status, warnings: warnings.length })}\n`);
