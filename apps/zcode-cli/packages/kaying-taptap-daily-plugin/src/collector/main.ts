import { join } from "node:path";

import { booleanArg, optionalNumberArg, optionalStringArg, parseArgs } from "../lib/args.js";
import { assertDateString, dateRange, shanghaiDateString } from "../lib/date.js";
import { writeJsonAtomic } from "../lib/json.js";
import type { BoardId, BoardSnapshot, Evidence, Snapshot, Warning } from "../types.js";
import { BOARDS } from "../types.js";
import { fetchBoard } from "./boards.js";
import { fetchCalendar } from "./calendar.js";
import { TapTapHttpClient } from "./httpTransport.js";
import { loadImportSource } from "./importSource.js";
import { buildSnapshot, validateSnapshot } from "./snapshot.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportDate = assertDateString(
    optionalStringArg(args, "date", shanghaiDateString()),
    "--date",
  );
  const outputDir = optionalStringArg(args, "out-dir", join("data", "daily", reportDate));
  const out = optionalStringArg(args, "out", join(outputDir, "snapshot.json"));
  const rawDir = optionalStringArg(args, "raw-dir", join(outputDir, "raw"));
  const source = optionalStringArg(args, "source", "http");
  const importDir = optionalStringArg(args, "import-dir", join(outputDir, "import"));
  const calendarDays = optionalNumberArg(args, "calendar-days", 30);
  const boardLimit = optionalNumberArg(args, "board-limit", 50);
  const minIntervalMs = optionalNumberArg(args, "min-interval-ms", 350);
  const baseUrl = optionalStringArg(args, "base-url", "https://www.taptap.cn");
  const proxyBaseUrl = optionalStringArg(
    args,
    "proxy-base-url",
    process.env.TAPTAP_PROXY_BASE_URL ?? "",
  );
  const proxyToken = optionalStringArg(args, "proxy-token", process.env.TAPTAP_PROXY_TOKEN ?? "");
  const verbose = booleanArg(args, "verbose");
  const capturedAt = new Date().toISOString();

  if (calendarDays < 7) throw new Error("--calendar-days must be >= 7");
  if (boardLimit < 10 || boardLimit > 50)
    throw new Error("--board-limit must be between 10 and 50");
  if (proxyBaseUrl && !proxyToken) {
    throw new Error("TAPTAP_PROXY_TOKEN is required when TAPTAP_PROXY_BASE_URL is set");
  }

  let boards: Record<BoardId, BoardSnapshot>;
  let calendar: Snapshot["calendar"];
  let evidence: Evidence[];
  let warnings: Warning[];
  let sourceInfo: Snapshot["source"];

  if (source === "import") {
    const imported = await loadImportSource(importDir, reportDate, calendarDays, capturedAt);
    boards = imported.boards;
    calendar = imported.calendar;
    evidence = imported.evidence;
    warnings = imported.warnings;
    sourceInfo = {
      kind: "import" as const,
      adapter: "import" as const,
      baseUrl: "",
      capturedAt,
    };
  } else if (source === "http") {
    const client = new TapTapHttpClient({
      baseUrl,
      minIntervalMs,
      rawDir,
      proxyBaseUrl,
      proxyToken,
    });
    const boardEntries = {} as Record<BoardId, BoardSnapshot>;
    const allWarnings: Warning[] = [];
    const allEvidence: Evidence[] = [];
    for (const board of BOARDS) {
      const result = await fetchBoard(client, board, boardLimit, capturedAt);
      boardEntries[board.id] = result.snapshot;
      allWarnings.push(...result.warnings);
      allEvidence.push(...result.evidence);
      if (verbose) {
        process.stderr.write(
          `[collector] ${board.label}: ${result.snapshot.items.length} items, degraded=${result.snapshot.degraded}\n`,
        );
      }
    }
    if (BOARDS.every((board) => boardEntries[board.id]!.items.length === 0)) {
      throw new Error("三榜全部采集失败，拒绝生成日报");
    }

    const calendarResult = await fetchCalendar(
      client,
      reportDate,
      calendarDays,
      capturedAt,
      rawDir,
    );
    if (calendarResult.daysAvailable < 7) {
      throw new Error(
        `游戏日历仅覆盖 ${calendarResult.daysAvailable}/${calendarDays} 天，低于最低 7 天要求`,
      );
    }
    allWarnings.push(...calendarResult.warnings);
    allEvidence.push(...calendarResult.evidence);

    const dates = dateRange(reportDate, calendarDays);
    boards = boardEntries;
    calendar = {
      windowDays: calendarDays,
      fromDate: dates[0]!,
      toDate: dates[dates.length - 1]!,
      daysAvailable: calendarResult.daysAvailable,
      gameTotal: calendarResult.gameTotal,
      degraded: calendarResult.daysAvailable < calendarDays,
      events: calendarResult.events,
    };
    evidence = allEvidence;
    warnings = allWarnings;
    sourceInfo = {
      kind: "web" as const,
      adapter: "http" as const,
      baseUrl,
      capturedAt,
      ...(proxyBaseUrl ? { proxyBaseUrl } : {}),
    };
  } else {
    throw new Error(`unsupported --source: ${source} (expected http or import)`);
  }

  const snapshot = buildSnapshot({
    reportDate,
    capturedAt,
    source: sourceInfo,
    boards: boards,
    calendar,
    warnings,
    evidence,
  });
  validateSnapshot(snapshot);
  await writeJsonAtomic(out, snapshot);

  const summary = {
    ok: true,
    reportDate,
    snapshot: out,
    source: sourceInfo.kind,
    contentHash: snapshot.contentHash,
    boards: Object.fromEntries(
      BOARDS.map((board) => [
        board.id,
        {
          count: snapshot.boards[board.id].items.length,
          total: snapshot.boards[board.id].total,
          degraded: snapshot.boards[board.id].degraded,
        },
      ]),
    ),
    calendar: {
      events: snapshot.calendar.events.length,
      daysAvailable: snapshot.calendar.daysAvailable,
      windowDays: snapshot.calendar.windowDays,
      degraded: snapshot.calendar.degraded,
    },
    warnings: snapshot.warnings.length,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[collector] FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
