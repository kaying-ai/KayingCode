// 聊天页控制器：订阅会话流与 workspace 配置、投影到 React 状态、暴露动作。
// 服务端事实只从 core 投影读；本层持有草稿与选择状态，不缓存权威队列。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import {
  RelayConversationProjection,
  RelayWorkspaceConfigProjection,
  describeError,
  relayPendingCommands,
  type RelayPendingCommandEntry,
} from "@kayingcode/mobile-client-core";
import type {
  ConversationRow,
  ConversationRowTarget,
  MobileModelCatalog,
  PendingInteraction,
  SessionConfigState,
  SessionSummary,
  SessionUsageState,
  V4ConversationFileChangesResult,
} from "@zcode/shared/kayingcode-protocol-v4";
import type {
  BackgroundWorkSummary,
  GoalState,
  PlanState,
  QueueItem,
  QueueState,
  SubagentProjectionState,
} from "@zcode/shared/kayingcode-protocol-v4";
import type { InteractionAnswer } from "../interactionCard";
import { flow } from "../../flow/store";
import { useFlow } from "../../flow/useFlow";
import { useZcodeWorkspacePrep } from "./useZcodeWorkspacePrep";
import { buildModelOption, currentModelValue } from "./chatModelOption";
import { slashEntriesOf, type SlashEntry } from "./sheets";
import type { HostPlanStep } from "./insightsSheet";

export interface DraftSelection {
  provider: string;
  model: string;
  thought: string;
  mode: string;
}

