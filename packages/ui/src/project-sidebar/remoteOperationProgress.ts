import type { SourceServerOperationLog } from "@zcode/shared";

/**
 * 远程连接阶段投影（上游 `RemoteConnectionConnectingStep` 的 `resolveRemoteOperationProgress`）。
 *
 * 上游把阶段清单与日志归并放在连接向导里；本地连接向导尚未采纳该批重写，而项目侧栏的
 * 连接进度区需要同一份口径。阶段清单在这里只维护一份，等 U1/U2 采纳上游向导后整体回迁。
 */
const REMOTE_CONNECTION_PHASES = [
  ["channel", "remote.phase.channel"],
  ["identify", "remote.phase.identify"],
  ["deploy", "remote.phase.deploy"],
  ["handshake", "remote.phase.handshake"],
] as const;

function normalizeRemoteConnectionPhase(rawPhase: string): string | null {
  if (rawPhase === "probe") return "channel";
  if (rawPhase === "directory-record") return "identify";
  if (rawPhase === "publish-online") return "handshake";
  if (rawPhase === "daemon" || rawPhase === "protocol-handshake" || rawPhase === "restart")
    return "handshake";
  if (
    rawPhase === "download" ||
    rawPhase === "preflight" ||
    rawPhase === "upload" ||
    rawPhase === "extract" ||
    rawPhase === "verify-archive" ||
    rawPhase === "verify" ||
    rawPhase === "install"
  ) {
    return "deploy";
  }
  if (rawPhase === "channel") return "channel";
  return REMOTE_CONNECTION_PHASES.some(([key]) => key === rawPhase) ? rawPhase : null;
}

export interface RemoteOperationProgress {
  index: number;
  total: number;
  titleId: string;
  percent?: number;
  startedAt?: number;
}

export function resolveRemoteOperationProgress(
  allLogs: ReadonlyArray<
    Pick<SourceServerOperationLog, "phase" | "progress" | "timestamp" | "level">
  >,
): RemoteOperationProgress {
  // Host 保留的是“最近一次操作”而非“进行中的操作”；终态（ready / error）说明该操作已结束，
  // 按尚无日志展示，等下一次尝试由 Host 替换日志，避免显示上一次的完成进度。
  const tail = allLogs.at(-1);
  const logs = tail && (tail.phase === "ready" || tail.level === "error") ? [] : allLogs;
  let index = 0;
  for (const log of logs) {
    const key = normalizeRemoteConnectionPhase(log.phase);
    const found = REMOTE_CONNECTION_PHASES.findIndex(([phase]) => phase === key);
    if (found > index) index = found;
  }
  const latest = logs.at(-1);
  const transfer =
    latest?.progress !== undefined && (latest.phase === "upload" || latest.phase === "download");
  const phase = REMOTE_CONNECTION_PHASES[index]!;
  return {
    index,
    total: REMOTE_CONNECTION_PHASES.length,
    titleId: phase[1],
    ...(transfer && latest?.progress !== undefined
      ? { percent: Math.floor(latest.progress * 100) }
      : {}),
    ...(logs[0] ? { startedAt: logs[0].timestamp } : {}),
  };
}
