import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isDirectory } from "../async-files";
import { getKayingForTaptapDataRoot } from "../maker/paths";

export type KayingForTaptapOperationLogLevel = "info" | "warn" | "error";

export interface KayingForTaptapOperationLogSummary {
  operationId: string;
  action: string;
  path: string;
  copyText: string;
}

interface KayingForTaptapOperationLogEntry {
  timestamp: string;
  operationId: string;
  action: string;
  level: KayingForTaptapOperationLogLevel;
  phase: string;
  message: string;
  data?: unknown;
}

export interface KayingForTaptapOperationLogger {
  operationId: string;
  action: string;
  path: string;
  info: (phase: string, message: string, data?: unknown) => void;
  warn: (phase: string, message: string, data?: unknown) => void;
  error: (phase: string, message: string, data?: unknown) => void;
  complete: (data?: unknown) => Promise<KayingForTaptapOperationLogSummary>;
  fail: (error: unknown, data?: unknown) => Promise<KayingForTaptapOperationLogSummary>;
  enrichError: (error: unknown) => Promise<Error>;
}

const SENSITIVE_KEY =
  /authorization|cookie|mac[_-]?key|password|(?:^|[_-])pat(?:$|[_-])|secret|token/i;
const MAX_LOG_VALUE_LENGTH = 80_000;

export async function createKayingForTaptapOperationLogger(
  action: string,
  input?: unknown,
  options: { logDir?: string } = {},
): Promise<KayingForTaptapOperationLogger> {
  const operationId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const logDir =
    options.logDir ??
    path.join(getKayingForTaptapDataRoot(), "logs", "kaying-for-taptap", "operations");
  await mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `${operationId}.jsonl`);
  const agentLogPath = await resolveAgentLogPath(input, operationId);
  const entries: KayingForTaptapOperationLogEntry[] = [];
  let pendingWrite = Promise.resolve();

  const write = (
    level: KayingForTaptapOperationLogLevel,
    phase: string,
    message: string,
    data?: unknown,
  ): void => {
    const entry: KayingForTaptapOperationLogEntry = {
      timestamp: new Date().toISOString(),
      operationId,
      action,
      level,
      phase,
      message,
      ...(data === undefined ? {} : { data: redactLogValue(data) }),
    };
    entries.push(entry);
    const serialized = `${JSON.stringify(entry)}\n`;
    pendingWrite = pendingWrite.then(async () => {
      await appendFile(logPath, serialized, "utf8");
      if (agentLogPath && agentLogPath !== logPath) {
        try {
          await appendFile(agentLogPath, serialized, "utf8");
        } catch {
          // The centralized log remains authoritative if the project is read-only.
        }
      }
    });
  };

  const visibleLogPath = agentLogPath ?? logPath;
  const summary = (): KayingForTaptapOperationLogSummary => ({
    operationId,
    action,
    path: visibleLogPath,
    copyText: formatCopyText(entries, visibleLogPath),
  });
  const fail = async (error: unknown, data?: unknown) => {
    write("error", "after", "KayingForTaptap operation failed", {
      error: error instanceof Error ? error.message : String(error),
      ...toRecord(data),
    });
    await pendingWrite;
    return summary();
  };

  write("info", "before", "KayingForTaptap operation started", input);
  return {
    operationId,
    action,
    path: visibleLogPath,
    info: (phase, message, data) => write("info", phase, message, data),
    warn: (phase, message, data) => write("warn", phase, message, data),
    error: (phase, message, data) => write("error", phase, message, data),
    async complete(data) {
      write("info", "after", "KayingForTaptap operation completed", data);
      await pendingWrite;
      return summary();
    },
    fail,
    async enrichError(error) {
      const log = await fail(error);
      const message = error instanceof Error ? error.message : String(error);
      return new Error(`${message}\n\n${log.copyText}`);
    },
  };
}

async function resolveAgentLogPath(
  input: unknown,
  operationId: string,
): Promise<string | undefined> {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : undefined;
  const projectRoot = [
    record?.projectRoot,
    record?.project_root,
    record?.targetDir,
    record?.target_dir,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!projectRoot) return undefined;

  const resolvedRoot = path.resolve(projectRoot);
  try {
    if (!(await isDirectory(resolvedRoot))) return undefined;
    const directory = path.join(resolvedRoot, ".maker", "logs", "kaying-for-taptap", "operations");
    await mkdir(directory, { recursive: true });
    return path.join(directory, `${operationId}.jsonl`);
  } catch {
    return undefined;
  }
}

function redactLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return truncate(redactText(value));
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, seen));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactLogValue(item, seen);
  }
  return result;
}

function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(
      /("?(?:authorization|cookie|mac[_-]?key|password|pat|secret|token)"?\s*[:=]\s*")([^"]+)(")/gi,
      "$1[REDACTED]$3",
    );
}

function truncate(value: string): string {
  if (value.length <= MAX_LOG_VALUE_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_VALUE_LENGTH)}\n...[truncated ${value.length - MAX_LOG_VALUE_LENGTH} chars]`;
}

function formatCopyText(entries: KayingForTaptapOperationLogEntry[], logPath: string): string {
  const header = ["KayingForTaptap operation log", `path: ${logPath}`];
  const lines = entries.flatMap((entry) => {
    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.phase}] ${entry.message}`;
    return entry.data === undefined ? [line] : [line, JSON.stringify(entry.data, null, 2)];
  });
  return [...header, "", ...lines].join("\n");
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