export function useChatController(sessionId: string | null) {
  const flowState = useFlow();
  const connection = flow.getConnection();
  const [state, setState] = useState(() => snapshotOf(new RelayConversationProjection()));
  const [pending, setPending] = useState<readonly RelayPendingCommandEntry[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [workspaceConfig, setWorkspaceConfig] = useState<RelayWorkspaceConfigProjection | null>(
    null,
  );
  const [catalog, setCatalog] = useState<MobileModelCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const {
    config: zcodePrep,
    skills: zcodeSkills,
    error: zcodePrepError,
  } = useZcodeWorkspacePrep(connection);
  const [hostPlans, setHostPlans] = useState<HostPlanStep[] | null>(null);
  const [draft, setDraft] = useState<DraftSelection>({
    provider: "",
    model: "",
    thought: "",
    mode: "build",
  });
  const projectionRef = useRef(new RelayConversationProjection());
  const transition = useRef<Promise<void>>(Promise.resolve());
  const lastConnectionMessage = useRef<string | null>(null);
  const reconnecting = flowState.status === "connecting";
  const syncPending = useCallback(() => {
    setPending(relayPendingCommands.listForView(sessionId));
  }, [sessionId]);
  // 会话流订阅：进入页面建立，卸载或换会话时退订。新会话态（sessionId=null）不订阅。
  useEffect(() => {
    if (!connection) {
      setState(snapshotOf(new RelayConversationProjection()));
      const nextMessage = reconnecting ? "" : (flowState.error ?? "连接已丢失，请返回会话页重试");
      lastConnectionMessage.current = nextMessage;
      setMessage(nextMessage);
      return;
    }
    setMessage((current) => (current === lastConnectionMessage.current ? "" : current));
    lastConnectionMessage.current = null;
    let cancelled = false;
    setState(snapshotOf(new RelayConversationProjection()));
    syncPending();
    const unsubscribeLedger = relayPendingCommands.subscribe(syncPending);
    transition.current = transition.current
      .catch(() => undefined)
      .then(async () => {
        if (cancelled || !sessionId) return;
        await connection.subscribeConversation(sessionId, (projection) => {
          if (cancelled) return;
          projectionRef.current = projection;
          setState(snapshotOf(projection));
          syncPending();
        });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setMessage(describeError(caught));
      });
    return () => {
      cancelled = true;
      unsubscribeLedger();
      transition.current = transition.current
        .then(() => connection.unsubscribeConversation())
        .catch(() => undefined);
    };
  }, [connection, sessionId, syncPending, flowState.error, reconnecting]);

  // workspace 配置目录（模式 / slash / 兜底模型目录）。
  useEffect(() => {
    setWorkspaceConfig(null);
    if (!connection) return;
    let cancelled = false;
    void connection
      .subscribeWorkspaceConfig((projection) => {
        if (!cancelled) setWorkspaceConfig(cloneConfig(projection));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void connection.unsubscribeWorkspaceConfig().catch(() => undefined);
    };
  }, [connection]);

  useEffect(() => {
    const access = connection?.mobileModelCatalog();
    if (!access) {
      setCatalog(null);
      setCatalogError(flow.getZcodeSession() ? "" : "当前链路未开放模型目录");
      return;
    }
    let cancelled = false;
    void access
      .getCatalog()
      .then((result) => {
        if (!cancelled) setCatalog(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setCatalogError(describeError(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  // 宿主计划：只在进入会话时拉一次（终态 ExitPlanMode 目录，不随帧变化）。
  useEffect(() => {
    if (!connection || !sessionId) {
      setHostPlans(null);
      return;
    }
    let cancelled = false;
    void connection
      .plans(sessionId)
      .then((result) => {
        if (cancelled) return;
        setHostPlans(
          result.plans.flatMap((row) => {
            const steps = hostPlanStepsOf(row.input);
            return steps ?? [];
          }),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connection, sessionId]);

  const modelOption = useMemo(
    () =>
      buildModelOption(
        catalog,
        workspaceConfig?.option("model") ??
          zcodePrep?.configOptions.find((option) => option.id === "model") ??
          null,
        state.config,
      ),
    [catalog, workspaceConfig, zcodePrep, state.config],
  );
  // 模式目录与模型目录同源规则：V4 workspace-config topic 优先，其次 ZCode 的
  // presentation（`readWorkspacePresentation` 的 mode → configOptions）。
  const modeOption = useMemo(
    () =>
      workspaceConfig?.option("mode") ??
      zcodePrep?.configOptions.find((option) => option.id === "mode") ??
      null,
    [workspaceConfig, zcodePrep],
  );
  const thoughtLevels = useMemo(() => {
    if (state.config && state.config.thoughtLevels.length > 0) return state.config.thoughtLevels;
    const value = modelOption?.options?.find(
      (item) => item.value === currentModelValue(state.config),
    );
    return value?.modelThoughtLevels ?? [];
  }, [modelOption, state.config]);
  const otherOptions = useMemo(
    () =>
      (workspaceConfig?.configOptions.length
        ? workspaceConfig.configOptions
        : (zcodePrep?.configOptions ?? [])
      ).filter(
        (option) => option.id !== "model" && option.id !== "mode" && option.id !== "thought_level",
      ),
    [workspaceConfig, zcodePrep],
  );
  const slashEntries = useMemo(
    () => [
      ...slashEntriesOf(
        workspaceConfig?.slashCommands.length
          ? workspaceConfig.slashCommands
          : (zcodePrep?.slashCommands ?? []),
      ),
      ...zcodeSkills.map((skill) => ({ ...skill, isSkill: true })),
    ],
    [workspaceConfig, zcodePrep, zcodeSkills],
  );

  const fail = useCallback((caught: unknown, prefix: string) => {
    const detail = describeError(caught);
    setMessage(`${prefix}: ${detail}`);
    void Taro.showToast({ title: `${prefix}: ${detail}`, icon: "none" });
  }, []);

  const notify = useCallback((text: string) => {
    setMessage(text);
    void Taro.showToast({ title: text, icon: "none" });
  }, []);

  const requireConnection = useCallback(() => {
    if (!connection) {
      notify(reconnecting ? "连接正在恢复，请稍后重试" : "连接已丢失，请返回会话页重试");
      return null;
    }
    return connection;
  }, [connection, reconnecting, notify]);

  const loadOlder = useCallback(async () => {
    const active = requireConnection();
    if (!active || !sessionId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await active.loadOlderRows(sessionId);
      setState(snapshotOf(projectionRef.current));
      setState((previous) => ({ ...previous, olderHasMore: result.hasMore }));
    } catch (caught) {
      fail(caught, "加载失败");
    } finally {
      setLoadingOlder(false);
    }
  }, [fail, loadingOlder, requireConnection, sessionId]);

  const answer = useCallback(
    async (interaction: PendingInteraction, value: InteractionAnswer) => {
      const active = requireConnection();
      if (!active || !sessionId || answering) return;
      setAnswering(true);
      try {
        const ack = await active.resolveInteraction(sessionId, interaction.interactionId, value);
        if (ack.status !== "accepted" && ack.status !== "duplicate") {
          notify(ack.message ?? ack.reasonCode ?? "回复未受理");
        }
      } catch (caught) {
        fail(caught, "回复失败");
      } finally {
        setAnswering(false);
      }
    },
    [answering, fail, notify, requireConnection, sessionId],
  );

  const fileChanges = useCallback(
    async (target: ConversationRowTarget): Promise<V4ConversationFileChangesResult> => {
      const active = requireConnection();
      if (!active || !sessionId) throw new Error("连接已丢失");
      return active.fileChanges(sessionId, target);
    },
    [requireConnection, sessionId],
  );

  const queryTaskUsage = useCallback(async () => {
    const active = requireConnection();
    if (!active || !sessionId) return;
    try {
      const result = await active.taskTokenUsage(sessionId);
      setMessage(`任务用量已返回，字段：${Object.keys(result).join("、")}`);
    } catch (caught) {
      fail(caught, "查询失败");
    }
  }, [fail, requireConnection, sessionId]);

  return {
    connection,
    reconnecting,
    /** 会话命令面（CAS 定序由 core 负责）。链路丢失时为 null，调用方负责降级。 */
    commands: connection ? connection.commands : null,
    state,
    pending,
    message,
    sending,
    answering,
    loadingOlder,
    workspaceConfig,
    catalogError: zcodePrepError || catalogError,
    modelOption,
    modeOption,
    thoughtLevels,
    otherOptions,
    slashEntries,
    hostPlans,
    draft,
    setDraft,
    setSending,
    setMessage,
    fail,
    notify,
    requireConnection,
    loadOlder,
    answer,
    fileChanges,
    queryTaskUsage,
    projection: projectionRef,
  };
}

function snapshotOf(projection: RelayConversationProjection) {
  return {
    rows: projection.rows as ConversationRow[],
    phase: projection.phase,
    canStop: projection.canStop,
    control: projection.control,
    availability: projection.availability,
    inputRouting: projection.inputRouting,
    meta: projection.meta,
    config: projection.config as SessionConfigState | null,
    usage: projection.usage as SessionUsageState | null,
    queue: projection.queue as QueueState | null,
    goal: projection.goal as GoalState | null,
    plan: projection.plan as PlanState | null,
    backgroundWorks: projection.backgroundWorks as BackgroundWorkSummary[],
    subagents: projection.subagents as SubagentProjectionState | null,
    pendingInteractions: projection.pendingInteractions as PendingInteraction[],
    olderHasMore: projection.olderHasMore === true,
    title: projection.title,
  };
}

export type ChatSnapshot = ReturnType<typeof snapshotOf>;

function cloneConfig(projection: RelayWorkspaceConfigProjection) {
  const clone = new RelayWorkspaceConfigProjection();
  clone.logEpoch = projection.logEpoch;
  clone.configOptions = [...projection.configOptions];
  clone.slashCommands = [...projection.slashCommands];
  return clone;
}

/** 宿主计划行的 input 里取 steps（ExitPlanMode 的 plan 数组）。 */
export function hostPlanStepsOf(input: unknown): HostPlanStep[] | null {
  const record =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : null;
  const candidates = ["plan", "steps", "todos", "items"].map((key) => record?.[key]);
  const list = candidates.find((item) => Array.isArray(item));
  if (!Array.isArray(list)) return null;
  const steps: HostPlanStep[] = [];
  for (const entry of list) {
    const item =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : null;
    const title = item?.content ?? item?.step ?? item?.title ?? item?.text;
    if (typeof title !== "string" || title.length === 0) return null;
    const raw = String(item?.status ?? "pending");
    steps.push({
      title,
      status:
        raw === "completed"
          ? "completed"
          : raw === "inProgress" || raw === "in_progress"
            ? "in_progress"
            : "pending",
    });
  }
  return steps.length > 0 ? steps : null;
}

/** 队列项 → 列表项（供 UI 直接消费）。 */
export function queueItemsOf(queue: QueueState | null): QueueItem[] {
  return [...(queue?.items ?? [])];
}

export type { SessionSummary, SlashEntry };
