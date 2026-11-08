// 洞察面板：待办 / 文件 / 后台 三个分区（chip 切换）。
//
// 数据来源刻意分层（与 Flutter 一致）：plan / goal / backgroundWorks / subagents 来自
// 快照；待办清单与回合文件摘要来自**消息行**（TodoWrite 工具行、turnHeader.fileChanges）。
// 两者失效口径不同，不能互相兜底取数。
import { useState } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import type {
  BackgroundWorkSummary,
  ConversationRow,
  GoalState,
  PlanState,
  SubagentProjectionState,
  TurnHeaderRow,
} from "@zcode/shared/kayingcode-protocol-v4";
import { BackgroundPanel } from "./backgroundPanel";
import { latestTodoSteps, type TodoStatus } from "./toolDetail";
import { Icon } from "../icons/Icon";

export interface HostPlanStep {
  title: string;
  status: TodoStatus;
}

/**
 * 后台计数（对齐 Flutter `insights.dart:insightsBgCount`）：运行中的后台任务 +
 * 子代理行。输入区聚合键的徽标与面板「后台」chip 共用这一处口径，避免两处算法漂移。
 */
export function insightsBgCount({
  backgroundWorks,
  rows,
}: {
  backgroundWorks: readonly BackgroundWorkSummary[];
  rows: readonly ConversationRow[];
}): number {
  const running = backgroundWorks.filter(
    (work) => work.status === "running" && work.endedAt === null,
  ).length;
  return running + rows.filter((row) => row.kind === "subagent").length;
}

