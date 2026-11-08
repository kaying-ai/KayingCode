// @kayingcode/mobile-client-core 公开合同 —— 跨模块只允许从这里 import。
//
// 移动端连接核心：V2 URL 与本地档案、平台端口、上游 OAuth/ws2、
// V4 会话投影与 commandId 幂等账本。自托管链接只交给 Web，不建立旧配对连接。
// 纯 TypeScript、无 React 或平台 SDK；环境触点经 RelayPlatformPorts 注入。
// UI 与 WebView 生命周期留在各端壳，Web 使用固定官方源码。

export { RelayAttachments, type RelayAttachmentRead } from "./relayAttachments.js";

export {
  configureRelayPlatformPorts,
  currentRelayPlatformPorts,
  defaultRelayPlatformPorts,
  type RelayDeviceInfo,
  type RelayDeviceOs,
  type RelayPlatformFetch,
  type RelayPlatformPorts,
  type RelayPlatformRequestInit,
  type RelayPlatformResponse,
  type RelayStorageLike,
} from "./relayPlatform.js";

export { RelayConversationProjection, RelaySessionsIndexProjection } from "./relayProjection.js";
export {
  RelayWorkspaceConfigProjection,
  RelayWorkspaceConfigSubscriber,
} from "./relayWorkspaceConfig.js";
export type { IMobileModelCatalogAccess } from "@zcode/client";
export {
  relayPendingCommands,
  RelayPendingCommandLedger,
  type RelayPendingCommandEntry,
  type RelayPendingCommandKind,
  type RelayReconcileReport,
} from "./relayPendingCommands.js";
export { describeError, formatTime, t, zh } from "./relayStrings.js";
export type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";
export { RelayAgentConnection } from "./relayAgentConnection.js";
export type { MobileAgentService } from "./mobileAgentService.js";
export {
  RelaySessionCommands,
  runMobileSlashCommand,
  type RelayCommandOrdinals,
} from "./relaySessionCommands.js";
export {
  defaultMobileAccountLabel,
  describeMobileRemote,
  isKnownMobileHost,
  MOBILE_BACKEND_DISPLAY_NAME,
  parseMobileConnection,
  type MobileBackendType,
  type MobileConnectionParams,
} from "./mobileConnectionParams.js";
export {
  addMobileAccount,
  exportMobileAccounts,
  findMobileAccount,
  importMobileAccounts,
  listMobileAccounts,
  mobileAccountDedupKey,
  mobileAccountParams,
  removeMobileAccount,
  renameMobileAccount,
  touchMobileAccount,
  type MobileAccount,
  type MobileAccountExport,
} from "./mobileAccounts.js";

// ── zcode（zflow）协议栈 ────────────────────────────────────────────────────
// 阶段 4：ZCode 后端的移动端协议适配器。relay 连接 → 配对 → 工作区桥 →
// rpc-frame/channel RPC。Taro 侧经平台 socket 端口装配 ZflowClient。

export { ZflowClient, type ZflowClientOptions } from "./zcode/zflowClient.js";
export { ChannelBackedKayingCodeAgentService } from "./zcode/channelAgentService.js";
export { ChannelAutomation, type AutomationRecord } from "./zcode/channelAutomation.js";
export { ChannelModelProviders, type ModelProviderRecord } from "./zcode/channelModelProviders.js";
export { ChannelAttachments } from "./zcode/channelAttachments.js";
export { ChannelWorkspacePrep, type ChannelSkillEntry } from "./zcode/channelWorkspacePrep.js";
export {
  ZcodeRelayClient,
  ZFLOW_DEAD_LINK_THRESHOLD_MS,
  type ZcodeRelayClientOptions,
} from "./zcode/zcodeRelayClient.js";
export { ZflowBridgeManager, type ZflowBridgeManagerHooks } from "./zcode/zflowBridgeManager.js";
export {
  BridgeSession,
  buildBridgeStack,
  type BridgeStack,
  type BridgeTransportHooks,
} from "./zcode/bridgeSession.js";
export {
  ChannelClient,
  ChannelRpcError,
  ChannelRpcTimeoutError,
  Channels,
  CHANNEL_REQ_PROMISE,
  CHANNEL_REQ_PROMISE_CANCEL,
  CHANNEL_REQ_EVENT_LISTEN,
  CHANNEL_REQ_EVENT_DISPOSE,
  CHANNEL_RES_INITIALIZE,
  CHANNEL_RES_PROMISE_SUCCESS,
  CHANNEL_RES_PROMISE_ERROR,
  CHANNEL_RES_PROMISE_ERROR_OBJ,
  CHANNEL_RES_EVENT_FIRE,
  type ChannelClientOptions,
} from "./zcode/channelClient.js";
export {
  RpcFrameTransport,
  RpcFrameEmptyMessageError,
  RpcFrameMessageTooLargeError,
  RpcFrameFragmentLimitError,
  RPC_MAX_PHYSICAL_FRAME_BYTES,
  RPC_MAX_MESSAGE_BYTES,
  RPC_MAX_FRAGMENTS,
  type RpcFrameTransportOptions,
} from "./zcode/rpcFrameTransport.js";
export {
  defaultZflowSocket,
  ManualZflowTimePorts,
  realZflowTimePorts,
  zflowRelayCloseReason,
  zflowRequestId,
  type ZflowPayload,
  type ZflowRelayFailure,
  type ZflowRelayState,
  type ZflowSocketFactory,
  type ZflowSocketLike,
  type ZflowTimePorts,
} from "./zcode/zflowTypes.js";
export { zflowRelayWsUrl, type ZflowEndpointParams } from "./zcode/zflowParams.js";
export {
  ZcodeAuthSession,
  ZcodeAuthError,
  type ZcodeLoginFlow,
  type ZcodeLoginProvider,
} from "./zcode/zcodeAuth.js";
export { crc32, crc32Hex } from "./zcode/crc32.js";
export { base64Decode, base64Encode } from "./zcode/wireBase64.js";
export {
  decodeValue,
  encodeValue,
  IpcFrameParser,
  ipcFrameEncode,
  IPC_HEADER_BYTES,
  IPC_TYPE_REGULAR,
  utf8Decode,
  utf8Encode,
  ValueReader,
  ValueWriter,
  VALUE_TAG_UNDEFINED,
  VALUE_TAG_STRING,
  VALUE_TAG_BUFFER,
  VALUE_TAG_VSBUFFER,
  VALUE_TAG_ARRAY,
  VALUE_TAG_OBJECT,
  VALUE_TAG_INT,
} from "./zcode/valueCodec.js";

// ── 通知推导（阶段 4：通知域） ──────────────────────────────────────────────
// 从 sessions-index 快照纯推导运行中/新完成/待作答；平台通知投递由各端自理。

export {
  attentionTitleFor,
  completionTitleFor,
  computeNotifyUpdate,
  formatRunningText,
  NOTIFY_RUNNING_PHASES,
  NOTIFY_TERMINAL_PHASES,
  type AttentionEvent,
  type CompletionEvent,
  type NotifyUpdate,
  type RunningTask,
} from "./notifyProjection.js";
