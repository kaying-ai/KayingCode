// 洞察面板的「后台」分区：后台任务 + 子代理。
//
// 两个来源刻意分开（与 Flutter 一致）：
// - 后台任务来自快照 backgroundWorks（含已结束条目）；
// - 子代理运行中来自快照 subagents.running，已结束只在**内联 subagent 行**里能拿到细节，
//   快照只给总数 endedTotal，超出的补一行「以及更早的 N 个子代理」。
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import type {
  BackgroundWorkSummary,
  ConversationRow,
  RunningSubagentSummary,
  SubagentProjectionState,
} from "@zcode/shared/kayingcode-protocol-v4";
import { formatRowTime } from "./chatFormat";
import { endedSubagentRows } from "./rowGroup";
import { Icon, Spinner } from "../icons/Icon";

const WORK_STATUS: Record<string, string> = {
  running: "",
  resultPending: " · 待取结果",
  failed: " · 失败",
  cancelled: " · 已取消",
};

const SUBAGENT_STATUS: Record<string, string> = {
  running: "",
  waiting: " · 等待中",
  blocked: " · 被阻塞",
};

export function BackgroundPanel({
  works,
  subagents,
  rows,
}: {
  works: readonly BackgroundWorkSummary[];
  subagents: SubagentProjectionState | null;
  rows: readonly ConversationRow[];
}) {
  const ended = endedSubagentRows(rows);
  const running = subagents?.running ?? [];
  const endedTotal = subagents?.endedTotal ?? ended.length;
  const extra = Math.max(endedTotal - ended.length, 0);
  if (works.length === 0 && running.length === 0 && ended.length === 0) {
    return <Text className="sheet-empty">暂无后台任务</Text>;
  }
  return (
    <>
      {works.length > 0 ? (
        <>
          <Text className="panel-group">后台任务</Text>
          {works.map((work) => (
            <WorkTile key={work.workId} work={work} />
          ))}
        </>
      ) : null}
      {running.length > 0 || ended.length > 0 ? (
        <>
          <Text className="panel-group">子代理</Text>
          {running.map((item) => (
            <RunningSubagentTile key={item.childSessionId} item={item} />
          ))}
          {ended.map((row) => (
            <EndedSubagentTile key={row.rowId} row={row} />
          ))}
          {extra > 0 ? (
            <Text className="sheet-note">{`以及更早的 ${extra} 个子代理`}</Text>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function WorkTile({ work }: { work: BackgroundWorkSummary }) {
  const [open, setOpen] = useState(false);
  const running = work.status === "running";
  return (
    <View className="tile">
      <View className="tile-head" onClick={() => !running && setOpen(!open)}>
        {running ? (
          <Spinner size={12} className="tile-run" />
        ) : (
          <Icon
            className={`tile-icon ${work.status === "failed" ? "tile-error" : "tile-faint"}`}
            name={work.status === "failed" ? "error_outline" : "hourglass_bottom"}
          />
        )}
        <Text className="tile-title">{work.title || work.workId}</Text>
        <Text className="tile-tail">
          {WORK_STATUS[work.status] ??
            (running ? `${work.kind} · 运行中` : ` ${workStatusFallback(work.status)}`)}
        </Text>
      </View>
      {open ? (
        <View className="tile-detail">
          <DetailRow label="类型" value={work.kind} />
          <DetailRow label="状态" value={work.status} />
          <DetailRow label="id" value={work.workId} />
          {work.childSessionId ? <DetailRow label="会话" value={work.childSessionId} /> : null}
          <DetailRow label="开始" value={formatRowTime(work.startedAt)} />
          {work.endedAt ? <DetailRow label="结束" value={formatRowTime(work.endedAt)} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function workStatusFallback(status: string): string {
  return status === "resultPending" ? "待取结果" : status;
}

function RunningSubagentTile({ item }: { item: RunningSubagentSummary }) {
  return (
    <View className="tile">
      <View className="tile-head">
        <Spinner size={12} className="tile-run" />
        <Text className="tile-title">{`子代理 · ${item.subagentType}`}</Text>
        <Text className="tile-tail">{SUBAGENT_STATUS[item.status] ?? ` · ${item.status}`}</Text>
      </View>
      {item.title || item.summary ? (
        <Text className="tile-sub">{item.summary || item.title}</Text>
      ) : null}
    </View>
  );
}

function EndedSubagentTile({ row }: { row: ConversationRow }) {
  const [open, setOpen] = useState(false);
  if (row.kind !== "subagent") return null;
  const label =
    row.status === "success" ? " · 已完成" : row.status === "failed" ? " · 失败" : " · 已取消";
  const tone = row.status === "success" ? "tile-ok" : row.status === "failed" ? "tile-error" : "tile-warn";
  return (
    <View className="tile">
      <View className="tile-head" onClick={() => setOpen(!open)}>
        <Icon
          className={`tile-icon ${tone}`}
          name={row.status === "success" ? "check_circle_outline" : row.status === "failed" ? "error_outline" : "block"}
        />
        <Text className="tile-title">{`子代理 · ${row.subagentType}`}</Text>
        <Text className="tile-tail">{label}</Text>
      </View>
      {row.summaryText ? <Text className="tile-sub">{row.summaryText}</Text> : null}
      {open ? (
        <View className="tile-detail">
          <DetailRow label="类型" value={row.subagentType} />
          <DetailRow label="状态" value={row.status} />
          {row.childSessionId ? <DetailRow label="会话" value={row.childSessionId} /> : null}
          {row.startedAt ? <DetailRow label="开始" value={formatRowTime(Number(row.startedAt))} /> : null}
          {row.endedAt ? <DetailRow label="结束" value={formatRowTime(Number(row.endedAt))} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="detail-row">
      <Text className="detail-label">{label}</Text>
      <Text className="detail-value">{value}</Text>
    </View>
  );
}