export function InsightsSheet({
  rows,
  plan,
  goal,
  subagents,
  backgroundWorks,
  hostPlans,
  busy,
  onClose,
  onToggleGoal,
  onOpenTurnFiles,
}: {
  rows: readonly ConversationRow[];
  plan: PlanState | null;
  goal: GoalState | null;
  subagents: SubagentProjectionState | null;
  backgroundWorks: readonly BackgroundWorkSummary[];
  hostPlans: readonly HostPlanStep[] | null;
  busy: boolean;
  onClose: () => void;
  onToggleGoal: (action: "pause" | "resume") => void;
  onOpenTurnFiles: (header: TurnHeaderRow) => void;
}) {
  const [panel, setPanel] = useState<"todo" | "files" | "background">("todo");
  const planItems = plan?.items ?? [];
  const todoSteps = latestTodoSteps(rows);
  const todoCount = planItems.length > 0 ? planItems.length : (todoSteps?.length ?? 0);
  const fileTurns = fileTurnsOf(rows);
  const fileTotal = fileTurns.reduce(
    (sum, entry) => sum + (entry.header.fileChanges?.files ?? 0),
    0,
  );
  const bgCount = insightsBgCount({ backgroundWorks, rows });

  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="sheet sheet-tall">
        <View className="chips">
          <Text
            className={`chip ${panel === "todo" ? "chip-active" : ""}`}
            onClick={() => setPanel("todo")}
          >
            {`待办 ${todoCount}`}
          </Text>
          <Text
            className={`chip ${panel === "files" ? "chip-active" : ""}`}
            onClick={() => setPanel("files")}
          >
            {`文件 ${fileTotal}`}
          </Text>
          <Text
            className={`chip ${panel === "background" ? "chip-active" : ""}`}
            onClick={() => setPanel("background")}
          >
            {`后台 ${bgCount}`}
          </Text>
          <Text className="sheet-close" onClick={onClose}>
            关闭
          </Text>
        </View>
        <ScrollView className="sheet-body" scrollY>
          {panel === "todo" ? (
            <TodoPanel
              goal={goal}
              planItems={planItems}
              todoSteps={todoSteps}
              hostPlans={hostPlans}
              busy={busy}
              onToggleGoal={onToggleGoal}
            />
          ) : null}
          {panel === "files" ? (
            <FilesPanel turns={fileTurns} onOpenTurnFiles={onOpenTurnFiles} />
          ) : null}
          {panel === "background" ? (
            <BackgroundPanel works={backgroundWorks} subagents={subagents} rows={rows} />
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

export interface TurnFilesEntry {
  index: number;
  header: TurnHeaderRow;
}

/** 带文件变更的回合头，按出现顺序编号（回合序号从 1 起）。 */
export function fileTurnsOf(rows: readonly ConversationRow[]): TurnFilesEntry[] {
  const out: TurnFilesEntry[] = [];
  let turnIndex = 0;
  for (const row of rows) {
    if (row.kind !== "turnHeader") continue;
    turnIndex += 1;
    if ((row.fileChanges?.files ?? 0) > 0) out.push({ index: turnIndex, header: row });
  }
  return out;
}

function TodoPanel({
  goal,
  planItems,
  todoSteps,
  hostPlans,
  busy,
  onToggleGoal,
}: {
  goal: GoalState | null;
  planItems: { id: string; content: string; status: "pending" | "inProgress" | "completed" }[];
  todoSteps: { title: string; status: TodoStatus }[] | null;
  hostPlans: readonly HostPlanStep[] | null;
  busy: boolean;
  onToggleGoal: (action: "pause" | "resume") => void;
}) {
  const done = planItems.filter((item) => item.status === "completed").length;
  const plans = hostPlans ?? [];
  const empty = !goal && planItems.length === 0 && !todoSteps && plans.length === 0;
  return (
    <>
      <Text className="panel-title">目标</Text>
      {goal ? <GoalCard goal={goal} busy={busy} onToggleGoal={onToggleGoal} /> : null}
      {planItems.length > 0 ? (
        <>
          <Text className="panel-group">{`计划进度 · ${done} / ${planItems.length}`}</Text>
          {planItems.map((item) => (
            <StepRow key={item.id} title={item.content} status={normalizeStatus(item.status)} />
          ))}
        </>
      ) : null}
      {planItems.length === 0 && todoSteps ? (
        <>
          <Text className="panel-group">待办（最新 TodoWrite）</Text>
          {todoSteps.map((step, index) => (
            <StepRow key={index} title={step.title} status={step.status} />
          ))}
        </>
      ) : null}
      {plans.length > 0 ? (
        <>
          <Text className="panel-group">计划（宿主）</Text>
          {plans.map((step, index) => (
            <StepRow key={index} title={step.title} status={step.status} />
          ))}
        </>
      ) : null}
      {empty ? <Text className="sheet-empty">暂无待办</Text> : null}
    </>
  );
}

function normalizeStatus(status: string): TodoStatus {
  if (status === "completed") return "completed";
  if (status === "inProgress" || status === "in_progress") return "in_progress";
  return "pending";
}

function GoalCard({
  goal,
  busy,
  onToggleGoal,
}: {
  goal: GoalState;
  busy: boolean;
  onToggleGoal: (action: "pause" | "resume") => void;
}) {
  const active = goal.status === "active" || goal.status === "verifying";
  const paused = goal.status === "paused";
  return (
    <View className="goal-card">
      <View className="goal-head">
        <Text className="goal-objective">{goal.objective}</Text>
        <Text className={`goal-status goal-${active ? "run" : paused ? "warn" : "ok"}`}>
          {goalBadge(goal.status)}
        </Text>
      </View>
      {active || paused ? (
        <Text
          className="goal-action"
          onClick={() => {
            if (busy) return;
            onToggleGoal(active ? "pause" : "resume");
          }}
        >
          {active ? "暂停目标" : "开始目标"}
        </Text>
      ) : null}
    </View>
  );
}

function goalBadge(status: string): string {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "verifying":
      return "验证中";
    case "verified":
      return "已验证";
    case "notSatisfied":
      return "未满足";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function StepRow({ title, status }: { title: string; status: TodoStatus }) {
  return (
    <View className="todo-step">
      <Icon
        className={`todo-mark todo-${status}`}
        name={
          status === "completed"
            ? "check_circle"
            : status === "in_progress"
              ? "play_circle_outline"
              : "radio_button_unchecked"
        }
      />
      <Text className={`todo-title todo-${status}`}>{title}</Text>
    </View>
  );
}

function FilesPanel({
  turns,
  onOpenTurnFiles,
}: {
  turns: readonly TurnFilesEntry[];
  onOpenTurnFiles: (header: TurnHeaderRow) => void;
}) {
  if (turns.length === 0) return <Text className="sheet-empty">暂无文件变更数据</Text>;
  return (
    <>
      <Text className="panel-title">编辑</Text>
      {turns.map((entry) => {
        const changes = entry.header.fileChanges!;
        const done = entry.header.state === "completedSuccess";
        return (
          <View
            key={entry.header.rowId}
            className="turn-file-row"
            onClick={() => done && onOpenTurnFiles(entry.header)}
          >
            <View className="turn-file-main">
              <Text className="turn-file-title">{`回合 ${entry.index} · ${changes.files} 个文件已更改`}</Text>
              <Text className="turn-file-sub">
                {done
                  ? `+${changes.additions} −${changes.deletions}`
                  : entry.header.state === "running"
                    ? "运行中"
                    : "本回合无文件变更"}
              </Text>
            </View>
            {done ? <Icon className="turn-file-caret" name="chevron_right" /> : null}
          </View>
        );
      })}
    </>
  );
}
