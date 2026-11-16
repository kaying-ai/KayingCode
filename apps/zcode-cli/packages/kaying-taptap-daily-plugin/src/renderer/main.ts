import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { optionalStringArg, parseArgs, requireStringArg } from "../lib/args.js";
import { isDateString } from "../lib/date.js";
import { readJsonIfExists, writeJsonAtomic, writeTextAtomic } from "../lib/json.js";
import { validateSnapshot } from "../collector/snapshot.js";
import type { Insights, Metrics, Snapshot } from "../types.js";
import { renderArchiveIndex, type ArchiveEntry } from "./html.js";
import { archiveEntryFromReport, renderReport, type ReportJson } from "./renderReport.js";

function validateMetrics(metrics: Metrics, snapshot: Snapshot): void {
  if (metrics.schemaVersion !== 1)
    throw new Error(`unsupported metrics.schemaVersion: ${metrics.schemaVersion}`);
  if (metrics.reportDate !== snapshot.reportDate) {
    throw new Error(
      `metrics.reportDate ${metrics.reportDate} does not match snapshot ${snapshot.reportDate}`,
    );
  }
  if (metrics.snapshotHash !== snapshot.contentHash) {
    throw new Error("metrics.snapshotHash does not match snapshot.contentHash");
  }
  if (!Array.isArray(metrics.genres)) throw new Error("metrics.genres must be an array");
}

async function loadInsights(
  path: string | null,
  inline: string | null,
): Promise<{ insights: Insights; warning: string | null }> {
  let raw: unknown = null;
  if (inline) {
    raw = JSON.parse(inline);
  } else if (path) {
    raw = await readJsonIfExists<unknown>(path);
    if (raw === null) {
      return {
        insights: emptyInsights(),
        warning: `insights file not found: ${path}`,
      };
    }
  }
  if (!raw || typeof raw !== "object") {
    return {
      insights: emptyInsights(),
      warning: "insights missing; rendered deterministic sections only",
    };
  }
  const source = raw as Partial<Insights>;
  return {
    insights: {
      schemaVersion: 1,
      generatedAt:
        typeof source.generatedAt === "string" ? source.generatedAt : new Date().toISOString(),
      summary: Array.isArray(source.summary) ? source.summary.map(String) : [],
      newGames: Array.isArray(source.newGames) ? source.newGames : [],
      boards: Array.isArray(source.boards) ? source.boards : [],
      tracks: Array.isArray(source.tracks) ? source.tracks : [],
      opportunities: Array.isArray(source.opportunities) ? source.opportunities : [],
      risks: Array.isArray(source.risks) ? source.risks : [],
      dataNotes: Array.isArray(source.dataNotes) ? source.dataNotes.map(String) : [],
    },
    warning: null,
  };
}

function emptyInsights(): Insights {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: [],
    newGames: [],
    boards: [],
    tracks: [],
    opportunities: [],
    risks: [],
    dataNotes: [],
  };
}

async function collectArchiveEntries(
  reportsRoot: string,
  current: ReportJson,
): Promise<ArchiveEntry[]> {
  const entries = new Map<string, ArchiveEntry>();
  entries.set(current.reportDate, archiveEntryFromReport(current));
  let children;
  try {
    children = await readdir(reportsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [...entries.values()];
    throw error;
  }
  for (const child of children) {
    if (!child.isDirectory() || !isDateString(child.name) || entries.has(child.name)) continue;
    const report = await readJsonIfExists<ReportJson>(join(reportsRoot, child.name, "report.json"));
    if (!report || report.reportDate !== child.name) continue;
    entries.set(child.name, archiveEntryFromReport(report));
  }
  return [...entries.values()];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = requireStringArg(args, "snapshot");
  const metricsPath = requireStringArg(args, "metrics");
  const snapshot = await readJsonIfExists<Snapshot>(snapshotPath);
  if (!snapshot) throw new Error(`snapshot not found: ${snapshotPath}`);
  validateSnapshot(snapshot);
  const metrics = await readJsonIfExists<Metrics>(metricsPath);
  if (!metrics) throw new Error(`metrics not found: ${metricsPath}`);
  validateMetrics(metrics, snapshot);

  const insightsPath = optionalStringArg(args, "insights", "");
  const insightsJson = optionalStringArg(args, "insights-json", "");
  const { insights, warning: insightsWarning } = await loadInsights(
    insightsPath || null,
    insightsJson || null,
  );
  const outDir = optionalStringArg(args, "out-dir", join("reports", snapshot.reportDate));
  const reportsRoot = optionalStringArg(args, "reports-root", dirname(outDir));
  const publicBaseUrl = optionalStringArg(args, "public-base-url", "");
  const generatedAt = optionalStringArg(args, "generated-at", new Date().toISOString());

  const rendered = renderReport({ snapshot, metrics, insights, publicBaseUrl, generatedAt });
  if (insightsWarning) {
    rendered.reportJson.warnings.push({
      code: "insights_missing",
      message: insightsWarning,
    });
  }
  const archiveEntries = await collectArchiveEntries(reportsRoot, rendered.reportJson);

  await writeTextAtomic(join(outDir, "report.md"), rendered.markdown);
  await writeTextAtomic(join(outDir, "report.html"), rendered.html);
  await writeTextAtomic(join(outDir, "index.html"), rendered.html);
  await writeJsonAtomic(join(outDir, "report.json"), rendered.reportJson);
  await writeTextAtomic(join(reportsRoot, "index.html"), renderArchiveIndex(archiveEntries));

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      reportDate: snapshot.reportDate,
      outDir,
      markdown: join(outDir, "report.md"),
      html: join(outDir, "report.html"),
      reportJson: join(outDir, "report.json"),
      archiveIndex: join(reportsRoot, "index.html"),
      reportUrl: rendered.reportJson.reportUrl,
      dataQuality: rendered.reportJson.dataQuality,
      warnings: rendered.reportJson.warnings.length,
      archiveEntries: archiveEntries.length,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[renderer] FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
