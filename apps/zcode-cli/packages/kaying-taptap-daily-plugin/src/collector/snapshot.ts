import { sha256, stableStringify } from "../lib/json.js";
import {
  REPORT_TIMEZONE,
  SNAPSHOT_SCHEMA_VERSION,
  type BoardId,
  type BoardSnapshot,
  type Evidence,
  type Snapshot,
  type Warning,
} from "../types.js";

export interface SnapshotInput {
  reportDate: string;
  capturedAt: string;
  source: Snapshot["source"];
  boards: Record<BoardId, BoardSnapshot>;
  calendar: Snapshot["calendar"];
  warnings: Warning[];
  evidence: Evidence[];
}

export function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const item of evidence) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    if (!existing.rawFile && item.rawFile) {
      byId.set(item.id, { ...existing, rawFile: item.rawFile, rawSha256: item.rawSha256 });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const base = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    reportDate: input.reportDate,
    capturedAt: input.capturedAt,
    timezone: REPORT_TIMEZONE,
    source: input.source,
    boards: input.boards,
    calendar: input.calendar,
    warnings: input.warnings,
    evidence: dedupeEvidence(input.evidence),
  };
  return {
    ...base,
    contentHash: sha256(stableStringify(base)),
  };
}

export function snapshotContentHash(snapshot: Snapshot): string {
  const { contentHash: _contentHash, ...rest } = snapshot;
  return sha256(stableStringify(rest));
}

export function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (typeof value !== "object" || value === null) {
    throw new Error("snapshot must be an object");
  }
  const snapshot = value as Partial<Snapshot>;
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`snapshot.schemaVersion must be ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (typeof snapshot.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.reportDate)) {
    throw new Error("snapshot.reportDate must be YYYY-MM-DD");
  }
  if (snapshot.timezone !== REPORT_TIMEZONE) {
    throw new Error(`snapshot.timezone must be ${REPORT_TIMEZONE}`);
  }
  if (typeof snapshot.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.contentHash)) {
    throw new Error("snapshot.contentHash must be a SHA-256 hex string");
  }
  const boards = snapshot.boards;
  if (!boards || typeof boards !== "object") {
    throw new Error("snapshot.boards must be an object");
  }
  for (const boardId of ["download", "reserve", "pop"] as const) {
    const board = boards[boardId];
    if (!board || !Array.isArray(board.items)) {
      throw new Error(`snapshot.boards.${boardId} is missing items`);
    }
  }
  if (!snapshot.calendar || !Array.isArray(snapshot.calendar.events)) {
    throw new Error("snapshot.calendar.events must be an array");
  }
  if (!Array.isArray(snapshot.warnings)) {
    throw new Error("snapshot.warnings must be an array");
  }
  if (!Array.isArray(snapshot.evidence)) {
    throw new Error("snapshot.evidence must be an array");
  }
  for (const event of snapshot.calendar.events) {
    if (!event || typeof event.appId !== "number" || typeof event.title !== "string") {
      throw new Error("snapshot.calendar.events contains an invalid event");
    }
    if (typeof event.evidenceId !== "string" || !event.evidenceId) {
      throw new Error("snapshot.calendar.events contains an event without evidenceId");
    }
  }
  if (snapshotContentHash(snapshot as Snapshot) !== snapshot.contentHash) {
    throw new Error("snapshot.contentHash does not match its content");
  }
}
