// 壳层状态容器：Bot 档案、当前 Bot、连接生命周期与 attachment 代数。
//
// 与 Flutter 的对应关系：
//   AccountStore → core 的 mobileAccounts（持久化在 storage 端口）
//   AppSession   → 本模块的 connection 与 status
//   RootShell    → pages/home 的 tab 状态（不在这里）
//
// Taro 页面之间只能传字符串参数，连接对象不跨进程持久；进程被杀后的恢复语义
// 由上游桥重建并执行 snapshot/resync，账户由 origin-scoped AuthSession 持有。
import {
  listMobileAccounts,
  type BridgeSession,
  type MobileAccount,
  type RelayAgentConnection,
  type RelayWorkspaceTarget,
  type ZflowClient,
} from "@kayingcode/mobile-client-core";

/** 当前 Bot 的连接阶段；`paired` 表示链路已建立并完成握手（两条后端路径同义）。 */
export type ConnectionStatus = "idle" | "pairing" | "connecting" | "paired" | "error";

/**
 * ZCode 后端的活动会话：relay 客户端 + 当前工作区桥。
 * 工作区 V4 会话面通过 RelayAgentConnection.fromAgent 装配到本对象。
 * `stopStateWatch` 是 relay 状态监听的退订函数（随会话释放）。
 */
export interface ZcodeActiveSession {
  client: ZflowClient;
  bridge: BridgeSession | null;
  workspaceKey: string | null;
  workspaceTarget: RelayWorkspaceTarget | null;
  stopStateWatch: () => void;
  stopRecoveryWatch: () => void;
}

export interface FlowState {
  accounts: MobileAccount[];
  activeAccountId: string | null;
  status: ConnectionStatus;
  /** 当前 Bot 的错误文案（status === "error" 时有值）。 */
  error: string | null;
  /** 已打开工作区的展示名；未打开为空串。 */
  workspaceLabel: string;
}

let state: FlowState = {
  accounts: [],
  activeAccountId: null,
  status: "idle",
  error: null,
  workspaceLabel: "",
};

const listeners = new Set<() => void>();

// 连接对象与 attachment 代数不进入快照：它们变化频繁且不参与渲染判断。
let connection: RelayAgentConnection | null = null;
let zcodeSession: ZcodeActiveSession | null = null;
let currentSessionId: string | null = null;
let attachGeneration = 0;

function publish(patch: Partial<FlowState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const flow = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): FlowState => state,

  /** 从 core 重新读取档案列表（增删改后调用）。 */
  refreshAccounts(): void {
    const accounts = listMobileAccounts();
    publish({
      accounts,
      activeAccountId:
        state.activeAccountId && accounts.some((a) => a.id === state.activeAccountId)
          ? state.activeAccountId
          : (accounts[0]?.id ?? null),
    });
  },

  getActiveAccount(): MobileAccount | null {
    return state.accounts.find((account) => account.id === state.activeAccountId) ?? null;
  },

  setActiveAccount(id: string | null): void {
    if (state.activeAccountId === id) return;
    publish({ activeAccountId: id });
  },

  setStatus(status: ConnectionStatus, error: string | null = null): void {
    publish({ status, error });
  },

  /** 当前工作区展示名（未打开为空串）；命令式读取用，渲染请用 useFlow 快照。 */
  getWorkspaceLabel(): string {
    return state.workspaceLabel;
  },

  setWorkspaceLabel(label: string): void {
    publish({ workspaceLabel: label });
  },

  getConnection: (): RelayAgentConnection | null => connection,
  setConnection(next: RelayAgentConnection | null): void {
    connection = next;
  },

  /** 上游 V2 会话 owner；connection 是当前工作区的 V4 投影面。 */
  getZcodeSession: (): ZcodeActiveSession | null => zcodeSession,
  setZcodeSession(next: ZcodeActiveSession | null): void {
    zcodeSession = next;
  },

  getAttachGeneration: (): number => attachGeneration,
  isCurrentAttach: (generation: number): boolean => generation === attachGeneration,

  getCurrentSessionId: (): string | null => currentSessionId,
  setCurrentSessionId(next: string | null): void {
    currentSessionId = next;
  },

  /** 释放连接与 attachment；切换 Bot、离开工作区或断开时调用，旧代数不复用。 */
  resetConnection(): void {
    attachGeneration += 1;
    connection?.dispose();
    connection = null;
    // ZCode 侧：先退订状态监听、再释放桥与客户端（顺序避免回调打到已释放对象）。
    zcodeSession?.stopStateWatch();
    zcodeSession?.stopRecoveryWatch();
    zcodeSession?.bridge?.dispose();
    zcodeSession?.client.dispose();
    zcodeSession = null;
    currentSessionId = null;
    publish({ status: "idle", error: null, workspaceLabel: "" });
  },
};

flow.refreshAccounts();
