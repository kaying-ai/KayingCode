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

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compactBoard(snapshot, boardId) {
  return snapshot.boards[boardId].items.map((item) => ({
    appId: item.appId,
    title: item.title,
    tags: item.tags,
    developers: item.developers,
    rating: item.rating,
    reserveCount: item.reserveCount,
    hitsTotal: item.hitsTotal,
    playTotal: item.playTotal,
    releasedTime: item.releasedTime,
    expectedLaunchTime: item.expectedLaunchTime,
    sourceUrl: item.sourceUrl,
    rank: item.rank,
  }));
}

function compactEvent(event) {
  return {
    eventId: event.eventId,
    eventDate: event.eventDate,
    appId: event.appId,
    title: event.title,
    tags: event.tags,
    developers: event.developers,
    rating: event.rating,
    reserveCount: event.reserveCount,
    releasedTime: event.releasedTime,
    expectedLaunchTime: event.expectedLaunchTime,
    eventType: event.eventType,
    subEventType: event.subEventType,
    subEventTypeTitle: event.subEventTypeTitle,
    startTime: event.startTime,
    endTime: event.endTime,
    sourceUrl: event.sourceUrl,
    evidenceId: event.evidenceId,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = typeof args.snapshot === "string" ? args.snapshot : "";
  const outDir = typeof args["out-dir"] === "string" ? args["out-dir"] : "import";
  if (!snapshotPath) throw new Error("--snapshot is required");

  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!snapshot || typeof snapshot !== "object" || !snapshot.boards || !snapshot.calendar) {
    throw new Error(`not a valid snapshot: ${snapshotPath}`);
  }

  const boards = {
    download: compactBoard(snapshot, "download"),
    reserve: compactBoard(snapshot, "reserve"),
    pop: compactBoard(snapshot, "pop"),
  };
  const events = Array.isArray(snapshot.calendar.events)
    ? snapshot.calendar.events.map(compactEvent)
    : [];

  await writeJson(join(outDir, "boards.json"), boards);
  await writeJson(join(outDir, "calendar.json"), { events });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      reportDate: snapshot.reportDate,
      outDir,
      boards: Object.fromEntries(Object.entries(boards).map(([key, value]) => [key, value.length])),
      events: events.length,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `[export-import] FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
