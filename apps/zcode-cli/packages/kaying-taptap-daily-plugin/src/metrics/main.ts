import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { optionalStringArg, parseArgs, requireStringArg } from "../lib/args.js";
import { addDays, isDateString } from "../lib/date.js";
import { readJsonIfExists, writeJsonAtomic } from "../lib/json.js";
import type { Snapshot, Warning } from "../types.js";
import { computeMetrics } from "./computeMetrics.js";
import { validateSnapshot } from "../collector/snapshot.js";

const MAX_PREVIOUS_GAP_DAYS = 7;

async function findPreviousSnapshot(
  historyDir: string,
  reportDate: string,
): Promise<Snapshot | null> {
  let entries;
  try {
    entries = await readdir(historyDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const dates = entries
    .filter((entry) => entry.isDirectory() && isDateString(entry.name) && entry.name < reportDate)
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const date of dates) {
    const candidate = await readJsonIfExists<Snapshot>(join(historyDir, date, "snapshot.json"));
    if (!candidate) continue;
    try {
      validateSnapshot(candidate);
      return candidate;
    } catch {
      // 损坏的历史快照不阻塞当天日报；继续找更早的一份。
    }
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = requireStringArg(args, "snapshot");
  const out = optionalStringArg(args, "out", join(dirname(snapshotPath), "metrics.json"));
  const historyDir = optionalStringArg(args, "history-dir", "data/daily");
  const explicitPrevious = optionalStringArg(args, "previous", "");

  const snapshot = await readJsonIfExists<Snapshot>(snapshotPath);
  if (!snapshot) throw new Error(`snapshot not found: ${snapshotPath}`);
  validateSnapshot(snapshot);

  const warnings: Warning[] = [];
  let previous: Snapshot | null = null;
  if (explicitPrevious) {
    previous = await readJsonIfExists<Snapshot>(explicitPrevious);
    if (!previous) throw new Error(`previous snapshot not found: ${explicitPrevious}`);
    validateSnapshot(previous);
  } else {
    previous = await findPreviousSnapshot(historyDir, snapshot.reportDate);
    if (previous) {
      const gapStart = addDays(snapshot.reportDate, -MAX_PREVIOUS_GAP_DAYS);
      if (previous.reportDate < gapStart) {
        warnings.push({
          code: "previous_snapshot_too_old",
          message: `上一份快照 ${previous.reportDate} 超过 ${MAX_PREVIOUS_GAP_DAYS} 天，忽略排名变化`,
          details: { previousReportDate: previous.reportDate, reportDate: snapshot.reportDate },
        });
        previous = null;
      }
    }
  }

  const metrics = computeMetrics(snapshot, previous, new Date().toISOString());
  metrics.warnings.push(...warnings);
  await writeJsonAtomic(out, metrics);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      metrics: out,
      reportDate: metrics.reportDate,
      snapshotHash: metrics.snapshotHash,
      previousReportDate: metrics.previousReportDate,
      dataQuality: metrics.dataQuality,
      counts: metrics.counts,
      genres: metrics.genres.length,
      boardUnion: metrics.boardUnion.length,
      warnings: metrics.warnings.length,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[metrics] FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
