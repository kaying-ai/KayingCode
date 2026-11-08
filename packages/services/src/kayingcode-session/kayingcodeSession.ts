import { ServiceChannels } from "@zcode/shared";
import type {
  TraceId,
  KayingCodeAgentMcpServer,
  KayingCodeDeliveryKind,
  KayingCodeMessageWithParts,
  ModelSelection,
  KayingCodePermissionRequestParams,
  KayingCodeUserInputRequestParams,
  KayingCodeUserInputResponse,
  KayingCodeSessionInfo,
  KayingCodeSessionImportHistory,
  KayingCodeSessionEvent,
  KayingCodeSessionMode,
  KayingCodeSessionPersistence,
  KayingCodeSessionStateSnapshot,
  KayingCodeStateUpdatedNotification,
  KayingCodeWorkspacePresentation,
} from "@zcode/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

export interface KayingCodeSessionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export type KayingCodeSessionReadWorkspacePresentationParams = KayingCodeSessionWorkspaceTarget;

export interface KayingCodeTaskTarget extends KayingCodeSessionWorkspaceTarget {
  sessionId: string;
}

export interface KayingCodeSessionCreateParams extends KayingCodeSessionWorkspaceTarget {
  /** 仅导入事务使用的预分配 ID；普通新会话继续由 Agent 分配。 */
  sessionId?: string;
  sessionTraceId?: TraceId;
  parentSessionId?: string;
  mode?: KayingCodeSessionMode;
  model?: ModelSelection;
  persistence?: KayingCodeSessionPersistence;
  thoughtLevel?: string;
  mcpServers?: KayingCodeAgentMcpServer[];
  importedHistory?: KayingCodeSessionImportHistory;
}

export interface KayingCodeSessionResumeParams extends KayingCodeTaskTarget {
  model?: ModelSelection;
  thoughtLevel?: string;
  mcpServers?: KayingCodeAgentMcpServer[];
  /**
   * 默认广播 resume 得到的历史快照，并让 shadow 订阅请求初始 snapshot。
   * 续聊发送前的 runtime 预恢复会关闭它，避免旧终态快照覆盖本地已开始的新输入运行态。
   */
  broadcastSnapshot?: boolean;
}

export interface KayingCodeSessionListParams extends KayingCodeSessionWorkspaceTarget {
  includeArchived?: boolean;
  limit?: number;
}

export interface KayingCodeSessionReadParams extends KayingCodeTaskTarget {
  deliveryKind?: KayingCodeDeliveryKind;
  messageLimit?: number;
  afterSeq?: number;
}

export interface KayingCodeSessionMessagesParams extends KayingCodeTaskTarget {
  afterMessageId?: string;
  limit?: number;
}

export interface KayingCodeSessionEventsParams extends KayingCodeTaskTarget {
  afterSeq?: number;
  limit?: number;
}

export interface KayingCodeSessionSetModelParams extends KayingCodeTaskTarget {
  model: ModelSelection;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface KayingCodeSessionSetThoughtLevelParams extends KayingCodeTaskTarget {
  thoughtLevel?: string;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface KayingCodeSessionSetModeParams extends KayingCodeTaskTarget {
  mode: KayingCodeSessionMode;
  expectedRevision?: number;
}

export interface KayingCodeSessionSubscribeParams extends KayingCodeTaskTarget {
  deliveryKind: KayingCodeDeliveryKind;
  afterSeq?: number;
  includeSnapshot?: boolean;
  eventCoalescing?: {
    mode: "background-summary";
    intervalMs?: number;
  };
}

export type KayingCodeSessionServiceEvent =
  | { type: "session.event"; event: KayingCodeSessionEvent }
  | { type: "state.updated"; notification: KayingCodeStateUpdatedNotification }
  | { type: "permission.request"; request: KayingCodePermissionRequestParams }
  | { type: "userInput.request"; request: KayingCodeUserInputRequestParams }
  | {
      type: "userInput.response";
      requestId: string;
      response: KayingCodeUserInputResponse;
    }
  | { type: "snapshot"; snapshot: KayingCodeSessionStateSnapshot };

export interface KayingCodeSessionInitializeResult {
  available: boolean;
  workspaceKey: string;
  protocolName?: string;
  protocolVersion?: number;
  transportKind?: "stdio" | "websocket";
  reason?: string;
  reasonCode?: "provider_not_ready";
}

export interface KayingCodeSessionWorkspaceRuntimeIdentity {
  generation: number;
  identity: string;
  processId?: number;
  workspaceKey: string;
}

export interface IKayingCodeSessionService {
  initializeWorkspace(params: KayingCodeSessionWorkspaceTarget): Promise<KayingCodeSessionInitializeResult>;
  getWorkspaceRuntimeIdentity(
    params: KayingCodeSessionWorkspaceTarget,
  ): Promise<KayingCodeSessionWorkspaceRuntimeIdentity>;
  readWorkspacePresentation(
    params: KayingCodeSessionReadWorkspacePresentationParams,
  ): Promise<KayingCodeWorkspacePresentation>;
  createSession(params: KayingCodeSessionCreateParams): Promise<KayingCodeSessionStateSnapshot>;
  resumeSession(params: KayingCodeSessionResumeParams): Promise<KayingCodeSessionStateSnapshot>;
  listSessions(params: KayingCodeSessionListParams): Promise<KayingCodeSessionInfo[]>;
  readSession(params: KayingCodeSessionReadParams): Promise<KayingCodeSessionStateSnapshot>;
  readSessionMessages(params: KayingCodeSessionMessagesParams): Promise<KayingCodeMessageWithParts[]>;
  readSessionEvents(params: KayingCodeSessionEventsParams): Promise<KayingCodeSessionEvent[]>;
  promoteDeferredDraftSession(params: KayingCodeTaskTarget): Promise<void>;
  closeSession(params: KayingCodeTaskTarget): Promise<void>;
  closeDeferredDraftSession(params: KayingCodeTaskTarget): Promise<boolean>;
  setModel(params: KayingCodeSessionSetModelParams): Promise<KayingCodeSessionStateSnapshot>;
  setThoughtLevel(params: KayingCodeSessionSetThoughtLevelParams): Promise<KayingCodeSessionStateSnapshot>;
  setMode(params: KayingCodeSessionSetModeParams): Promise<KayingCodeSessionStateSnapshot>;
  // renderer 订阅面走 agentService 的 conversation/sessions-index 帧通道。
}

export const IKayingCodeSessionService = createServiceDescriptor<IKayingCodeSessionService>(
  ServiceChannels.KayingCodeSession,
);
