import { gameDevelopmentPluginListingSchema } from "../game-development-plugin-listing.js";
import { pluginSkillDetailsSchema } from "../plugin-skill-details.js";
import { requestVerificationReasons } from "../request-security-edition/verification-policy.js";
import { kayingcodeProtocolTraceSchema } from "./trace.js";
// Bot 反向回复的名字解析/待澄清结果与 App、CLI 使用同一严格 schema。
export { channelReplyRequestSchema, channelReplyResultSchema } from "../channel-mention.js";
export { kayingcodeProtocolTraceSchema, type KayingCodeProtocolTrace } from "./trace.js";
import {
  databaseMigrationFactsSchema,
  databaseStartupErrorCodeSchema,
  databaseStartupErrorDetailsSchema,
} from "../database-startup.js";
import {
  MCP_APPS_APP_TOOLS_MAX_PER_INSTANCE,
  MCP_APPS_APP_TOOL_CALL_ID_MAX_CHARS,
  MCP_APPS_APP_TOOL_ERROR_MESSAGE_MAX_CHARS,
  mcpAppsAppToolCallResultSchema,
  mcpAppsAppToolDescriptorSchema,
} from "../mcp-apps/appTools.js";
import { mcpAppsSamplingParamsSchema, mcpAppsSamplingResultSchema } from "../mcp-apps/sampling.js";
import { mcpAppInstanceSchema } from "../mcp-apps/instance.js";
export { conversationQuoteSchema, conversationQuotesSchema } from "../conversationSelection.js";
/* oxlint-disable eslint(max-lines) -- KayingCode Protocol schema 需要单文件导出，方便 app 与 agent 共享同一份协议契约。 */
// ── 旧协议删除边界──────────────────────
// 剩余 ~257 个导出：旧 KayingCode Protocol 方法契约、请求/响应/事件 schema、
// session/workspace state snapshot 投影等（承重类型已迁 kayingcode-protocol-legacy-types.ts）。
// 已连根删除的死词（词表+schema+两侧实现）：session/steer、session/rewind、
// session/rewindCascade、session/previewFileRewind、session/applyFileRewind、
// prompt/enhance 全簇（含 promptEnhanceResult 通知）、plugins/marketplace/list；
// session/fork 客户端链已删（op+schema 留存 = v4 forkSessionAtMessage 钩子消费）。
// 消费者：services 旧栈（kayingcodeProtocolClient/kayingcodeAgent/kayingcodeAgentService/kayingcodeSession*）、
// CLI bootstrap 旧协议 server（kayingcode-protocol/server-operations、plugins、session-mapper 等）、
// UI 旧投影（kayingcodeSessionProjection 等读路径）。
// 上述旧协议 client/server 组删除时，本文件整体删除。
// 注：外部零消费 schema 多为存活 schema 联合的内部依赖，随宿主文件一起处理，勿单删。
import { z } from "zod";
import { accountProviderUnavailableReasonSchema } from "../account-provider-state.js";
import { bashOutputDisplaySchema } from "../bash-output-display.js";
export {
  MOBILE_MODEL_CATALOG_CHANNEL,
  mobileModelCatalogSchema,
  type MobileModelCatalog,
} from "../kayingcode-protocol-v4/mobile-model-catalog.js";
// 后台详情共享精简的只读响应 schema，不携带命令或计时元数据。
export * from "../background-bash-output.js";
import { kayingcodeAutomationBotDeliveryTargetSchema } from "../bots.js";
import { executionOutputPreviewSchema } from "../execution-output-preview.js";
import { completeModelPropertiesDataSchema } from "../model-config.js";
import { modelExecutionSchema } from "../model-execution.js";
export type { ModelExecutionSelectionFallback } from "../model-execution.js";
export * from "../off-peak-execution.js";
import { modelSelectionSchema } from "../model-selection.js";
import { APP_USAGE_RANGES, appUsageSnapshotSchema } from "../usage-stats.js";
import { DYNAMIC_WORKFLOW_MODES } from "../dynamic-workflow-feature.js";
import { errorAttributionSchema } from "../kayingcode-protocol-v4/snapshot.js";
export * from "../process-diagnostic.js";
export { attachmentSourceKindSchema, type AttachmentSourceKind } from "../attachment-source.js";
import { PROTOCOL_V4_LIMITS } from "../kayingcode-protocol-v4/core.js";

export const kayingcodeTopicResourceReadParamsSchema = z
  .object({
    requestId: z.string().min(1).max(256),
    taskId: z.string().min(1).max(256),
    inputId: z.string().min(1).max(256),
    authorizationId: z.string().min(1).max(256),
    messageId: z.string().min(1).max(256),
    resourceIndex: z.number().int().nonnegative(),
  })
  .strict();
export const kayingcodeTopicResourceReadResultSchema = z
  .object({
    ref: z.string().min(1),
    fileName: z.string().min(1).max(1024),
    mime: z.string().min(1).max(256),
    bytes: z.number().int().min(0).max(PROTOCOL_V4_LIMITS.attachmentMaxBytes),
  })
  .strict();
export const kayingcodeTopicResourceCancelParamsSchema = z
  .object({ requestId: z.string().min(1).max(256), taskId: z.string().min(1).max(256) })
  .strict();
export const kayingcodeTopicResourceCancelResultSchema = z
  .object({ cancelled: z.boolean() })
  .strict();
export type KayingCodeTopicResourceReadParams = z.infer<
  typeof kayingcodeTopicResourceReadParamsSchema
>;
export type KayingCodeTopicResourceReadResult = z.infer<
  typeof kayingcodeTopicResourceReadResultSchema
>;
export {
  activeWorkSummarySchema,
  type ActiveWorkSummary,
} from "../kayingcode-protocol-v4/snapshot.js";
// browser-use 命令/结果契约单一来源：agent 构造、协议校验和 main executor 共用同一 schema。
import {
  browserBackendListResultSchema,
  browserSessionContextKindSchema,
} from "../browser-use/backend.js";
import { browserClientModeSchema, browserCommandSchema } from "../browser-use/commands.js";
import { browserCommandResultSchema } from "../browser-use/result.js";
import { appToolSearchModeSchema } from "../app-runtime-preferences.js";
import { integratedTerminalShellSelectionSchema } from "../validationAppSettings.js";
import { kayingcodeTaskModeSchema } from "../kayingcode-task-mode-schema.js";
import {
  OFFICIAL_AUTH_CONSUMER_KINDS,
  OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS,
} from "../official-mcp-auth.js";
import {
  kayingcodeSyntheticUserMessageSourceSchema as legacyZcodeSyntheticUserMessageSourceSchema,
  kayingcodeDeliveryKindSchema,
  kayingcodeInteractionRequestOriginSchema,
  kayingcodeMessagePartSchema,
  kayingcodeMessageVisibilitySchema,
  kayingcodeMessageWithPartsSchema,
  kayingcodePermissionDecisionSchema,
  kayingcodePermissionResponseSchema,
  kayingcodePermissionUpdateSchema,
  kayingcodeSessionApiRetryStatusSchema,
  kayingcodeSessionContextUsageSchema,
  kayingcodeSessionGoalSchema,
  kayingcodeSessionGoalVerificationSchema,
  kayingcodeSessionGoalVerificationTimelineSchema,
  kayingcodeSessionInfoSchema,
  kayingcodeSessionKindSchema,
  kayingcodeSessionModeSchema,
  kayingcodeSessionRuntimeStateSchema,
  kayingcodeSessionStatusSchema,
  kayingcodeToolStateSchema,
  kayingcodeWorkspaceRefSchema,
} from "../kayingcode-protocol-legacy-types.js";

export * from "../local-ttft/contract.js";
export {
  hookExecutionProjectionSchema,
  hookInvocationRowSchema,
  type HookExecutionProjection,
  type HookInvocationRow,
} from "../kayingcode-protocol-v4/rows.js";

export {
  sessionsIndexReconcileParamsSchema,
  sessionsIndexReconcileResultSchema,
  type SessionsIndexReconcileParams,
  type SessionsIndexReconcileResult,
} from "../kayingcode-protocol-v4/sessions-index.js";

export const KAYINGCODE_PROTOCOL_NAME = "KayingCode Protocol" as const;
export const KAYINGCODE_PROTOCOL_VERSION = 1 as const;
// V4 wire 与 legacy 主协议并存；禁止为了 V4 physical framing 改写 legacy 版本。
export const KAYINGCODE_PROTOCOL_V4_WIRE_VERSION = 3 as const;
export const kayingcodeRuntimeCapabilitiesSchema = z.object({
  sessionLifecycleWorkspace: z.boolean().optional(),
  sessionDirectorySource: z.boolean().optional(),
  sessionWorkspaceRouting: z.boolean().optional(),
  genUiContext: z.boolean().optional(),
  historyFirst: z.boolean().optional(),
  independentPlanState: z.boolean().optional(),
  /** CLI 认识 rowsRange 的 residency 参数；旧 CLI 会剥掉它并冷恢复，Host 据此拒绝转发。 */
  residentRowsRange: z.boolean().optional(),
});
export const kayingcodeRuntimeCapabilitiesParamsSchema = z
  .object({
    hostCapabilities: z
      .object({
        sessionDirectorySource: z.boolean().optional(),
        sessionWorkspaceRouting: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const kayingcodeProtocolErrorCodes = {
  sessionUnavailable: -32004,
} as const;

const nonEmptyString = z.string().trim().min(1);
const jsonObjectSchema = z.record(z.string(), z.unknown());
const timestampMsSchema = z.number().int().nonnegative();
const protocolInstantSchema = z.union([timestampMsSchema, nonEmptyString, z.date()]);

// Tool result display 不受模型文本 budget 约束；Node REPL 图片必须在 Agent/App 协议边界
// 做严格限长，避免截图把 continuous 或 replayable 消息扩成无界载荷。
export const kayingcodeNodeReplImageToolResultDisplaySchema = z
  .object({
    kind: z.literal("node_repl_images"),
    images: z
      .array(
        z
          .object({
            base64: z
              .string()
              .min(1)
              .max(200 * 1024),
            mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/iu),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    truncated: z.boolean().optional(),
    source: z.literal("browser_turn_end").optional(),
  })
  .strict();

// 同理：CreateWorkflow 的类型检查诊断也是 display 通道，必须在协议边界限长，
// 避免大量诊断把 continuous/replayable 消息扩成无界载荷。
// causalityGraph 在工具输出边界已限长，这里镜像同一组上界（与 v4 rows 保持一致）。
// 图的词汇表刻意很小：step 卡片 + actor 车道 + 一种箭头（runs after，`back` 只标回边）+
// 返回物标记。分析器的 kind / certainty / exact / region 不进载荷。
// 名字只在运行时成形（`` agent(`研究员${i + 1}`) ``）时静态能拿到的形状：第一个洞之前的
// 字面量（head）与最后一个洞之后的字面量（tail）。至少一个在场，两者都已 trim 且含实义字符。
// Bug 修复：这两个字段随 0a8b059f40 落进 contracts 与 v4 镜像，v3 这份漏改——.strict()
// 之下带插值名的工作流会让整个 display 验证失败、图整块消失，所以这里必须与 v4 逐字段对齐。
const kayingcodeWorkflowNamePatternSchema = z
  .object({
    head: z.string().min(1).max(128).optional(),
    tail: z.string().min(1).max(128).optional(),
  })
  .strict();

// 一条边 = runs after；step 边与阶段边同形，`back` 只标循环回边。
const kayingcodeWorkflowEdgeSchema = z
  .object({
    from: z.string().min(1).max(64),
    to: z.string().min(1).max(64),
    back: z.literal(true).optional(),
  })
  .strict();

const kayingcodeCreateWorkflowCausalityGraphDisplaySchema = z
  .object({
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            // `hole`：开着的留白自己的站点（docs/dynamic-workflow/presentation.md「Holes on the timeline」）；镜像 v4。
            kind: z.enum(["ask", "world-read", "hole"]),
            label: z.string().min(1).max(128),
            // 内联 `agent()` receiver 让 label 落到兜底串时，那个名字的静态形状。
            labelPattern: kayingcodeWorkflowNamePatternSchema.optional(),
            line: z.number().int().positive().optional(),
            column: z.number().int().positive().optional(),
            lane: z.string().min(1).max(64),
            lanes: z.array(z.string().min(1).max(64)).max(32).optional(),
            // 展开自的站点 id，只出现在 may-set 车道展开的拷贝上（实时叠加的关联键）；
            // 加字段是 additive 的，不带它的旧载荷照常通过 .strict()。
            source: z.string().min(1).max(64).optional(),
            // 作者用 `phase("…")` 标记划入的阶段。
            // 与图的 phases / phaseEdges / exits 同进同退：全在场或全缺席。
            phase: z.string().min(1).max(64).optional(),
            repeat: z.enum(["stack", "serial"]).optional(),
            // 这个站点是某次补全写进来的：值是那个留白的站点 id；镜像 v4。
            fill: z.string().min(1).max(64).optional(),
          })
          .strict(),
      )
      .max(64),
    lanes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            name: z.string().min(1).max(128).optional(),
            // `name` 缺席而 agent() 首参是带洞的模板串时的静态形状；与 name 互斥。
            namePattern: kayingcodeWorkflowNamePatternSchema.optional(),
            line: z.number().int().positive().optional(),
            column: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .max(32),
    // 参与者与交接；镜像 v4。
    participants: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            phase: z.string().min(1).max(64),
            lane: z.string().min(1).max(64),
            steps: z.array(z.string().min(1).max(64)).min(1).max(64),
            member: z
              .object({ index: z.number().int().nonnegative(), of: z.number().int().positive() })
              .strict()
              .optional(),
            many: z.literal(true).optional(),
          })
          .strict(),
      )
      .max(64),
    handoffs: z
      .array(
        kayingcodeWorkflowEdgeSchema
          .extend({ types: z.array(z.string().min(1).max(128)).min(1).max(8).optional() })
          .strict(),
      )
      .max(256),
    // 阶段词汇表：作者施加的分组结构，主画面以它为节点。与 phaseEdges / exits / Step.phase
    // 全有或全无——零标记脚本全缺席，UI 据此退回 step/车道视图。零成员阶段也在表里。
    // `unphased` 无 name，显示名由 UI 本地化。
    phases: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            name: z.string().min(1).max(128).optional(),
            line: z.number().int().positive().optional(),
            column: z.number().int().positive().optional(),
            // 进入本阶段时还在跑的其他阶段（它们的 strand 尚未 join），阶段表序，不含自己，
            // 为空时缺席。是节点事实而不是边——控制没有从那里转移过来，所以不进 phaseEdges。
            // 时间轴据此把相邻阶段折成一条分叉的「带」，侧栏迷你轨道画成双线段。
            alongside: z.array(z.string().min(1).max(64)).min(1).max(32).optional(),
            // 这个阶段是某次补全写进来的：值是那个留白的站点 id；镜像 v4。
            fill: z.string().min(1).max(64).optional(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    phaseEdges: z.array(kayingcodeWorkflowEdgeSchema).max(128).optional(),
    // 阶段流（docs/dynamic-workflow/presentation.md「Streams」）：两端互为 alongside 的 data 边，
    // 只有 {from, to}——不是 runs after，不进 phaseEdges、不带 back。与词汇表同进同退。
    phaseStreams: z
      .array(z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64) }).strict())
      .max(128)
      .optional(),
    // 还开着的留白，源码序（docs/dynamic-workflow/authoring.md「Holes」）；镜像 v4。
    holes: z
      .array(
        z
          .object({
            siteId: z.string().min(1).max(64),
            name: z.string().min(1).max(128),
            type: z.string().min(1).max(128),
            phase: z.string().min(1).max(64).optional(),
            tail: z.boolean().optional(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    // 控制流可在其后正常完成的阶段（阶段视图的「阶段 → 返回物」箭头）；组内可为空数组。
    exits: z.array(z.string().min(1).max(64)).max(32).optional(),
    sink: z.array(z.string().min(1).max(64)).max(64).optional(),
    truncated: z.boolean().optional(),
  })
  .strict();

export const kayingcodeCreateWorkflowToolResultDisplaySchema = z
  .object({
    kind: z.literal("create_workflow"),
    ok: z.boolean(),
    errorCount: z.number().int().nonnegative(),
    diagnostics: z
      .array(
        z
          .object({
            line: z.number().int().nonnegative(),
            column: z.number().int().nonnegative(),
            code: z.number().int().nonnegative(),
            message: z.string().min(1).max(2_048),
          })
          .strict(),
      )
      .max(100),
    causalityGraph: kayingcodeCreateWorkflowCausalityGraphDisplaySchema.optional(),
    truncated: z.boolean().optional(),
    // FillWorkflowHole 行补的是哪处留白（docs/dynamic-workflow/presentation.md「The fill row」）；镜像 v4。
    // 修复原因：dwf-recursive 只给 contracts 与 v4 加了留白字段，v3 的 .strict() 拒掉整条 tool.updated，
    // 桌面端 v3 订阅于是把含留白的 CreateWorkflow / FillWorkflowHole 结果当无效事件丢掉。
    fill: z
      .object({
        siteId: z.string().min(1).max(64),
        name: z.string().min(1).max(128),
        draftPath: z.string().min(1).max(1_024).optional(),
        line: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const kayingcodeToolResultObjectSchema = jsonObjectSchema.superRefine((result, context) => {
  const display = result.display;
  if (typeof display !== "object" || display === null || Array.isArray(display)) {
    return;
  }
  const kind = (display as Record<string, unknown>).kind;
  const schemaByKind: Record<string, z.ZodTypeAny> = {
    node_repl_images: kayingcodeNodeReplImageToolResultDisplaySchema,
    create_workflow: kayingcodeCreateWorkflowToolResultDisplaySchema,
    bash_output: bashOutputDisplaySchema,
  };
  const schema = typeof kind === "string" ? schemaByKind[kind] : undefined;
  if (!schema) return;
  const parsed = schema.safeParse(display);
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    context.addIssue({ ...issue, path: ["display", ...issue.path] });
  }
});

export const kayingcodeProtocolRequestIdSchema = z.union([z.string(), z.number().int()]);
export type KayingCodeProtocolRequestId = z.infer<typeof kayingcodeProtocolRequestIdSchema>;

// 远程历史附件仅通过现有连接的私有反向频道传输，单块保持在 RPC 帧预算内。
export const TOPIC_RESOURCE_RELAY_CHUNK_BYTES = 384 * 1024;
export const TOPIC_RESOURCE_RELAY_CHANNEL = "host-topic-resource";
export const kayingcodeTopicResourceRelayRequestSchema = kayingcodeTopicResourceReadParamsSchema
  .extend({
    workspacePath: z.string().min(1).max(4096),
    workspaceIdentity: z.string().min(1).max(4096),
    remoteSessionId: z.string().min(1).max(256),
    trace: kayingcodeProtocolTraceSchema.optional(),
  })
  .strict();
export type KayingCodeTopicResourceRelayRequest = z.infer<
  typeof kayingcodeTopicResourceRelayRequestSchema
>;
export const kayingcodeTopicResourceRelayKeySchema = kayingcodeTopicResourceCancelParamsSchema;
export const kayingcodeTopicResourceRelayChunkRequestSchema = kayingcodeTopicResourceRelayKeySchema
  .extend({
    index: z.number().int().nonnegative(),
  })
  .strict();
export const kayingcodeTopicResourceRelayMetadataSchema = z
  .object({
    fileName: z.string().min(1).max(1024),
    mime: z.string().min(1).max(256),
    bytes: z.number().int().min(0).max(PROTOCOL_V4_LIMITS.attachmentMaxBytes),
    totalChunks: z
      .number()
      .int()
      .min(0)
      .max(Math.ceil(PROTOCOL_V4_LIMITS.attachmentMaxBytes / TOPIC_RESOURCE_RELAY_CHUNK_BYTES)),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const kayingcodeTopicResourceRelayChunkSchema = z
  .object({
    dataBase64: z.string().max((TOPIC_RESOURCE_RELAY_CHUNK_BYTES / 3) * 4),
  })
  .strict();

export const kayingcodeProtocolRequestSchema = z
  .object({
    id: kayingcodeProtocolRequestIdSchema,
    method: nonEmptyString,
    params: z.unknown().optional(),
    trace: kayingcodeProtocolTraceSchema.optional(),
  })
  .strict();
export type KayingCodeProtocolRequest = z.infer<typeof kayingcodeProtocolRequestSchema>;

export const kayingcodeProtocolNotificationSchema = z
  .object({
    method: nonEmptyString,
    params: z.unknown().optional(),
    trace: kayingcodeProtocolTraceSchema.optional(),
  })
  .strict();
export type KayingCodeProtocolNotification = z.infer<typeof kayingcodeProtocolNotificationSchema>;

export const kayingcodeProtocolResponseSchema = z
  .object({
    id: kayingcodeProtocolRequestIdSchema,
    result: z.unknown(),
  })
  .strict();
export type KayingCodeProtocolResponse = z.infer<typeof kayingcodeProtocolResponseSchema>;

export const kayingcodeProtocolErrorSchema = z
  .object({
    id: kayingcodeProtocolRequestIdSchema,
    error: z
      .object({
        code: z.number().int(),
        message: nonEmptyString,
        data: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
export type KayingCodeProtocolError = z.infer<typeof kayingcodeProtocolErrorSchema>;

export const kayingcodeProtocolMessageSchema = z.union([
  kayingcodeProtocolRequestSchema,
  kayingcodeProtocolNotificationSchema,
  kayingcodeProtocolResponseSchema,
  kayingcodeProtocolErrorSchema,
]);
export type KayingCodeProtocolMessage = z.infer<typeof kayingcodeProtocolMessageSchema>;

export const kayingcodeProtocolNotifications = {
  storageStartup: "startup/storageState",
  providerRuntimeHeadersCancelled: "interaction/providerRuntimeHeadersCancelled",
  mcpTelemetry: "process/mcpTelemetry",
  mcpResourceSamples: "process/mcpResourceSamples",
  toolExecResource: "process/toolExecResource",
  pluginOperationProgress: "plugins/operationProgress",
  processResourceSample: "process/resourceSample",
  processNetworkRequests: "process/networkRequests",
} as const;

/** 启动控制面独立于 task stream；数据库身份不可携带路径/凭据。 */
export const kayingcodeStorageStartupStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    attemptId: z.string().min(1).max(128),
    sequence: z.number().int().positive(),
    databaseId: z.string().min(1).max(128),
    databaseKind: z.enum(["session", "tasks-index"]),
    phase: z.enum(["checking", "waiting_for_lock", "migrating", "committing", "ready", "failed"]),
    // 包含锁内、版本 SQL 之前的可选 lastAppliedMigrationId；旧通知仍可解析。
    migration: databaseMigrationFactsSchema.optional(),
    elapsedMs: z.number().nonnegative().finite(),
    completed: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
    errorCode: databaseStartupErrorCodeSchema.optional(),
    ...databaseStartupErrorDetailsSchema.shape,
  })
  .strict()
  .superRefine((state, context) => {
    if (state.phase === "failed" && !state.errorCode)
      context.addIssue({ code: "custom", message: "failed requires errorCode" });
  });
export type KayingCodeStorageStartupState = z.infer<typeof kayingcodeStorageStartupStateSchema>;

const kayingcodeMcpTelemetryPlatformSchema = z.enum([
  "aix",
  "android",
  "darwin",
  "freebsd",
  "haiku",
  "linux",
  "netbsd",
  "openbsd",
  "sunos",
  "win32",
  "cygwin",
]);
const kayingcodeMcpTelemetryArchSchema = z.enum([
  "arm",
  "arm64",
  "ia32",
  "loong64",
  "mips",
  "mipsel",
  "ppc",
  "ppc64",
  "riscv64",
  "s390",
  "s390x",
  "x64",
]);
const kayingcodeMcpTelemetryBaseSchema = z
  .object({
    arch: kayingcodeMcpTelemetryArchSchema,
    occurredAt: z.number().int().nonnegative(),
    platform: kayingcodeMcpTelemetryPlatformSchema,
  })
  .strict();
const kayingcodeMcpProcessTelemetryBaseShape = {
  mcpId: z
    .string()
    .regex(
      /^(?:builtin:(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+(?::(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+)*|(?:plugin|custom):[a-f0-9]{12})$/,
    ),
  mcpInstanceId: nonEmptyString,
  mcpIsolation: z.enum(["session", "workspace"]),
  mcpSource: z.enum(["builtin", "plugin", "custom"]),
} as const;

export const kayingcodeMcpTelemetryEventSchema = z.discriminatedUnion("kind", [
  kayingcodeMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("process_start"),
      ...kayingcodeMcpProcessTelemetryBaseShape,
    })
    .strict(),
  kayingcodeMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("process_crash"),
      ...kayingcodeMcpProcessTelemetryBaseShape,
      affectedSessionCount: z.number().int().nonnegative().max(10_000),
      exitCode: z.number().int().nullable(),
      signal: nonEmptyString.nullable(),
      uptimeMs: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  kayingcodeMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("session_startup"),
      configuredCount: z.number().int().nonnegative().max(10_000),
      connectedCount: z.number().int().nonnegative().max(10_000),
      failedCount: z.number().int().nonnegative().max(10_000),
      processCount: z.number().int().nonnegative().max(10_000),
      sessionId: nonEmptyString,
    })
    .strict(),
  kayingcodeMcpTelemetryBaseSchema
    .extend({
      kind: z.literal("memory"),
      ...kayingcodeMcpProcessTelemetryBaseShape,
      memoryKb: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
      memoryScope: z.enum(["process_tree", "direct_process"]),
      orphanSuspected: z.boolean(),
      ownerSessionCount: z.number().int().nonnegative().max(10_000),
      unownedSeconds: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
]);
export type KayingCodeMcpTelemetryEvent = z.infer<typeof kayingcodeMcpTelemetryEventSchema>;

/** MCP 每五分钟只探测一次，周期由生产者与设备总量过期判据共用。 */
export const KAYINGCODE_MCP_RESOURCE_SAMPLE_INTERVAL_MS = 5 * 60_000;

export const kayingcodeMcpResourceSampleSchema = z
  .object({
    mcpId: kayingcodeMcpProcessTelemetryBaseShape.mcpId,
    instanceToken: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    sampledAt: z.number().int().nonnegative(),
    intervalMs: z.number().finite().positive(),
    processCount: z.number().int().positive().max(100_000),
    rssKbTotal: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    rssKbMaxProcess: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    cpuTimeMsDelta: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    uptimeMinutes: z.number().int().nonnegative(),
    platform: kayingcodeMcpTelemetryPlatformSchema,
    arch: kayingcodeMcpTelemetryArchSchema,
    logicalCpuCount: z.number().int().positive().max(4_096),
    totalMemoryGb: z.number().int().nonnegative().max(1_048_576),
  })
  .strict();
export type KayingCodeMcpResourceSample = z.infer<typeof kayingcodeMcpResourceSampleSchema>;
// 通知输入有界；main 另按每个上报窗口的 32 个 MCP 分组执行事件额度。
export const kayingcodeMcpResourceSamplesSchema = z
  .array(kayingcodeMcpResourceSampleSchema)
  .max(1_024);

export const BASH_RESOURCE_SAMPLE_INTERVAL_MS = 15_000;
export const BASH_RESOURCE_MAX_SAMPLES = 20;

/** Bash 子进程的有界完成事实；禁止命令、路径与会话标识进入遥测旁路。 */
export const kayingcodeToolExecResourceSchema = z
  .object({
    // 同一完成事实可能经多个 Host 转发；随机标识仅供 main 去重，旧 CLI 缺字段仍兼容。
    completionToken: z.string().uuid().optional(),
    platform: kayingcodeMcpTelemetryPlatformSchema,
    toolName: z.literal("bash"),
    durationMs: z.number().finite().min(BASH_RESOURCE_SAMPLE_INTERVAL_MS),
    exitKind: z.enum(["completed", "timeout", "killed", "error"]),
    treeRssKbPeak: z.number().finite().nonnegative().optional(),
    treeCpuTimeMs: z.number().finite().nonnegative().optional(),
    sampleCount: z.number().int().nonnegative().max(BASH_RESOURCE_MAX_SAMPLES),
    cliRssKb: z.number().finite().nonnegative(),
    systemFreeMemoryKb: z.number().finite().nonnegative(),
  })
  .strict();
export type KayingCodeToolExecResource = z.infer<typeof kayingcodeToolExecResourceSchema>;

export const kayingcodeProcessResourceSampleSchema = z
  .object({
    platform: z.enum([
      "aix",
      "android",
      "darwin",
      "freebsd",
      "haiku",
      "linux",
      "netbsd",
      "openbsd",
      "sunos",
      "win32",
      "cygwin",
    ]),
    arch: z.enum([
      "arm",
      "arm64",
      "ia32",
      "loong64",
      "mips",
      "mipsel",
      "ppc",
      "ppc64",
      "riscv64",
      "s390",
      "s390x",
      "x64",
    ]),
    logicalCpuCount: z.number().int().positive().max(4_096),
    intervalMs: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60 * 1_000),
    cpuCores: z.number().finite().nonnegative().max(4_096),
    cpuPercent: z.number().finite().nonnegative().max(100_000),
    rssKb: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    /**
     * 以下四项为遥测新增字段，全部可选：旧 CLI 发来的样本仍能通过校验，因此
     * **不递增协议握手版本号**（握手版本是兼容性开关，不是字段版本）。
     */
    heapUsedKb: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    uptimeMinutes: z
      .number()
      .int()
      .nonnegative()
      .max(10 * 365 * 24 * 60)
      .optional(),
    totalMemoryGb: z.number().int().nonnegative().max(1_048_576).optional(),
    /**
     * CLI 进程启动时随机生成的实例标识，仅供 app 侧 main 统计「同时存活几个 CLI 进程」
     * 与「最大单进程 RSS」。不进 ARMS 属性、不含 pid。收紧字符集是隐私红线的机械保障：
     * 路径、workspace 标识这类内容不可能通过校验。
     */
    instanceToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
  })
  .strict();
export type KayingCodeProcessResourceSample = z.infer<typeof kayingcodeProcessResourceSampleSchema>;

export const kayingcodeProcessChildProcessesParamsSchema = z.object({}).strict();
export const kayingcodeProcessChildProcessSchema = z
  .object({
    pid: z.number().int().positive(),
    serverName: nonEmptyString,
    mcpSource: z.enum(["builtin", "plugin", "custom"]),
    /** 官方/第三方插件的插件名（`plugin:<name>:<key>` 的 name，或官方 host MCP 对应插件）；custom 无 */
    pluginName: nonEmptyString.optional(),
  })
  .strict();
export const kayingcodeProcessChildProcessesResultSchema = z
  .object({
    processes: z.array(kayingcodeProcessChildProcessSchema).max(10_000),
  })
  .strict();
export type KayingCodeProcessChildProcess = z.infer<typeof kayingcodeProcessChildProcessSchema>;
export type KayingCodeProcessChildProcessesResult = z.infer<
  typeof kayingcodeProcessChildProcessesResultSchema
>;

export type KayingCodeDeliveryKind = z.infer<typeof kayingcodeDeliveryKindSchema>;
// TurnStarted 与持久 message 必须共用同一来源词表；否则 live event 能通过而 cold
// message 在 app/agent 边界被拒绝，造成 continuous/replayable 语义分叉。
// 持久消息与输入沿用同一 source schema；agent_listing_delta 只作 provider context，不触发新 turn。
const kayingcodeTurnInputSourceSchema = legacyZcodeSyntheticUserMessageSourceSchema;
export const kayingcodeSessionPersistenceSchema = z.enum(["immediate", "deferred"]);
export type KayingCodeSessionPersistence = z.infer<typeof kayingcodeSessionPersistenceSchema>;
export type KayingCodeWorkspaceRef = z.infer<typeof kayingcodeWorkspaceRefSchema>;
export const kayingcodePermissionOptionSchema = z
  .object({
    optionId: nonEmptyString,
    kind: nonEmptyString,
    name: nonEmptyString,
    description: z.string().optional(),
    response: kayingcodePermissionResponseSchema,
  })
  .strict();

const kayingcodeProtocolMcpEntrySchema = z
  .object({
    name: nonEmptyString,
    value: z.string(),
  })
  .strict();

const kayingcodeProtocolMcpOAuthSchema = z.union([
  z
    .object({
      type: z.literal("client_credentials"),
      clientId: nonEmptyString,
      clientSecret: nonEmptyString,
      clientName: nonEmptyString.optional(),
      scope: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("authorization_code"),
      clientId: nonEmptyString.optional(),
      clientSecret: nonEmptyString.optional(),
      clientName: nonEmptyString.optional(),
      redirectPath: nonEmptyString.optional(),
      scope: z.string().optional(),
    })
    .strict(),
]);

export const kayingcodeProtocolMcpServerSchema = z.union([
  z
    .object({
      name: nonEmptyString,
      scope: z.enum(["user", "workspace"]).optional(),
      command: nonEmptyString,
      cwd: nonEmptyString.optional(),
      args: z.array(z.string()),
      env: z.array(kayingcodeProtocolMcpEntrySchema),
      isolation: z.enum(["session", "workspace"]).optional(),
      protocolVersion: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
      alwaysLoad: z.boolean().optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      name: nonEmptyString,
      scope: z.enum(["user", "workspace"]).optional(),
      type: z.enum(["http", "sse"]),
      url: nonEmptyString,
      headers: z.array(kayingcodeProtocolMcpEntrySchema),
      oauth: kayingcodeProtocolMcpOAuthSchema.optional(),
      isolation: z.enum(["session", "workspace"]).optional(),
      protocolVersion: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
      alwaysLoad: z.boolean().optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .strict(),
]);
export type KayingCodeProtocolMcpServer = z.infer<typeof kayingcodeProtocolMcpServerSchema>;

export const kayingcodeMcpServerStatusKindSchema = z.enum([
  "connecting",
  "connected",
  "disabled",
  "disconnected",
  "failed",
  "untrusted",
]);
export const MCP_SERVER_FAILURE_KINDS = [
  "config_invalid",
  "runtime_unavailable",
  "process_start_failed",
  "network_unreachable",
  "connection_timeout",
  "protocol_negotiation_failed",
  "tool_list_failed",
  "unexpected_disconnect",
  "oauth_authorization_failed",
  "official_origin_untrusted",
  "not_authenticated",
  "coding_plan_required",
  "server_not_found",
  "server_unavailable",
  "rate_limited",
  "server_internal_error",
  "protocol_error",
  "status_unavailable",
  "connection_failed",
] as const;
export const mcpServerFailureKindSchema = z.enum(MCP_SERVER_FAILURE_KINDS);
export type McpServerFailureKind = z.infer<typeof mcpServerFailureKindSchema>;
export const workspaceMcpTrustReviewSchema = z
  .object({
    declarationDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    sourcePaths: z.array(nonEmptyString),
    display: z.string(),
    trusted: z.boolean(),
    configuredEnabled: z.boolean(),
    transport: z.enum(["stdio", "http", "sse"]),
  })
  .strict();
export type WorkspaceMcpTrustReview = z.infer<typeof workspaceMcpTrustReviewSchema>;
export const kayingcodeWorkspaceMcpTrustParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    serverName: nonEmptyString,
    declarationDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    trusted: z.boolean(),
  })
  .strict();
export const kayingcodeWorkspaceMcpTrustResultSchema = z
  .object({
    accepted: z.boolean(),
    reasonCode: z
      .enum(["workspace_mcp_declaration_changed", "workspace_mcp_trust_unavailable"])
      .optional(),
  })
  .strict();
export type KayingCodeWorkspaceMcpTrustResult = z.infer<
  typeof kayingcodeWorkspaceMcpTrustResultSchema
>;
export const kayingcodeMcpServerStatusSnapshotSchema = z
  .object({
    status: kayingcodeMcpServerStatusKindSchema,
    workspaceTrust: workspaceMcpTrustReviewSchema.optional(),
    transport: z.enum(["stdio", "http", "sse"]),
    toolCount: z.number().int().nonnegative(),
    updatedAt: nonEmptyString,
    error: z.string().optional(),
    failureKind: mcpServerFailureKindSchema.optional(),
    serverRequestId: nonEmptyString.optional(),
    protocolEra: z.enum(["legacy", "modern"]).optional(),
    authorization: z
      .object({
        type: z.literal("oauth_authorization_code"),
        authorizationUrl: nonEmptyString,
        startedAt: nonEmptyString,
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodeMcpServerStatusSnapshot = z.infer<
  typeof kayingcodeMcpServerStatusSnapshotSchema
>;

export const kayingcodeMcpListModeSchema = z.enum(["connect", "status"]);
export type KayingCodeMcpListMode = z.infer<typeof kayingcodeMcpListModeSchema>;

export const kayingcodeMcpListParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    mcpServers: z.array(kayingcodeProtocolMcpServerSchema).optional(),
    mode: kayingcodeMcpListModeSchema.default("connect"),
  })
  .strict();
export const kayingcodeMcpListResultSchema = z
  .object({
    statuses: z.record(z.string(), kayingcodeMcpServerStatusSnapshotSchema),
  })
  .strict();
export type KayingCodeMcpListResult = z.infer<typeof kayingcodeMcpListResultSchema>;

// 插件 UI：UI 发起的 MCP 资源读取与工具调用，
// 按 pluginId 限定 server 归属，agent 侧 fail closed。
export const kayingcodeMcpUiOpenInstanceParamsSchema = z
  .object({
    accountContext: z.string().max(256).optional(),
    workspace: kayingcodeWorkspaceRefSchema,
    sessionId: nonEmptyString,
    pluginId: nonEmptyString,
    serverName: nonEmptyString,
    scopeId: nonEmptyString.max(4096),
    resourceUri: nonEmptyString.max(2048),
    ownerWebContentsId: z.number().int().positive(),
  })
  .strict();
export const kayingcodeMcpUiOpenInstanceResultSchema = mcpAppInstanceSchema;
export type KayingCodeMcpUiOpenInstanceParams = z.infer<
  typeof kayingcodeMcpUiOpenInstanceParamsSchema
>;
const kayingcodeMcpUiPluginScopeShape = {
  instance: mcpAppInstanceSchema,

  workspace: kayingcodeWorkspaceRefSchema,
  sessionId: nonEmptyString,
  pluginId: nonEmptyString,
  serverName: nonEmptyString,
};
export const kayingcodeMcpUiCloseInstanceParamsSchema = z
  .object({ ...kayingcodeMcpUiPluginScopeShape, onlyIfIdle: z.boolean().optional() })
  .strict();
export const kayingcodeMcpUiCloseInstanceResultSchema = z.object({ closed: z.boolean() }).strict();
export const kayingcodeMcpReadResourceParamsSchema = z
  .object({ ...kayingcodeMcpUiPluginScopeShape, uri: nonEmptyString.max(2048) })
  .strict();
export type KayingCodeMcpReadResourceParams = z.infer<typeof kayingcodeMcpReadResourceParamsSchema>;
export const kayingcodeMcpResourceContentSchema = z
  .object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const kayingcodeMcpReadResourceResultSchema = z
  .object({ contents: z.array(kayingcodeMcpResourceContentSchema) })
  .strict();
export type KayingCodeMcpReadResourceResult = z.infer<typeof kayingcodeMcpReadResourceResultSchema>;

/**
 * 插件页面发起的 `resources/read` 代理。
 * 与 `mcp/readResource`（宿主取 ui:// HTML）参数同形，但结果去掉 `_meta`、受 8 MiB 与 mimeType 白名单约束。
 */
export const kayingcodeMcpUiReadResourceParamsSchema = kayingcodeMcpReadResourceParamsSchema;
export type KayingCodeMcpUiReadResourceParams = z.infer<
  typeof kayingcodeMcpUiReadResourceParamsSchema
>;
export const kayingcodeMcpUiResourceContentSchema = z
  .object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.string().optional(),
  })
  .strict();
export const kayingcodeMcpUiReadResourceResultSchema = z
  .object({ contents: z.array(kayingcodeMcpUiResourceContentSchema) })
  .strict();
export type KayingCodeMcpUiReadResourceResult = z.infer<
  typeof kayingcodeMcpUiReadResourceResultSchema
>;

export const kayingcodeMcpUiSamplingParamsSchema = z
  .object({
    ...kayingcodeMcpUiPluginScopeShape,
    operationId: nonEmptyString.max(128),
    request: mcpAppsSamplingParamsSchema,
  })
  .strict();
export const kayingcodeMcpUiCancelSamplingParamsSchema = z
  .object({ ...kayingcodeMcpUiPluginScopeShape, operationId: nonEmptyString.max(128) })
  .strict();
export const kayingcodeMcpUiSamplingResultSchema = mcpAppsSamplingResultSchema;
export type KayingCodeMcpUiSamplingParams = z.infer<typeof kayingcodeMcpUiSamplingParamsSchema>;
export type KayingCodeMcpUiCancelSamplingParams = z.infer<
  typeof kayingcodeMcpUiCancelSamplingParamsSchema
>;

export const kayingcodeMcpUiCallToolParamsSchema = z
  .object({
    ...kayingcodeMcpUiPluginScopeShape,
    toolName: nonEmptyString,
    arguments: z.record(z.string(), z.unknown()).optional(),
    /** 宿主生成的调用 id，配合 `mcp/uiCancelCall` 取消进行中的调用。 */
    callId: nonEmptyString.max(128),
  })
  .strict();
export type KayingCodeMcpUiCallToolParams = z.infer<typeof kayingcodeMcpUiCallToolParamsSchema>;
/** 取消页面发起的工具调用（卡片卸载、会话切换）；agent 侧 abort 到 MCP client。 */
export const kayingcodeMcpUiCancelCallParamsSchema = z
  .object({ ...kayingcodeMcpUiPluginScopeShape, callId: nonEmptyString.max(128) })
  .strict();
export type KayingCodeMcpUiCancelCallParams = z.infer<typeof kayingcodeMcpUiCancelCallParamsSchema>;
export const kayingcodeMcpUiCancelCallResultSchema = z.object({ cancelled: z.boolean() }).strict();
export type KayingCodeMcpUiCancelCallResult = z.infer<typeof kayingcodeMcpUiCancelCallResultSchema>;
/** 页面发起的 resources/list、resources/templates/list、subscribe、unsubscribe 代理。 */
export const kayingcodeMcpUiListResourcesParamsSchema = z
  .object({ ...kayingcodeMcpUiPluginScopeShape, cursor: nonEmptyString.max(2048).optional() })
  .strict();
export type KayingCodeMcpUiListResourcesParams = z.infer<
  typeof kayingcodeMcpUiListResourcesParamsSchema
>;
const kayingcodeMcpUiResourceDescriptorSchema = z
  .object({
    uri: z.string(),
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    // MCP Resource 的标准字段；规范把资源级 csp / prefersBorder 放在这里，宿主读 HTML 项缺 _meta 时回退用。
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const kayingcodeMcpUiListResourcesResultSchema = z
  .object({
    resources: z.array(kayingcodeMcpUiResourceDescriptorSchema),
    nextCursor: z.string().optional(),
  })
  .strict();
export type KayingCodeMcpUiListResourcesResult = z.infer<
  typeof kayingcodeMcpUiListResourcesResultSchema
>;
export const kayingcodeMcpUiListResourceTemplatesResultSchema = z
  .object({
    resourceTemplates: z.array(
      z
        .object({
          uriTemplate: z.string(),
          name: z.string().optional(),
          title: z.string().optional(),
          description: z.string().optional(),
          mimeType: z.string().optional(),
        })
        .strict(),
    ),
    nextCursor: z.string().optional(),
  })
  .strict();
export type KayingCodeMcpUiListResourceTemplatesResult = z.infer<
  typeof kayingcodeMcpUiListResourceTemplatesResultSchema
>;
/** 订阅者身份 = 会话 + 沙箱作用域 + 实例代际（initId）；dispose 只退订本代际，新实例不受影响。 */
export const kayingcodeMcpUiResourceSubscriptionParamsSchema = z
  .object({
    ...kayingcodeMcpUiPluginScopeShape,
    scopeId: nonEmptyString.max(256),
    generation: z.number().int().nonnegative(),
    uri: nonEmptyString.max(2048),
  })
  .strict();
export type KayingCodeMcpUiResourceSubscriptionParams = z.infer<
  typeof kayingcodeMcpUiResourceSubscriptionParamsSchema
>;
export const kayingcodeMcpUiResourceSubscriptionResultSchema = z.object({}).strict();
/**
 * App-Provided Tools：实例身份 = 会话 + 沙箱作用域 + 代际（与资源订阅同一三元组）。
 * 登记按实例整体替换；调用认领 / 回传按 callId 幂等。
 */
const kayingcodeMcpUiAppToolInstanceShape = {
  ...kayingcodeMcpUiPluginScopeShape,
  scopeId: nonEmptyString.max(256),
  generation: z.number().int().nonnegative(),
};
export const kayingcodeMcpUiRegisterAppToolsParamsSchema = z
  .object({
    ...kayingcodeMcpUiAppToolInstanceShape,
    tools: z.array(mcpAppsAppToolDescriptorSchema).max(MCP_APPS_APP_TOOLS_MAX_PER_INSTANCE),
  })
  .strict();
export type KayingCodeMcpUiRegisterAppToolsParams = z.infer<
  typeof kayingcodeMcpUiRegisterAppToolsParamsSchema
>;
export const kayingcodeMcpUiRegisterAppToolsResultSchema = z
  .object({ tools: z.array(z.object({ name: z.string(), modelName: z.string() }).strict()) })
  .strict();
export type KayingCodeMcpUiRegisterAppToolsResult = z.infer<
  typeof kayingcodeMcpUiRegisterAppToolsResultSchema
>;
export const kayingcodeMcpUiUnregisterAppToolsParamsSchema = z
  .object(kayingcodeMcpUiAppToolInstanceShape)
  .strict();
export type KayingCodeMcpUiUnregisterAppToolsParams = z.infer<
  typeof kayingcodeMcpUiUnregisterAppToolsParamsSchema
>;
export const kayingcodeMcpUiUnregisterAppToolsResultSchema = z
  .object({ removed: z.number().int().nonnegative() })
  .strict();
export type KayingCodeMcpUiUnregisterAppToolsResult = z.infer<
  typeof kayingcodeMcpUiUnregisterAppToolsResultSchema
>;
export const kayingcodeMcpUiClaimAppToolCallParamsSchema = z
  .object({
    ...kayingcodeMcpUiAppToolInstanceShape,
    callId: nonEmptyString.max(MCP_APPS_APP_TOOL_CALL_ID_MAX_CHARS),
  })
  .strict();
export type KayingCodeMcpUiClaimAppToolCallParams = z.infer<
  typeof kayingcodeMcpUiClaimAppToolCallParamsSchema
>;
export const kayingcodeMcpUiAppToolAcceptedResultSchema = z
  .object({ accepted: z.boolean() })
  .strict();
export type KayingCodeMcpUiAppToolAcceptedResult = z.infer<
  typeof kayingcodeMcpUiAppToolAcceptedResultSchema
>;
export const kayingcodeMcpUiResolveAppToolCallParamsSchema = z
  .object({
    ...kayingcodeMcpUiAppToolInstanceShape,
    callId: nonEmptyString.max(MCP_APPS_APP_TOOL_CALL_ID_MAX_CHARS),
    result: mcpAppsAppToolCallResultSchema.optional(),
    error: z
      .object({ message: z.string().max(MCP_APPS_APP_TOOL_ERROR_MESSAGE_MAX_CHARS) })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => (value.result === undefined) !== (value.error === undefined), {
    message: "exactly one of result or error is required",
  });
export type KayingCodeMcpUiResolveAppToolCallParams = z.infer<
  typeof kayingcodeMcpUiResolveAppToolCallParamsSchema
>;
export const kayingcodeMcpUiCallToolResultSchema = z
  .object({
    content: z.array(z.record(z.string(), z.unknown())),
    structuredContent: z.unknown().optional(),
    isError: z.boolean().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type KayingCodeMcpUiCallToolResult = z.infer<typeof kayingcodeMcpUiCallToolResultSchema>;

export const kayingcodeSessionImportMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: timestampMsSchema.optional(),
  })
  .strict();
export type KayingCodeSessionImportMessage = z.infer<typeof kayingcodeSessionImportMessageSchema>;

export const kayingcodeSessionImportHistorySchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("claudeCode"),
      title: z.string().optional(),
      createdAt: timestampMsSchema.optional(),
      updatedAt: timestampMsSchema.optional(),
      messages: z.array(kayingcodeSessionImportMessageSchema).min(1),
    })
    .strict(),
  z
    .object({
      source: z.literal("sharedContext"),
      title: z.string().trim().min(1),
      createdAt: timestampMsSchema.optional(),
      markdown: z.string().min(1),
      provenance: z
        .object({
          shareId: z.string().trim().min(1),
          contextId: z.string().trim().min(1).optional(),
          shareUrl: z.string().url().optional(),
          status: z.enum(["pending", "reserved", "attached", "discarded"]).optional(),
          projectionSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          artifactSetSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          formatterVersion: z.literal(1),
          markdownSha256: z.string().regex(/^[0-9a-f]{64}$/u),
          installedArtifacts: z.array(
            z
              .object({
                artifactId: z.string().trim().min(1),
                workspaceRelativePath: z.string().trim().min(1),
              })
              .strict(),
          ),
        })
        .strict(),
    })
    .strict(),
]);
export type KayingCodeSessionImportHistory = z.infer<typeof kayingcodeSessionImportHistorySchema>;

export const kayingcodeThoughtLevelOptionSchema = z
  .object({
    value: nonEmptyString,
    label: nonEmptyString,
    description: z.string().optional(),
  })
  .strict();
export const kayingcodeModelReasoningOptionsSchema = z
  .object({
    levels: z.array(kayingcodeThoughtLevelOptionSchema),
    defaultLevel: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodeModelReasoningOptions = z.infer<typeof kayingcodeModelReasoningOptionsSchema>;

export const kayingcodeModelFormatPropertiesSchema = completeModelPropertiesDataSchema.pick({
  inputFormat: true,
  outputFormat: true,
});
export type KayingCodeModelFormatProperties = z.infer<typeof kayingcodeModelFormatPropertiesSchema>;

export const kayingcodeModelOptionSchema = z
  .object({
    ref: modelSelectionSchema,
    label: nonEmptyString,
    providerLabel: nonEmptyString.optional(),
    description: z.string().optional(),
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    reasoning: kayingcodeModelReasoningOptionsSchema.optional(),
    properties: kayingcodeModelFormatPropertiesSchema,
    disabledReason: z.string().optional(),
  })
  .strict();
export type KayingCodeModelOption = z.infer<typeof kayingcodeModelOptionSchema>;

export const kayingcodeAccountAccessSchema = z.discriminatedUnion("planKind", [
  z
    .object({
      type: z.literal("zhipu-account"),
      family: z.enum(["zai", "bigmodel"]),
      planKind: z.literal("start-plan"),
    })
    .strict(),
  z
    .object({
      type: z.literal("zhipu-account"),
      family: z.enum(["zai", "bigmodel"]),
      planKind: z.literal("individual-coding-plan"),
    })
    .strict(),
  z
    .object({
      type: z.literal("zhipu-account"),
      family: z.enum(["zai", "bigmodel"]),
      planKind: z.literal("team-coding-plan"),
      productId: nonEmptyString,
      organizationId: nonEmptyString,
      projectId: nonEmptyString,
    })
    .strict(),
]);
export type KayingCodeAccountAccess = z.infer<typeof kayingcodeAccountAccessSchema>;

/** Active Model 固定的账号访问类别；当前商品和 Team scope 由账号服务在请求期解析。 */
export const kayingcodeProviderAccountAccessSchema = z
  .object({
    type: z.literal("zhipu-account"),
    accountType: z.enum(["zai", "bigmodel"]),
    // `highspeed` 指加速卡这一账号访问类别（隐藏 Provider + 免签网关），与模型名
    // GLM-5.1-Highspeed 无关，仅字面重合。见 docs/highspeed/highspeed-access-mode-migration.md。
    mode: z.enum([
      "start-plan",
      "individual-coding-plan",
      "team-coding-plan",
      "off-peak",
      "highspeed",
    ]),
    entitled: z.boolean(),
  })
  .strict();
export type KayingCodeProviderAccountAccess = z.infer<typeof kayingcodeProviderAccountAccessSchema>;

export type KayingCodeSessionMode = z.infer<typeof kayingcodeSessionModeSchema>;
export type KayingCodeSessionKind = z.infer<typeof kayingcodeSessionKindSchema>;
export type KayingCodeSessionGoal = z.infer<typeof kayingcodeSessionGoalSchema>;

export const kayingcodeSessionTodoItemSchema = z
  .object({
    content: nonEmptyString,
    status: z.enum(["pending", "in_progress", "completed"]),
    priority: z.enum(["high", "medium", "low"]),
  })
  .strict();
export const kayingcodeSessionGoalStatsSchema = z
  .object({
    timeUsedSeconds: z.number().int().nonnegative(),
    tokensUsed: z.number().int().nonnegative(),
    tokenBudget: z.number().int().positive().nullable(),
    contextUsed: z.number().int().nonnegative(),
    contextWindow: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
    iterationCount: z.number().int().nonnegative(),
  })
  .strict();
export type KayingCodeSessionGoalStats = z.infer<typeof kayingcodeSessionGoalStatsSchema>;
export type KayingCodeSessionGoalVerification = z.infer<
  typeof kayingcodeSessionGoalVerificationSchema
>;
export type KayingCodeSessionGoalVerificationTimeline = z.infer<
  typeof kayingcodeSessionGoalVerificationTimelineSchema
>;

export const kayingcodeSessionTodoGroupSchema = z
  .object({
    id: nonEmptyString,
    source: z.enum(["goal_iteration", "session"]),
    goalIteration: z.number().int().positive().optional(),
    targetId: nonEmptyString.optional(),
    startedAt: timestampMsSchema.optional(),
    updatedAt: timestampMsSchema.optional(),
    todos: z.array(kayingcodeSessionTodoItemSchema),
  })
  .strict();
export type KayingCodeSessionTodoGroup = z.infer<typeof kayingcodeSessionTodoGroupSchema>;

export const kayingcodeSessionSettingsStateSchema = z
  .object({
    model: z
      .object({
        // 未绑定是合法恢复状态；不能为满足协议而伪造模型或阻断历史读取。
        current: modelSelectionSchema.optional(),
        available: z.array(kayingcodeModelOptionSchema),
        lastUsed: modelSelectionSchema.optional(),
      })
      .strict(),
    thoughtLevel: z
      .object({
        enabled: z.boolean(),
        current: nonEmptyString.optional(),
        defaultLevel: nonEmptyString.optional(),
        available: z.array(kayingcodeThoughtLevelOptionSchema),
      })
      .strict(),
    mode: z
      .object({
        current: kayingcodeSessionModeSchema,
      })
      .strict(),
    permission: z
      .object({
        mode: kayingcodeSessionModeSchema.optional(),
        rulesRevision: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodeSessionSettingsState = z.infer<typeof kayingcodeSessionSettingsStateSchema>;
export const kayingcodePendingPermissionSchema = z
  .object({
    requestId: nonEmptyString,
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    reason: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    input: z.unknown().optional(),
    origin: kayingcodeInteractionRequestOriginSchema.optional(),
    options: z.array(kayingcodePermissionOptionSchema).min(1),
    requestedAt: timestampMsSchema,
  })
  .strict();
export type KayingCodePendingPermission = z.infer<typeof kayingcodePendingPermissionSchema>;

export const kayingcodeActiveToolCallSchema = z
  .object({
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    status: z.enum(["pending", "running", "completed", "failed", "denied"]),
    startedAt: timestampMsSchema.optional(),
  })
  .strict();
export type KayingCodeActiveToolCall = z.infer<typeof kayingcodeActiveToolCallSchema>;

export const kayingcodeSessionProjectionSchema = z
  .object({
    sessionId: nonEmptyString,
    status: kayingcodeSessionStatusSchema,
    mode: kayingcodeSessionModeSchema,
    turnCount: z.number().int().nonnegative(),
    totalTokenCount: z.number().int().nonnegative(),
    contextUsed: z.number().int().nonnegative(),
    contextWindow: z.number().int().nonnegative(),
    currentTurnId: nonEmptyString.optional(),
    pendingPermissions: z.array(kayingcodePendingPermissionSchema),
    activeToolCalls: z.array(kayingcodeActiveToolCallSchema),
    backgroundJobs: z.array(jsonObjectSchema),
    target: kayingcodeSessionGoalSchema.nullable().optional(),
    lastError: z
      .object({
        type: nonEmptyString,
        code: nonEmptyString.optional(),
        message: nonEmptyString,
        detail: z.string().optional(),
        attribution: errorAttributionSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodeSessionProjection = z.infer<typeof kayingcodeSessionProjectionSchema>;
export type KayingCodeToolState = z.infer<typeof kayingcodeToolStateSchema>;
export const kayingcodeSlashCommandSchema = z
  .object({
    name: nonEmptyString,
    description: z.string(),
    inputHint: z.string().optional(),
    source: z.enum(["builtin", "custom"]).optional(),
  })
  .strict();
export type KayingCodeSessionApiRetryStatus = z.infer<typeof kayingcodeSessionApiRetryStatusSchema>;
export type KayingCodeSessionContextUsage = z.infer<typeof kayingcodeSessionContextUsageSchema>;
export const kayingcodeModelStreamingKindSchema = z.enum([
  "start",
  "finish",
  "error",
  "text_start",
  "text_delta",
  "text_end",
  "reasoning_start",
  "reasoning_delta",
  "reasoning_end",
  "tool_input_start",
  "tool_input_delta",
  "tool_input_end",
  "tool_call",
]);
export const kayingcodeModelStreamingEventPayloadSchema = z
  .object({
    assistantMessageId: z.string().optional(),
    delta: z.string().optional(),
    done: z.boolean().optional(),
    input: z.unknown().optional(),
    kind: kayingcodeModelStreamingKindSchema,
    partId: z.string().optional(),
    providerExecuted: z.boolean().optional(),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
  })
  .strict();
export const kayingcodeSessionStateSnapshotSchema = z
  .object({
    protocol: z
      .object({
        name: z.literal(KAYINGCODE_PROTOCOL_NAME),
        version: z.literal(KAYINGCODE_PROTOCOL_VERSION),
      })
      .strict(),
    session: kayingcodeSessionInfoSchema,
    settings: kayingcodeSessionSettingsStateSchema,
    projection: kayingcodeSessionProjectionSchema,
    runtime: kayingcodeSessionRuntimeStateSchema,
    messages: z.array(kayingcodeMessageWithPartsSchema),
    goalStats: kayingcodeSessionGoalStatsSchema.optional(),
    todos: z.array(kayingcodeSessionTodoItemSchema).optional(),
    todoGroups: z.array(kayingcodeSessionTodoGroupSchema).optional(),
    slashCommands: z.array(kayingcodeSlashCommandSchema).optional(),
  })
  .strict();
export type KayingCodeSessionStateSnapshot = z.infer<typeof kayingcodeSessionStateSnapshotSchema>;

export const kayingcodeEventEnvelopeSchema = z
  .object({
    eventId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    seq: z.number().int().nonnegative(),
    traceId: nonEmptyString.optional(),
    timestamp: timestampMsSchema,
    deliveryKind: kayingcodeDeliveryKindSchema.optional(),
  })
  .strict();

const kayingcodeComputerUseOperationEventBaseSchema = z
  .object({
    eventId: nonEmptyString,
    sequenceNumber: z.number().int().nonnegative(),
    sessionId: nonEmptyString,
    timestamp: timestampMsSchema,
  })
  .strict();

const kayingcodeComputerUseTurnStartedEventSchema =
  kayingcodeComputerUseOperationEventBaseSchema.extend({
    kind: z.literal("turn-started"),
    turnId: nonEmptyString,
  });
const kayingcodeComputerUseTurnCompletedEventSchema =
  kayingcodeComputerUseOperationEventBaseSchema.extend({
    kind: z.literal("turn-completed"),
    turnId: nonEmptyString,
  });
const kayingcodeComputerUseTurnFailedEventSchema =
  kayingcodeComputerUseOperationEventBaseSchema.extend({
    kind: z.literal("turn-failed"),
    turnId: nonEmptyString,
  });
const kayingcodeComputerUseToolScheduledEventSchema =
  kayingcodeComputerUseOperationEventBaseSchema.extend({
    kind: z.literal("tool-scheduled"),
    turnId: nonEmptyString,
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    // 这个 cell 是否在用 Computer Use。只表达布尔事实，不再携带动作名——旧的
    // operationAction 靠从模型源码里抽取动作名得到，SDK 面一变就整体失配（见
    // bootstrap/src/kayingcode-protocol/computer-use-operation-event.ts 的 usesComputerUse）。
    // 只挂在 scheduled 上：ToolCallStartedPayload 没有 input，start 时已拿不到模型源码。
    computerUse: z.literal(true).optional(),
  });
const kayingcodeComputerUseToolStartedEventSchema =
  kayingcodeComputerUseOperationEventBaseSchema.extend({
    kind: z.literal("tool-started"),
    turnId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString.optional(),
  });
const kayingcodeComputerUseSessionClosedEventSchema =
  kayingcodeComputerUseOperationEventBaseSchema.extend({
    kind: z.literal("session-closed"),
  });

export const kayingcodeComputerUseOperationEventSchema = z.discriminatedUnion("kind", [
  kayingcodeComputerUseTurnStartedEventSchema,
  kayingcodeComputerUseTurnCompletedEventSchema,
  kayingcodeComputerUseTurnFailedEventSchema,
  kayingcodeComputerUseToolScheduledEventSchema,
  kayingcodeComputerUseToolStartedEventSchema,
  kayingcodeComputerUseSessionClosedEventSchema,
]);
export type KayingCodeComputerUseOperationEvent = z.infer<
  typeof kayingcodeComputerUseOperationEventSchema
>;

export const kayingcodeSessionEventTypeSchema = z.enum([
  "session.created",
  "session.resumed",
  "session.updated",
  "session.titleUpdated",
  "session.closed",
  "turn.started",
  "turn.steerQueued",
  "turn.steerDrained",
  "turn.completed",
  "turn.failed",
  "message.upserted",
  "message.removed",
  "part.started",
  "part.delta",
  "part.upserted",
  "part.removed",
  "model.streaming",
  "tool.updated",
  "permission.requested",
  "permission.resolved",
  "userInput.requested",
  "userInput.resolved",
  "checkpoint.created",
  "rewind.triggered",
  "streamRecovery.updated",
]);
export type KayingCodeSessionEventType = z.infer<typeof kayingcodeSessionEventTypeSchema>;

export const kayingcodeProtocolErrorDetailSchema = z
  .object({
    type: nonEmptyString,
    message: nonEmptyString,
    stack: z.string().optional(),
    code: z.string().optional(),
    detail: z.string().optional(),
    underlyingErrorMessage: z.string().optional(),
    underlyingErrorDetail: z.string().optional(),
    attribution: errorAttributionSchema.optional(),
    retryable: z.boolean().optional(),
    data: z.unknown().optional(),
  })
  .strict();
export const kayingcodeSessionCreatedEventPayloadSchema = z
  .object({
    mode: kayingcodeSessionModeSchema,
    contextWindow: z.number().int().nonnegative(),
  })
  .strict();
export const kayingcodeSessionResumedEventPayloadSchema = z
  .object({
    directory: nonEmptyString,
    interruptedToolCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
    partCount: z.number().int().nonnegative(),
    recoveredCompactTimelineCount: z.number().int().nonnegative().optional(),
    recoveredSteerInputCount: z.number().int().nonnegative().optional(),
    resumedTodoCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export const kayingcodeSessionTitleUpdatedEventPayloadSchema = z
  .object({
    messageID: nonEmptyString.optional(),
    previousTitle: z.string(),
    source: z.enum(["default", "first_input", "generated", "custom"]),
    title: z.string(),
  })
  .strict();
export const kayingcodeTurnStartedEventPayloadSchema = z
  .object({
    // CLI 的高精度执行时间可含小数；漏声明会使 strict 校验丢弃整条开始事件，Bot 因此无法清空上一轮回复。
    executionStartedAt: z.number().nonnegative().optional(),
    turnNumber: z.number().int().nonnegative(),
    input: z.string(),
    inputId: nonEmptyString.optional(),
    queryId: nonEmptyString.optional(),
    // Bugfix：CLI 会把 Host 准入的后台执行归因写入 turn.started。这里漏声明时，
    // strict 校验会丢弃整条开始事件，复用中的 Bot 私聊订阅就无法切换到新轮次。
    automationId: nonEmptyString.optional(),
    offPeakTaskId: nonEmptyString.optional(),
    offPeakRunType: z.enum(["init", "resume"]).optional(),
    inputSource: kayingcodeTurnInputSourceSchema.optional(),
    inputVisibility: kayingcodeMessageVisibilitySchema.optional(),
    executionKind: z.enum(["agent", "controlOnly"]).optional(),
    targetId: nonEmptyString.optional(),
    messageId: nonEmptyString.optional(),
    foregroundExecutionId: nonEmptyString.optional(),
    intent: jsonObjectSchema.optional(),
    originMeta: jsonObjectSchema.optional(),
    // runtime 会透传后台唤醒来源，strict schema 必须同步声明以免丢弃整条事件。
    backgroundSource: z.enum(["bash", "subagent"]).optional(),
    attachments: z.array(jsonObjectSchema).optional(),
  })
  .strict();
const kayingcodeTurnSteerSourceSchema = z.enum([
  "plan_approval_feedback",
  "workflow_refine_feedback",
]);
const kayingcodeTurnSteerCommandKindSchema = z.enum(["sendText", "sendGoalCommand", "compact"]);
const kayingcodeTurnSteerDeliverySchema = z.enum(["queue", "guide"]);

export const kayingcodeTurnSteerQueuedEventPayloadSchema = z
  .object({
    pendingInputId: nonEmptyString,
    inputId: nonEmptyString.optional(),
    queryId: nonEmptyString.optional(),
    input: z.string(),
    inputPreview: z.string(),
    inputSize: z.number().int().nonnegative(),
    commandKind: kayingcodeTurnSteerCommandKindSchema.optional(),
    source: kayingcodeTurnSteerSourceSchema.optional(),
    toolDisallowlist: z.array(nonEmptyString).optional(),
    delivery: kayingcodeTurnSteerDeliverySchema.optional(),
    targetTurnId: nonEmptyString,
    queueLength: z.number().int().nonnegative(),
    intent: jsonObjectSchema.optional(),
  })
  .strict();
export const kayingcodeTurnSteerDrainedEventPayloadSchema = z
  .object({
    pendingInputIds: z.array(nonEmptyString),
    queryIds: z.array(nonEmptyString).optional(),
    targetTurnId: nonEmptyString,
    injectedMessageIds: z.array(nonEmptyString),
    drainedInputs: z
      .array(
        z
          .object({
            pendingInputId: nonEmptyString,
            messageId: nonEmptyString,
            text: z.string(),
            delivery: kayingcodeTurnSteerDeliverySchema.optional(),
            intent: jsonObjectSchema.optional(),
            toolDisallowlist: z.array(nonEmptyString).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export const kayingcodeTurnCompletedEventPayloadSchema = z
  .object({
    response: z.string(),
    tokenCount: z.number().int().nonnegative(),
    usage: z.unknown().optional(),
    toolCallCount: z.number().int().nonnegative(),
    historyRoundCount: z.number().int().nonnegative().optional(),
    duration: z.number().nonnegative(),
    // runtime turn.completed 会附带 cacheStats，协议 schema 之前漏掉该字段。
    // strict 校验失败会让桌面端丢掉终态事件，表现为消息已完成但 UI 一直没有回复。
    cacheStats: z
      .object({
        totalMessages: z.number().int().nonnegative(),
        cachedMessages: z.number().int().nonnegative(),
        lastCacheHit: z.boolean(),
        cacheReadTokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    inputId: nonEmptyString.optional(),
    resultType: z.enum([
      "success",
      // "cancelled": 用户主动中断属于正常结束，复用 turn.completed 上报，避免被映射成 turn.failed。
      "cancelled",
      "error_max_turns",
      "error_max_budget",
      "error_during_execution",
      "error_max_tool_calls",
    ]),
    backgroundSubagentResultConsumed: z.boolean().optional(),
  })
  .strict();
export const kayingcodeTurnFailedEventPayloadSchema = z
  .object({
    error: kayingcodeProtocolErrorDetailSchema,
    turnPhase: z.string(),
    inputId: nonEmptyString.optional(),
    backgroundSubagentResultConsumed: z.boolean().optional(),
  })
  .strict();
export const kayingcodeMessageUpsertedEventPayloadSchema = z
  .object({
    content: z.string(),
    attachments: z.array(z.unknown()).optional(),
    toolCalls: z.array(z.unknown()).optional(),
    type: z.string().optional(),
    compactBoundary: z.unknown().optional(),
  })
  .strict();
export const kayingcodeMessageRemovedEventPayloadSchema = z
  .object({
    messageId: nonEmptyString,
    reason: z.string().optional(),
  })
  .strict();
export const kayingcodeMessagePartDeltaEventPayloadSchema = z
  .object({
    messageId: nonEmptyString,
    partId: nonEmptyString,
    field: z.enum(["text", "reasoning", "input", "output"]).optional(),
    delta: z.string(),
  })
  .strict();
export const kayingcodeMessagePartUpsertedEventPayloadSchema = z
  .object({
    part: kayingcodeMessagePartSchema,
  })
  .strict();
export const kayingcodeMessagePartRemovedEventPayloadSchema = z
  .object({
    messageId: nonEmptyString,
    partId: nonEmptyString,
    reason: z.string().optional(),
  })
  .strict();
const kayingcodeToolCallBasePayloadSchema = z
  .object({
    toolCallId: nonEmptyString,
    toolName: z.string().optional(),
    parentToolCallId: nonEmptyString.optional(),
    source: z.enum(["subagent"]).optional(),
    agentId: nonEmptyString.optional(),
    agentType: nonEmptyString.optional(),
    // subagent mirror 会携带后台归因；strict schema 漏字段会让 session/event 整条被丢弃。
    background: z.boolean().optional(),
    childSessionId: nonEmptyString.optional(),
    childToolCallId: nonEmptyString.optional(),
    description: z.string().optional(),
  })
  .strict();

export const kayingcodeToolUpdatedEventPayloadSchema = z.discriminatedUnion("kind", [
  kayingcodeToolCallBasePayloadSchema
    .extend({
      kind: z.literal("scheduled"),
      // 修复：CLI 调度事件已携带所属消息 ID；漏声明会让严格校验丢弃整条事件。
      assistantMessageId: nonEmptyString.optional(),
      toolName: nonEmptyString,
      input: z.unknown().optional(),
      inputByteLength: z.number().int().nonnegative().optional(),
      inputOmitted: z.boolean().optional(),
      inputRef: z.literal("model_stream").optional(),
      dependencies: z.array(nonEmptyString).optional(),
      parallelGroupIndex: z.number().int().nonnegative().optional(),
      canRunParallel: z.boolean().optional(),
      schedule: jsonObjectSchema.optional(),
    })
    .strict(),
  kayingcodeToolCallBasePayloadSchema
    .extend({
      kind: z.literal("started"),
      startedAt: protocolInstantSchema,
    })
    .strict(),
  kayingcodeToolCallBasePayloadSchema
    .extend({
      kind: z.literal("progress"),
      elapsedMs: z.number().nonnegative().optional(),
      pid: z.number().int().optional(),
      stdoutBytes: z.number().int().nonnegative().optional(),
      stderrBytes: z.number().int().nonnegative().optional(),
      outputBytes: z.number().int().nonnegative().optional(),
      outputPreview: executionOutputPreviewSchema.optional(),
      stdoutTail: z.string().optional(),
      stderrTail: z.string().optional(),
    })
    .strict(),
  kayingcodeToolCallBasePayloadSchema
    .extend({
      kind: z.literal("result"),
      result: kayingcodeToolResultObjectSchema,
      duration: z.number().nonnegative(),
    })
    .strict(),
  kayingcodeToolCallBasePayloadSchema
    .extend({
      kind: z.literal("error"),
      error: kayingcodeProtocolErrorDetailSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("batch"),
      toolCallIds: z.array(nonEmptyString),
      successCount: z.number().int().nonnegative(),
      errorCount: z.number().int().nonnegative(),
    })
    .strict(),
  kayingcodeToolCallBasePayloadSchema
    .extend({
      kind: z.literal("raw"),
      payload: jsonObjectSchema,
    })
    .strict(),
]);
export const kayingcodePermissionRequestedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    reason: z.string(),
    input: z.unknown(),
    suggestedPermissionUpdates: z.array(kayingcodePermissionUpdateSchema).optional(),
    approvalMode: z.literal("user-once").optional(),
    origin: kayingcodeInteractionRequestOriginSchema.optional(),
    options: z.array(kayingcodePermissionOptionSchema).min(1),
    childSessionId: nonEmptyString.optional(),
    background: z.boolean().optional(),
  })
  .strict();
export const kayingcodePermissionResolvedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString.optional(),
    decision: kayingcodePermissionDecisionSchema.optional(),
    reason: z.string().optional(),
    modifiedInput: z.unknown().optional(),
    inputSummary: z.unknown().optional(),
    childSessionId: nonEmptyString.optional(),
    background: z.boolean().optional(),
  })
  .strict();
export const kayingcodeUserInputRequestedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString,
    prompt: z.string(),
    inputType: z.enum(["text", "choice", "confirm"]).optional(),
    choices: z.array(z.string()).optional(),
  })
  .strict();
export const kayingcodeUserInputResolvedEventPayloadSchema = z
  .object({
    requestId: nonEmptyString,
    value: z.unknown().optional(),
    cancelled: z.boolean().optional(),
  })
  .strict();
export const kayingcodeSessionClosedEventPayloadSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

function kayingcodeSessionEventEnvelopeFor<T extends KayingCodeSessionEventType>(
  type: T,
  payload: z.ZodTypeAny,
) {
  return kayingcodeEventEnvelopeSchema.extend({
    type: z.literal(type),
    payload: payload.optional(),
  });
}

export const kayingcodeSessionEventSchema = z.discriminatedUnion("type", [
  kayingcodeSessionEventEnvelopeFor("session.created", kayingcodeSessionCreatedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor("session.resumed", kayingcodeSessionResumedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor("session.updated", jsonObjectSchema),
  kayingcodeSessionEventEnvelopeFor(
    "session.titleUpdated",
    kayingcodeSessionTitleUpdatedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor("session.closed", kayingcodeSessionClosedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor("turn.started", kayingcodeTurnStartedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor(
    "turn.steerQueued",
    kayingcodeTurnSteerQueuedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor(
    "turn.steerDrained",
    kayingcodeTurnSteerDrainedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor("turn.completed", kayingcodeTurnCompletedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor("turn.failed", kayingcodeTurnFailedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor(
    "message.upserted",
    kayingcodeMessageUpsertedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor("message.removed", kayingcodeMessageRemovedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor(
    "part.started",
    kayingcodeMessagePartUpsertedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor("part.delta", kayingcodeMessagePartDeltaEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor(
    "part.upserted",
    kayingcodeMessagePartUpsertedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor("part.removed", kayingcodeMessagePartRemovedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor("model.streaming", kayingcodeModelStreamingEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor("tool.updated", kayingcodeToolUpdatedEventPayloadSchema),
  kayingcodeSessionEventEnvelopeFor(
    "permission.requested",
    kayingcodePermissionRequestedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor(
    "permission.resolved",
    kayingcodePermissionResolvedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor(
    "userInput.requested",
    kayingcodeUserInputRequestedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor(
    "userInput.resolved",
    kayingcodeUserInputResolvedEventPayloadSchema,
  ),
  kayingcodeSessionEventEnvelopeFor("checkpoint.created", jsonObjectSchema),
  kayingcodeSessionEventEnvelopeFor("rewind.triggered", jsonObjectSchema),
  kayingcodeSessionEventEnvelopeFor("streamRecovery.updated", jsonObjectSchema),
]);
export type KayingCodeSessionEvent = z.infer<typeof kayingcodeSessionEventSchema>;

export const kayingcodeSessionEventsResultSchema = z
  .object({
    events: z.array(kayingcodeSessionEventSchema),
  })
  .strict();
export const kayingcodeSessionMessagesResultSchema = z
  .object({
    messages: z.array(kayingcodeMessageWithPartsSchema),
  })
  .strict();
export const kayingcodeStateUpdatedNotificationSchema = z
  .object({
    type: z.literal("state.updated"),
    scope: z.enum(["server", "workspace", "session"]),
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    sessionId: nonEmptyString.optional(),
    revision: z.number().int().nonnegative(),
    reason: z.string().optional(),
    patch: z.unknown(),
  })
  .strict();
export type KayingCodeStateUpdatedNotification = z.infer<
  typeof kayingcodeStateUpdatedNotificationSchema
>;

export const kayingcodeSessionSubscribeParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    deliveryKind: kayingcodeDeliveryKindSchema,
    afterSeq: z.number().int().nonnegative().optional(),
    includeSnapshot: z.boolean().default(false),
  })
  .strict();
export type KayingCodeSessionSubscribeParams = z.infer<
  typeof kayingcodeSessionSubscribeParamsSchema
>;

export const kayingcodeSessionSubscribeResultSchema = z
  .object({
    sessionId: nonEmptyString,
    eventSeq: z.number().int().nonnegative(),
    events: z.array(kayingcodeSessionEventSchema),
    snapshot: kayingcodeSessionStateSnapshotSchema.optional(),
  })
  .strict();
export const kayingcodeSessionListResultSchema = z
  .object({
    sessions: z.array(kayingcodeSessionInfoSchema),
  })
  .strict();

const kayingcodeSessionSubagentBaseSchema = z
  .object({
    childSessionId: nonEmptyString,
    agentId: nonEmptyString.optional(),
    toolCallId: nonEmptyString.optional(),
    subagentType: nonEmptyString,
    title: nonEmptyString,
    summary: z.string().optional(),
    startedAt: z.number().int().nonnegative().optional(),
    endedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export const kayingcodeSessionRunningSubagentSchema = kayingcodeSessionSubagentBaseSchema.extend({
  status: z.enum(["running", "waiting", "blocked"]),
});
export type KayingCodeSessionRunningSubagent = z.infer<
  typeof kayingcodeSessionRunningSubagentSchema
>;

export const kayingcodeSessionEndedSubagentSchema = kayingcodeSessionSubagentBaseSchema.extend({
  status: z.enum(["success", "failed", "cancelled", "lost"]),
});
export type KayingCodeSessionEndedSubagent = z.infer<typeof kayingcodeSessionEndedSubagentSchema>;

export const kayingcodeSessionSubagentsResultSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    childSessionIds: z.array(nonEmptyString),
    running: z.array(kayingcodeSessionRunningSubagentSchema),
    ended: z
      .object({
        total: z.number().int().nonnegative(),
        items: z.array(kayingcodeSessionEndedSubagentSchema),
        nextCursor: nonEmptyString.optional(),
      })
      .strict(),
  })
  .strict();
export type KayingCodeSessionSubagentsResult = z.infer<
  typeof kayingcodeSessionSubagentsResultSchema
>;
/** 服务端 feature key 的取值域在协议里的 zod 形态。 */
export const kayingcodeDynamicWorkflowModeSchema = z.enum(DYNAMIC_WORKFLOW_MODES);
export const kayingcodeSessionCreateParamsSchema = z
  .object({
    additionalDirectories: z.array(nonEmptyString).max(256).optional(),
    sessionId: nonEmptyString.optional(),
    workspace: kayingcodeWorkspaceRefSchema,
    parentSessionId: nonEmptyString.optional(),
    mode: kayingcodeSessionModeSchema.optional(),
    model: modelSelectionSchema.optional(),
    persistence: kayingcodeSessionPersistenceSchema.optional(),
    thoughtLevel: nonEmptyString.optional(),
    titleGenerationEnabled: z.boolean().optional(),
    mcpServers: z.array(kayingcodeProtocolMcpServerSchema).optional(),
    toolAllowlist: z.array(nonEmptyString).optional(),
    toolDenylist: z.array(nonEmptyString).optional(),
    importedHistory: kayingcodeSessionImportHistorySchema.optional(),
    // host 只按本地服务装配/远程/端形态决定是否注册工具，不读取灰度；
    // 缺省不下发 = 不注册；灰度与套餐准入在实际创建的 Host handler 校验。
    offPeakToolEnabled: z.boolean().optional(),
    // 动态工作流灰度：与 offPeakToolEnabled 同一
    // 模式——host 裁决后下发，缺省不下发 = 不注册工作流工具簇（fail-closed）。
    dynamicWorkflowEnabled: z.boolean().optional(),
    // 灰度 mode 随布尔同行下发（launch.md「On demand: activation」）：`onDemand` 让 CLI 把十个
    // 工具推迟到会话首次 `/workflow` 才注册；缺席 = 按布尔行事（alwaysOn），供旧 Host 配对。
    dynamicWorkflowMode: kayingcodeDynamicWorkflowModeSchema.optional(),
  })
  .strict();
export type KayingCodeSessionCreateParams = z.infer<typeof kayingcodeSessionCreateParamsSchema>;

export const kayingcodeSessionResumeParamsSchema = z
  .object({
    additionalDirectories: z.array(nonEmptyString).max(256).optional(),
    sessionId: nonEmptyString,
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    // 旧 session 尚无 runtime/model_selection entry 时，由同 task 的索引元数据提供迁移 hint。
    thoughtLevel: nonEmptyString.optional(),
    mcpServers: z.array(kayingcodeProtocolMcpServerSchema).optional(),
    // 冷恢复重建 runtime 时必须沿用 create 的工具面约束（否则会绕过 allow/deny，尤其 CUA 会话）。
    toolAllowlist: z.array(nonEmptyString).optional(),
    toolDenylist: z.array(nonEmptyString).optional(),
    // 与 create 同语义；resume 不带会导致冷恢复丢 Off-Peak 工具面。
    offPeakToolEnabled: z.boolean().optional(),
    // 与 create 同语义；resume 不带会导致冷恢复丢工作流工具簇。
    dynamicWorkflowEnabled: z.boolean().optional(),
    dynamicWorkflowMode: kayingcodeDynamicWorkflowModeSchema.optional(),
  })
  .strict();
export type KayingCodeSessionResumeParams = z.infer<typeof kayingcodeSessionResumeParamsSchema>;

export const kayingcodeSessionListParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    sessionIds: z.array(nonEmptyString).min(1).max(64).optional(),
    limit: z.number().int().positive().optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();
export type KayingCodeSessionListParams = z.infer<typeof kayingcodeSessionListParamsSchema>;

export const kayingcodeSessionSubagentsParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    endedCursor: nonEmptyString.optional(),
    endedLimit: z.number().int().positive().max(100).default(20),
  })
  .strict();
export type KayingCodeSessionSubagentsParams = z.infer<
  typeof kayingcodeSessionSubagentsParamsSchema
>;

export const kayingcodeUsageStatsParamsSchema = z
  .object({
    range: z.enum(APP_USAGE_RANGES),
    timeZone: z.string().optional(),
  })
  .strict();
export const kayingcodeUsageStatsResultSchema = appUsageSnapshotSchema;
export const kayingcodeTaskTokenUsageParamsSchema = z
  .object({
    sessionId: nonEmptyString,
  })
  .strict();
export const kayingcodeTaskTokenUsageResultSchema = z
  .object({
    sessionId: nonEmptyString,
    totalTokens: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    cacheCreationTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    modelRequestCount: z.number().int().nonnegative(),
    modelErrorCount: z.number().int().nonnegative(),
    inputBaselineBySource: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();
export type KayingCodeTaskTokenUsageResult = z.infer<typeof kayingcodeTaskTokenUsageResultSchema>;

export const kayingcodeSessionReadParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    deliveryKind: kayingcodeDeliveryKindSchema.optional(),
    messageLimit: z.number().int().positive().optional(),
    afterSeq: z.number().int().nonnegative().optional(),
    // "index"：仅 task index resync 使用，返回剥离 tool/reasoning/data URL 大载荷的同结构 snapshot，
    // 结果禁止回写 UI 状态；缺省等同 "full"。
    contentProfile: z.enum(["full", "index"]).optional(),
  })
  .strict();
export type KayingCodeSessionReadParams = z.infer<typeof kayingcodeSessionReadParamsSchema>;

export const kayingcodeSessionMessagesParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    afterMessageId: nonEmptyString.optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type KayingCodeSessionMessagesParams = z.infer<typeof kayingcodeSessionMessagesParamsSchema>;

export const kayingcodeSessionEventsParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    afterSeq: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();
export type KayingCodeSessionEventsParams = z.infer<typeof kayingcodeSessionEventsParamsSchema>;

export const kayingcodeSessionRuntimePreferencesScopeSchema = z.enum([
  "runtime-materialization",
  "user-execution",
]);
export type KayingCodeSessionRuntimePreferencesScope = z.infer<
  typeof kayingcodeSessionRuntimePreferencesScopeSchema
>;

// subagents/readRuntimeConfig 返回 Host 已解析的完整快照或显式内置回退，不再传 Markdown。
export {
  subagentRuntimeConfigSchema,
  type SubagentRuntimeConfig,
} from "../subagent-runtime-config.js";
export const kayingcodeSubagentsReadRuntimeConfigParamsSchema = z
  .object({ sessionId: nonEmptyString, workspace: kayingcodeWorkspaceRefSchema.optional() })
  .strict();

export const KAYINGCODE_SESSION_RUNTIME_PREFERENCES_REQUEST_TIMEOUT_MS = 15_000;

export const kayingcodeSessionRequestRuntimePreferencesParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    scope: kayingcodeSessionRuntimePreferencesScopeSchema,
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    // CLI 依据持久化父链给出目录来源；目标 sessionId 仍保留 child 身份。
    directorySessionId: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodeSessionRequestRuntimePreferencesParams = z.infer<
  typeof kayingcodeSessionRequestRuntimePreferencesParamsSchema
>;

export const DEFAULT_KAYINGCODE_MODEL_CONTEXT_BUDGET_STRATEGY = "preflight-v1" as const;

// 3.12.2：legacy 仅为旧协议接收兼容；Runtime 一律归一为上面的共享默认策略。
export const kayingcodeModelContextBudgetStrategySchema = z.enum(["legacy", "preflight-v1"]);
export type KayingCodeModelContextBudgetStrategy = z.infer<
  typeof kayingcodeModelContextBudgetStrategySchema
>;

export const kayingcodeSessionRuntimePreferencesResultSchema = z
  .object({
    additionalDirectories: z.array(nonEmptyString).max(256).optional(),
    nativeSearchEnhancementsEnabled: z.boolean(),
    toolSearchMode: appToolSearchModeSchema.default("off"),
    subagentRuntimeConfigEnabled: z.boolean().optional(),
    memoryEnabled: z.boolean().default(false),
    askUserQuestionAutoResolutionEnabled: z.boolean().default(true),
    integratedTerminalShell: integratedTerminalShellSelectionSchema.optional(),
    // 兼容旧 Host：缺少字段时在协议解析边界使用当前默认策略。
    modelContextBudgetStrategy: kayingcodeModelContextBudgetStrategySchema.default(
      DEFAULT_KAYINGCODE_MODEL_CONTEXT_BUDGET_STRATEGY,
    ),
  })
  .strict();
export type KayingCodeSessionRuntimePreferencesResult = z.infer<
  typeof kayingcodeSessionRuntimePreferencesResultSchema
>;

/**
 * App 在提交 prompt 前只读采集的 IAB 可见状态。该字段只用于 provider-visible
 * ambient context，不进入用户可见 transcript；内容有界，禁止携带页面正文或凭据。
 */
export const kayingcodeBrowserAmbientContextSchema = z
  .object({
    tabCount: z.number().int().positive().max(100),
    currentUrl: z.string().trim().min(1).max(4096).optional(),
  })
  .strict();
export type KayingCodeBrowserAmbientContext = z.infer<typeof kayingcodeBrowserAmbientContextSchema>;

export const kayingcodeSessionSendParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    modelSelection: modelSelectionSchema.optional(),
    modelExecution: modelExecutionSchema.optional(),
    inputId: nonEmptyString.optional(),
    queryId: nonEmptyString.optional(),
    content: z.string(),
    attachments: z.array(jsonObjectSchema).optional(),
    browserAmbientContext: kayingcodeBrowserAmbientContextSchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    expectedProviderRevision: nonEmptyString.optional(),
    automationId: nonEmptyString.optional(),
    offPeakTaskId: nonEmptyString.optional(),
    offPeakRunType: z.enum(["init", "resume"]).optional(),
    botDeliveryTarget: kayingcodeAutomationBotDeliveryTargetSchema.optional(),
    toolDenylist: z.array(nonEmptyString).optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.automationId && payload.offPeakTaskId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "automationId and offPeakTaskId are mutually exclusive",
      });
    }
    if (payload.offPeakRunType && !payload.offPeakTaskId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "offPeakRunType requires offPeakTaskId",
        path: ["offPeakRunType"],
      });
    }
    if (payload.modelExecution && !payload.modelSelection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "modelExecution requires modelSelection",
        path: ["modelExecution"],
      });
    }
  });
export const kayingcodeSessionSendResultSchema = z
  .object({
    sessionId: nonEmptyString,
    accepted: z.literal(true),
    stateRevision: z.number().int().nonnegative(),
  })
  .strict();
export type KayingCodeSessionSendResult = z.infer<typeof kayingcodeSessionSendResultSchema>;

export const kayingcodeSessionHistoryTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("turn"),
      turnIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("message"),
      messageId: nonEmptyString,
    })
    .strict(),
  z
    .object({
      kind: z.literal("checkpoint"),
      checkpointId: nonEmptyString,
    })
    .strict(),
  z
    .object({
      kind: z.literal("latestCheckpoint"),
    })
    .strict(),
]);
export type KayingCodeSessionHistoryTarget = z.infer<typeof kayingcodeSessionHistoryTargetSchema>;

export const kayingcodeSessionForkParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    target: kayingcodeSessionHistoryTargetSchema.default({
      kind: "latestCheckpoint",
    }),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KayingCodeSessionForkParams = z.infer<typeof kayingcodeSessionForkParamsSchema>;

export const kayingcodeSessionForkResultSchema = z
  .object({
    forkedSessionId: nonEmptyString,
    parentSessionId: nonEmptyString.optional(),
    targetMessageId: nonEmptyString.optional(),
    targetCheckpointId: nonEmptyString.optional(),
    response: z.string(),
    snapshot: kayingcodeSessionStateSnapshotSchema,
  })
  .strict();
export type KayingCodeSessionForkResult = z.infer<typeof kayingcodeSessionForkResultSchema>;

export const kayingcodeSessionCompactParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    inputId: nonEmptyString.optional(),
    instructions: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KayingCodeSessionCompactParams = z.infer<typeof kayingcodeSessionCompactParamsSchema>;

export const kayingcodeSessionCompactResultSchema = z
  .object({
    response: z.string(),
    snapshot: kayingcodeSessionStateSnapshotSchema,
    compact: z
      .object({
        state: z.enum(["accepted", "already_running"]),
        inputId: nonEmptyString.optional(),
        operationId: nonEmptyString.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodeSessionCompactResult = z.infer<typeof kayingcodeSessionCompactResultSchema>;

export const kayingcodeSessionGoalActionSchema = z.enum([
  "show",
  "set",
  "replace",
  "pause",
  "resume",
  "clear",
]);
export type KayingCodeSessionGoalAction = z.infer<typeof kayingcodeSessionGoalActionSchema>;

export const kayingcodeSessionGoalParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    inputId: nonEmptyString.optional(),
    action: kayingcodeSessionGoalActionSchema,
    objective: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KayingCodeSessionGoalParams = z.infer<typeof kayingcodeSessionGoalParamsSchema>;

export const kayingcodeSessionGoalResultSchema = z
  .object({
    response: z.string(),
    snapshot: kayingcodeSessionStateSnapshotSchema,
    startedTurn: z.boolean().optional(),
  })
  .strict();
export type KayingCodeSessionGoalResult = z.infer<typeof kayingcodeSessionGoalResultSchema>;

export const kayingcodeSessionStopParamsSchema = z
  .object({
    sessionId: nonEmptyString,
  })
  .strict();
const kayingcodeBackgroundTaskInfoStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "spawn_error",
  "lost",
]);

export const kayingcodeBackgroundTaskInfoSchema = z
  .object({
    taskId: nonEmptyString,
    toolCallId: nonEmptyString.optional(),
    toolName: nonEmptyString.optional(),
    taskKind: z.enum(["bash", "subagent"]).optional(),
    blocked: z.boolean().optional(),
    blockedReason: z.string().optional(),
    cancellable: z.boolean().optional(),
    cancelRequestedAt: protocolInstantSchema.optional(),
    command: z.string().optional(),
    description: z.string().optional(),
    status: kayingcodeBackgroundTaskInfoStatusSchema,
    pid: z.number().int().positive().optional(),
    startedAt: protocolInstantSchema.optional(),
    completedAt: protocolInstantSchema.optional(),
    outputPath: z.string().optional(),
    stderrPersistedOutputPath: z.string().optional(),
    stdoutPersistedOutputPath: z.string().optional(),
    outputBytes: z.number().int().nonnegative().optional(),
    outputTruncated: z.boolean().optional(),
    outputTail: z.string().optional(),
    stderrBytes: z.number().int().nonnegative().optional(),
    stderrTail: z.string().optional(),
    stdoutBytes: z.number().int().nonnegative().optional(),
    stdoutTail: z.string().optional(),
    terminalId: nonEmptyString.optional(),
  })
  .strict();
export const kayingcodeSessionCancelBackgroundTaskParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    taskId: nonEmptyString,
  })
  .strict();
export type KayingCodeSessionCancelBackgroundTaskParams = z.infer<
  typeof kayingcodeSessionCancelBackgroundTaskParamsSchema
>;

export const kayingcodeSessionCancelBackgroundTaskResultSchema = z
  .object({
    cancelled: z.boolean(),
    reason: z.string().optional(),
    snapshot: kayingcodeBackgroundTaskInfoSchema.optional(),
    status: kayingcodeBackgroundTaskInfoStatusSchema,
    taskId: nonEmptyString,
  })
  .strict();
export type KayingCodeSessionCancelBackgroundTaskResult = z.infer<
  typeof kayingcodeSessionCancelBackgroundTaskResultSchema
>;

export const kayingcodeSessionSetModelParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    model: modelSelectionSchema,
    expectedRevision: z.number().int().nonnegative().optional(),
    persistAsWorkspaceLastUsed: z.boolean().default(true),
  })
  .strict();
export type KayingCodeSessionSetModelParams = z.infer<typeof kayingcodeSessionSetModelParamsSchema>;

export const kayingcodeSessionSetThoughtLevelParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    thoughtLevel: nonEmptyString.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    persistAsWorkspaceLastUsed: z.boolean().default(true),
  })
  .strict();
export type KayingCodeSessionSetThoughtLevelParams = z.infer<
  typeof kayingcodeSessionSetThoughtLevelParamsSchema
>;

export const kayingcodeSessionSetModeParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    mode: kayingcodeSessionModeSchema,
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type KayingCodeSessionSetModeParams = z.infer<typeof kayingcodeSessionSetModeParamsSchema>;

export const kayingcodeSessionCloseParamsSchema = z
  .object({
    sessionId: nonEmptyString,
    expectedPersistence: kayingcodeSessionPersistenceSchema.optional(),
  })
  .strict();
export type KayingCodeSessionCloseParams = z.infer<typeof kayingcodeSessionCloseParamsSchema>;
export const kayingcodeSessionCloseResultSchema = z
  .object({
    closed: z.boolean().optional(),
  })
  .strict();
export type KayingCodeSessionCloseResult = z.infer<typeof kayingcodeSessionCloseResultSchema>;
export const kayingcodeWorkspaceReadPresentationParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema })
  .strict();
export const kayingcodeWorkspacePresentationSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    mode: kayingcodeSessionModeSchema,
    slashCommands: z.array(kayingcodeSlashCommandSchema),
  })
  .strict();
export type KayingCodeWorkspacePresentation = z.infer<typeof kayingcodeWorkspacePresentationSchema>;
const workspaceHookSha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const kayingcodeWorkspaceHookTrustGrantParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    bundleDigest: workspaceHookSha256DigestSchema,
    hookDeclarationDigest: workspaceHookSha256DigestSchema,
  })
  .strict();
export type KayingCodeWorkspaceHookTrustGrantParams = z.infer<
  typeof kayingcodeWorkspaceHookTrustGrantParamsSchema
>;
export const kayingcodeWorkspaceHookTrustGrantReasonCodeSchema = z.enum([
  "workspace_hooks_blocked_by_policy",
  "workspace_hooks_bundle_changed",
  "workspace_hooks_snapshot_mismatch",
  "workspace_hooks_policy_requires_pretrust",
  "workspace_hooks_trust_store_corrupt",
  "workspace_hooks_config_unreadable",
]);
export type KayingCodeWorkspaceHookTrustGrantReasonCode = z.infer<
  typeof kayingcodeWorkspaceHookTrustGrantReasonCodeSchema
>;
export const kayingcodeWorkspaceHookTrustGrantResultSchema = z
  .object({
    accepted: z.boolean(),
    reasonCode: kayingcodeWorkspaceHookTrustGrantReasonCodeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkspaceHookTrustGrantResult = z.infer<
  typeof kayingcodeWorkspaceHookTrustGrantResultSchema
>;
const kayingcodeWorkspaceModelToolCallSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    input: z.unknown(),
  })
  .strict();
const kayingcodeWorkspaceModelMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string() }).strict(),
  z.object({ role: z.literal("user"), content: z.string() }).strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z.string(),
      toolCalls: z.array(kayingcodeWorkspaceModelToolCallSchema).optional(),
    })
    .strict(),
  z
    .object({
      role: z.literal("tool"),
      content: z.string(),
      toolCallId: nonEmptyString,
      toolName: nonEmptyString,
      isError: z.boolean().optional(),
    })
    .strict(),
]);
const kayingcodeWorkspaceModelToolSchema = z
  .object({
    name: nonEmptyString,
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()),
  })
  .strict();

export const kayingcodeWorkspaceGenerateTextParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    selection: modelSelectionSchema,
    prompt: nonEmptyString.optional(),
    messages: z.array(kayingcodeWorkspaceModelMessageSchema).min(1).optional(),
    tools: z.array(kayingcodeWorkspaceModelToolSchema).optional(),
    querySource: nonEmptyString,
    maxOutputTokens: z.number().int().positive().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict()
  .refine((value) => value.prompt !== undefined || value.messages !== undefined, {
    message: "prompt 或 messages 至少需要提供一个",
  });
export const kayingcodeWorkspaceGenerateTextResultSchema = z
  .object({
    text: z.string(),
    selection: modelSelectionSchema,
    toolCalls: z.array(kayingcodeWorkspaceModelToolCallSchema).optional(),
    // 可选以兼容仍在运行的旧 app-server；新 CLI 始终返回结构化结束原因。
    finishReason: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.number().nonnegative().optional(),
        outputTokens: z.number().nonnegative().optional(),
        totalTokens: z.number().nonnegative().optional(),
        cacheReadTokens: z.number().nonnegative().optional(),
        cacheWriteTokens: z.number().nonnegative().optional(),
        reasoningTokens: z.number().nonnegative().optional(),
        serverToolUse: z
          .object({
            webSearchRequests: z.number().nonnegative().optional(),
            webFetchRequests: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodeWorkspaceGenerateTextParams = z.infer<
  typeof kayingcodeWorkspaceGenerateTextParamsSchema
>;
export type KayingCodeWorkspaceModelMessage = z.infer<typeof kayingcodeWorkspaceModelMessageSchema>;
export type KayingCodeWorkspaceModelTool = z.infer<typeof kayingcodeWorkspaceModelToolSchema>;
export type KayingCodeWorkspaceGenerateTextResult = z.infer<
  typeof kayingcodeWorkspaceGenerateTextResultSchema
>;
export const kayingcodeWorkspaceCancelGenerateTextParamsSchema = z
  .object({ operationId: nonEmptyString })
  .strict();
export const kayingcodeWorkspaceCancelGenerateTextResultSchema = z
  .object({ operationId: nonEmptyString, cancelled: z.boolean() })
  .strict();

export const kayingcodeProviderTestModelConnectivityParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    selection: modelSelectionSchema,
  })
  .strict();
export const kayingcodeProviderTestModelConnectivityResultSchema = z
  .object({ success: z.literal(true) })
  .strict();
export type KayingCodeProviderTestModelConnectivityParams = z.infer<
  typeof kayingcodeProviderTestModelConnectivityParamsSchema
>;
export type KayingCodeProviderTestModelConnectivityResult = z.infer<
  typeof kayingcodeProviderTestModelConnectivityResultSchema
>;

export const kayingcodeProviderUpdateAccountConfigParamsSchema = z
  .object({
    revision: nonEmptyString,
    basedOnKayingCodeBuiltinRevision: nonEmptyString,
    // Provider Config 的字段校验由 @zcode/provider 负责；协议层只约束可传输信封。
    providers: z.record(z.string(), z.unknown()),
    // 账号状态与 Overlay 必须一起传递，否则 Worker 会丢失非当前套餐的执行门禁。
    states: z.record(
      z.string(),
      z
        .object({
          availability: z.enum(["available", "pending", "unavailable", "unknown"]),
          entitled: z.boolean(),
          unavailableReason: accountProviderUnavailableReasonSchema.optional(),
          current: z.boolean().optional(),
          connectionKey: z.string().optional(),
          effectiveAt: z.number().finite().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const kayingcodeProviderUpdateAccountConfigResultSchema = z
  .object({
    // 收到账号结果不代表配套 Built-in 已到达；应用版本只能读取 Registry 快照。
    receivedRevision: nonEmptyString,
    providerCount: z.number().int().nonnegative(),
    status: z.enum(["received", "unchanged"]),
  })
  .strict();
export type KayingCodeProviderUpdateAccountConfigResult = z.infer<
  typeof kayingcodeProviderUpdateAccountConfigResultSchema
>;
/** Worker 从所属 Environment 的正式 Config Store 重建进程内 Provider Registry。 */
export const kayingcodeProviderRefreshRegistryParamsSchema = z
  .object({
    reason: nonEmptyString,
  })
  .strict();
export const kayingcodeProviderRefreshRegistryResultSchema = z
  .object({
    refreshed: z.literal(true),
  })
  .strict();
export type KayingCodeProviderRefreshRegistryParams = z.infer<
  typeof kayingcodeProviderRefreshRegistryParamsSchema
>;
export type KayingCodeProviderRefreshRegistryResult = z.infer<
  typeof kayingcodeProviderRefreshRegistryResultSchema
>;
export const kayingcodeInteractionPreferencesSchema = z
  .object({
    askUserQuestionAutoResolutionEnabled: z.boolean(),
  })
  .strict();
export type KayingCodeInteractionPreferences = z.infer<
  typeof kayingcodeInteractionPreferencesSchema
>;

export const kayingcodeWorkspaceUpdateInteractionPreferencesParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    preferences: kayingcodeInteractionPreferencesSchema,
  })
  .strict();
export type KayingCodeWorkspaceUpdateInteractionPreferencesParams = z.infer<
  typeof kayingcodeWorkspaceUpdateInteractionPreferencesParamsSchema
>;

export const kayingcodeWorkspaceUpdateInteractionPreferencesResultSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    askUserQuestionAutoResolutionEnabled: z.boolean(),
    snoozedInteractionCount: z.number().int().nonnegative(),
  })
  .strict();
export type KayingCodeWorkspaceUpdateInteractionPreferencesResult = z.infer<
  typeof kayingcodeWorkspaceUpdateInteractionPreferencesResultSchema
>;

export const kayingcodeModelIoPreferencesSchema = z
  .object({
    fullRetentionEnabled: z.boolean(),
  })
  .strict();
export type KayingCodeModelIoPreferences = z.infer<typeof kayingcodeModelIoPreferencesSchema>;

export const kayingcodeWorkspaceUpdateModelIoPreferencesParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    preferences: kayingcodeModelIoPreferencesSchema,
  })
  .strict();
export type KayingCodeWorkspaceUpdateModelIoPreferencesParams = z.infer<
  typeof kayingcodeWorkspaceUpdateModelIoPreferencesParamsSchema
>;

export const kayingcodeWorkspaceUpdateModelIoPreferencesResultSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    fullRetentionEnabled: z.boolean(),
    updatedSessionCount: z.number().int().nonnegative(),
  })
  .strict();
export type KayingCodeWorkspaceUpdateModelIoPreferencesResult = z.infer<
  typeof kayingcodeWorkspaceUpdateModelIoPreferencesResultSchema
>;

export const kayingcodeWorkspaceUpdateOffPeakToolPolicyParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KayingCodeWorkspaceUpdateOffPeakToolPolicyParams = z.infer<
  typeof kayingcodeWorkspaceUpdateOffPeakToolPolicyParamsSchema
>;

export const kayingcodeWorkspaceUpdateOffPeakToolPolicyResultSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KayingCodeWorkspaceUpdateOffPeakToolPolicyResult = z.infer<
  typeof kayingcodeWorkspaceUpdateOffPeakToolPolicyResultSchema
>;

// 动态工作流灰度门禁：workspace 级事实，
// 与 Off-Peak 同一套 host→CLI 同步模式；旧 CLI method-not-found → host 降级忽略。
export const kayingcodeWorkspaceUpdateDynamicWorkflowPolicyParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    enabled: z.boolean(),
    // launch.md「On demand: activation」：mode 与布尔同行；缺席时 CLI 按布尔行事（alwaysOn）。
    mode: kayingcodeDynamicWorkflowModeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkspaceUpdateDynamicWorkflowPolicyParams = z.infer<
  typeof kayingcodeWorkspaceUpdateDynamicWorkflowPolicyParamsSchema
>;

export const kayingcodeWorkspaceUpdateDynamicWorkflowPolicyResultSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KayingCodeWorkspaceUpdateDynamicWorkflowPolicyResult = z.infer<
  typeof kayingcodeWorkspaceUpdateDynamicWorkflowPolicyResultSchema
>;

export const kayingcodePermissionRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    reason: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    input: z.unknown(),
    origin: kayingcodeInteractionRequestOriginSchema.optional(),
    options: z.array(kayingcodePermissionOptionSchema).min(1),
  })
  .strict();
export type KayingCodePermissionRequestParams = z.infer<
  typeof kayingcodePermissionRequestParamsSchema
>;

/** Agent 请求 app 枚举当前 workspace/session 可达且已完成握手的 browser backend。 */
export const kayingcodeBrowserListParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    workspaceKey: nonEmptyString,
    workspacePath: nonEmptyString,
    workspaceIdentity: nonEmptyString.optional(),
    remoteSessionId: nonEmptyString.optional(),
    clientMode: browserClientModeSchema,
    sessionContext: browserSessionContextKindSchema,
  })
  .strict();
export type KayingCodeBrowserListParams = z.infer<typeof kayingcodeBrowserListParamsSchema>;

export const kayingcodeBrowserListResultSchema = browserBackendListResultSchema;
export type KayingCodeBrowserListResult = z.infer<typeof kayingcodeBrowserListResultSchema>;

/** Agent 把一条 browser-use 命令发送给 app 执行。 */
export const kayingcodeBrowserExecuteParamsSchema = z
  .object({
    controlScopeId: nonEmptyString.optional(),
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    browserId: nonEmptyString.optional(),
    browserGeneration: z.number().int().nonnegative().optional(),
    workspaceKey: nonEmptyString.optional(),
    workspacePath: nonEmptyString.optional(),
    workspaceIdentity: nonEmptyString.optional(),
    remoteSessionId: nonEmptyString.optional(),
    clientMode: browserClientModeSchema.optional(),
    sessionContext: browserSessionContextKindSchema.optional(),
    command: browserCommandSchema,
  })
  .strict();
export type KayingCodeBrowserExecuteParams = z.infer<typeof kayingcodeBrowserExecuteParamsSchema>;

// browser command result 是 app/agent 的同源协议结果；其中 duplicate_request_id 用于在真正维护
// pending/running 生命周期的边界拒绝 correlation key 冲突，不能依赖上游 UUID 概率保证。
export const kayingcodeBrowserExecuteResultSchema = browserCommandResultSchema;
export type KayingCodeBrowserExecuteResult = z.infer<typeof kayingcodeBrowserExecuteResultSchema>;

export const kayingcodeUserInputOptionSchema = z
  .object({
    value: nonEmptyString,
    label: nonEmptyString,
    description: z.string().optional(),
    preview: z.string().optional(),
  })
  .strict();
export const kayingcodeUserInputQuestionSchema = z
  .object({
    question: nonEmptyString,
    header: nonEmptyString,
    options: z.array(kayingcodeUserInputOptionSchema).min(1),
    multiSelect: z.boolean().optional(),
  })
  .strict();
export type KayingCodeUserInputQuestion = z.infer<typeof kayingcodeUserInputQuestionSchema>;

export const kayingcodeUserInputRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    toolCallId: nonEmptyString.optional(),
    toolName: nonEmptyString.optional(),
    prompt: z.string().optional(),
    questions: z.array(kayingcodeUserInputQuestionSchema).min(1).optional(),
    input: z.unknown().optional(),
    origin: kayingcodeInteractionRequestOriginSchema.optional(),
    schema: z.unknown().optional(),
  })
  .strict();
export type KayingCodeUserInputRequestParams = z.infer<
  typeof kayingcodeUserInputRequestParamsSchema
>;

export const kayingcodeUserInputResponseSchema = z
  .object({
    action: z.enum(["accept", "decline", "cancel"]),
    content: jsonObjectSchema.optional(),
    reason: z.string().optional(),
  })
  .strict();
export type KayingCodeUserInputResponse = z.infer<typeof kayingcodeUserInputResponseSchema>;

export const kayingcodeProviderRuntimeHeadersRequestReasonSchema = z.enum(
  requestVerificationReasons,
);
export const kayingcodeProviderRuntimeHeadersRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    turnId: nonEmptyString.optional(),
    workspace: kayingcodeWorkspaceRefSchema,
    modelSelection: modelSelectionSchema,
    providerId: nonEmptyString,
    accountAccess: kayingcodeProviderAccountAccessSchema.optional(),
    expectedAccountScope: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    rejectedProjectTokenFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    reason: kayingcodeProviderRuntimeHeadersRequestReasonSchema,
  })
  .strict();
export type KayingCodeProviderRuntimeHeadersRequestParams = z.infer<
  typeof kayingcodeProviderRuntimeHeadersRequestParamsSchema
>;

/** 请求取消只作用于同 workspace/session 的这一轮凭据刷新。 */
export const kayingcodeProviderRuntimeHeadersCancelledSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    workspace: kayingcodeWorkspaceRefSchema,
  })
  .strict();
export type KayingCodeProviderRuntimeHeadersCancelled = z.infer<
  typeof kayingcodeProviderRuntimeHeadersCancelledSchema
>;

// 标准 JSON-RPC error 保留旧版 schema 兼容，不向严格校验的 response 增加字段。
export const KAYINGCODE_PROVIDER_CONFIG_NETWORK_ERROR = -32032;

export const kayingcodeProviderRuntimeHeadersErrorCode = {
  configNetwork: "request_verification_config_network",
  configInvalid: "request_verification_config_invalid",
} as const;

export const kayingcodeProviderRuntimeHeadersResponseSchema = z.discriminatedUnion(
  "headersApplied",
  [
    z
      .object({
        headersApplied: z.literal(true),
        // 合并重接：成功必须携带当前请求的鉴权材料，不依赖旧 Registry 已被写入。
        requestAuth: z
          .object({
            apiKey: nonEmptyString.optional(),
            apiKeyId: z.string().trim().min(1).optional(),
            accountScope: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
            headers: z.record(nonEmptyString, nonEmptyString).optional(),
          })
          .strict(),
        errorMessage: nonEmptyString.optional(),
      })
      .strict(),
    z
      .object({
        headersApplied: z.literal(false),
        errorMessage: nonEmptyString.optional(),
      })
      .strict(),
  ],
);
export type KayingCodeProviderRuntimeHeadersResponse = z.infer<
  typeof kayingcodeProviderRuntimeHeadersResponseSchema
>;

// ── 官方 Server MCP 鉴权──
// Agent 进程不是用户身份权威：它把 (pluginId, mcpKey, targetOrigin) 报给 host，由 host
// 解析当前 Coding Plan 凭证并回传本次请求的身份头。请求侧不含任何秘密。
// 与 interaction/requestProviderRuntimeHeaders 同类：Agent 发起、host 自动响应、零 UI。
//
// `consumer` 缺省为 `mcp-server`（旧版 agent 不带该字段），此时必须带 `mcpKey`；
// `plugin-command` 是官方插件命令进程经 agent 代理端点发起的请求，没有 MCP，不带 `mcpKey`，
// host 按「套餐可选」解析：没有套餐时只给 KayingCode 登录身份（技术方案 5.8）。
export const kayingcodeOfficialMcpAuthHeadersRequestParamsSchema = z
  .object({
    requestId: nonEmptyString,
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString,
    consumer: z.enum(OFFICIAL_AUTH_CONSUMER_KINDS).optional(),
    mcpKey: nonEmptyString.optional(),
    targetOrigin: nonEmptyString,
  })
  .strict()
  .superRefine((params, ctx) => {
    const isCommand = params.consumer === "plugin-command";
    if (isCommand && params.mcpKey !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "plugin-command must not carry mcpKey",
        path: ["mcpKey"],
      });
    }
    if (!isCommand && params.mcpKey === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "mcpKey is required for mcp-server",
        path: ["mcpKey"],
      });
    }
  });
export type KayingCodeOfficialMcpAuthHeadersRequestParams = z.infer<
  typeof kayingcodeOfficialMcpAuthHeadersRequestParamsSchema
>;

/**
 * 失败原因必须可枚举，避免调用方按文本分流；因此响应不含 errorMessage。
 *
 * `official_mcp_origin_untrusted` 是 host 侧二次校验的拒绝原因：`targetOrigin` 不等于当前
 * KayingCode API origin。判定只看 origin，`pluginId` / `mcpKey` 仅用于日志归属。与"未登录/无凭据"
 * 分开，才能在排查时区分"被拒绝"和"没身份"。
 */
export const kayingcodeOfficialMcpAuthFailureReasonSchema = z.enum(
  OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS,
);

export const kayingcodeOfficialMcpAuthHeadersResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      headers: z.record(z.string(), z.string()),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      reason: kayingcodeOfficialMcpAuthFailureReasonSchema,
    })
    .strict(),
]);
export type KayingCodeOfficialMcpAuthHeadersResponse = z.infer<
  typeof kayingcodeOfficialMcpAuthHeadersResponseSchema
>;

// ── Plugin management (list + enable/disable) ──
// 镜像 @zcode/contracts 的 PluginMetadata, 仅保留 UI 需要的可序列化字段。
export const kayingcodePluginOptionValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type KayingCodePluginOptionValue = z.infer<typeof kayingcodePluginOptionValueSchema>;
export const kayingcodePluginScopeSchema = z.enum(["user", "workspace"]);
export type KayingCodePluginScope = z.infer<typeof kayingcodePluginScopeSchema>;
export const kayingcodePluginHookDetailSchema = z
  .object({
    event: nonEmptyString,
    matcher: z.string().optional(),
    type: z.enum(["command", "process"]),
    command: nonEmptyString,
    args: z.array(z.string()).optional(),
    async: z.boolean().optional(),
    shell: z.union([z.literal(true), z.string()]).optional(),
    timeout: z.number().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    statusMessage: z.string().optional(),
    sourcePath: z.string(),
    runnable: z.boolean(),
  })
  .strict();
export const kayingcodePluginUserConfigOptionSchema = z
  .object({
    default: kayingcodePluginOptionValueSchema.optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    title: z.string().optional(),
    type: z.enum(["string", "number", "boolean", "directory", "file"]).optional(),
  })
  .strict();
export type KayingCodePluginUserConfigOption = z.infer<
  typeof kayingcodePluginUserConfigOptionSchema
>;

// 组件类型与详情弹窗/市场详情共用的分组顺序保持一致：agent / command / skill / hook / mcp。
// 注意：这三个 schema 必须定义在 kayingcodePluginInfoSchema 之前，因为后者（.strict()）的 components 字段引用了它们。
export const kayingcodePluginComponentKindSchema = z.enum([
  "agent",
  "command",
  "skill",
  "hook",
  "mcp",
]);
export type KayingCodePluginComponentKind = z.infer<typeof kayingcodePluginComponentKindSchema>;

export const kayingcodePluginComponentItemSchema = z
  .object({
    name: nonEmptyString,
    // 描述来自组件 frontmatter（SKILL.md / command / agent）或 manifest；缺失时省略，不伪造。
    description: z.string().optional(),
  })
  .strict();
export const kayingcodePluginComponentGroupSchema = z
  .object({
    kind: kayingcodePluginComponentKindSchema,
    items: z.array(kayingcodePluginComponentItemSchema),
  })
  .strict();
export type KayingCodePluginComponentGroup = z.infer<typeof kayingcodePluginComponentGroupSchema>;

export const kayingcodePluginBrowserCompareProfileSchema = z.enum([
  "standard-web",
  "taptap-preview",
]);
export const kayingcodePluginBrowserCompareSidePaneSchema = z
  .object({
    contractVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    kind: z.literal("browser-compare"),
    title: nonEmptyString.max(80),
    publicationFile: nonEmptyString
      .max(240)
      .refine(
        isSafePluginBrowserComparePublicationPath,
        "publicationFile must be a safe workspace-relative path",
      ),
    views: z.tuple([
      z
        .object({
          id: z.literal("source"),
          label: nonEmptyString.max(80),
          profile: kayingcodePluginBrowserCompareProfileSchema,
        })
        .strict(),
      z
        .object({
          id: z.literal("target"),
          label: nonEmptyString.max(80),
          profile: kayingcodePluginBrowserCompareProfileSchema,
        })
        .strict(),
    ]),
  })
  .strict();
export type KayingCodePluginBrowserCompareSidePane = z.infer<
  typeof kayingcodePluginBrowserCompareSidePaneSchema
>;

function isSafePluginBrowserComparePublicationPath(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }
  const segments = value.split(/[\\/]/);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
export const kayingcodePluginUiSurfaceSchema = z
  .object({
    pluginId: nonEmptyString,
    pluginName: nonEmptyString,
    id: nonEmptyString.max(128),
    title: z.union([nonEmptyString, z.record(z.string(), z.string())]),
    icon: z.string().optional(),
    // 运行时 namespaced server 名（plugin:<name>:<server>），可直接用于 mcp/uiReadResource。
    server: nonEmptyString,
    resourceUri: nonEmptyString.max(2048),
    availability: z.literal("session"),
  })
  .strict();
export type KayingCodePluginUiSurface = z.infer<typeof kayingcodePluginUiSurfaceSchema>;

export const kayingcodePluginInfoSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    description: z.string().optional(),
    version: z.string().optional(),
    enabled: z.boolean(),
    source: nonEmptyString,
    marketplace: nonEmptyString,
    // manifest（plugin.json）的作者/主页回退字段；商店 listing 缺失时详情页信息区用它兜底。
    author: z.string().optional(),
    authorUrl: z.string().optional(),
    homepage: z.string().optional(),
    skillCount: z.number().int().nonnegative().optional(),
    skillRootCount: z.number().int().nonnegative(),
    commandRootCount: z.number().int().nonnegative(),
    // 权威组件清单（名称 + 可选描述），由 CLI 对插件根目录枚举得出，与启用态无关。
    // 详情 UI 直接展示，取代旧的「数量取协议、名称靠 UI 侧 join」脆弱方案。optional 兼容旧 payload。
    components: z.array(kayingcodePluginComponentGroupSchema).optional(),
    uiSurfaces: z.array(kayingcodePluginUiSurfaceSchema).optional(),
    declaredMcpServerNames: z.array(z.string()).optional(),
    hostMcpServerNames: z.array(z.string()).optional(),
    mcpServerNames: z.array(z.string()),
    hookDetails: z.array(kayingcodePluginHookDetailSchema).optional(),
    rootPath: z.string(),
    userConfig: z.record(z.string(), kayingcodePluginUserConfigOptionSchema).optional(),
    configuredOptions: z.record(z.string(), kayingcodePluginOptionValueSchema).optional(),
    // 缺省表示 package 可用；missing 用于保留已声明但目标 Host 尚未物化的配置行。
    packageStatus: z.literal("missing").optional(),
    rootSource: kayingcodePluginScopeSchema.optional(),
    enabledSource: kayingcodePluginScopeSchema.optional(),
    optionSources: z.record(z.string(), kayingcodePluginScopeSchema).optional(),
    uiContributions: z
      .object({
        sidePanes: z.array(kayingcodePluginBrowserCompareSidePaneSchema),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodePluginInfo = z.infer<typeof kayingcodePluginInfoSchema>;

export const kayingcodePluginDiagnosticSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(["warning", "error"]).optional(),
    pluginId: z.string().optional(),
  })
  .strict();
export type KayingCodePluginDiagnostic = z.infer<typeof kayingcodePluginDiagnosticSchema>;

export const kayingcodePluginsListParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    configScope: kayingcodePluginScopeSchema.optional(),
  })
  .strict();
export const kayingcodePluginsListResultSchema = z
  .object({
    plugins: z.array(kayingcodePluginInfoSchema),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
  })
  .strict();
export type KayingCodePluginsListResult = z.infer<typeof kayingcodePluginsListResultSchema>;

// ── 插件 UI 面板入口──
// 工作区级只读投影：已启用插件清单 `ui.surfaces[]` 的合法条目；插件启停后 host 重新拉取。
export const kayingcodePluginsListUiSurfacesParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema })
  .strict();
export type KayingCodePluginsListUiSurfacesParams = z.infer<
  typeof kayingcodePluginsListUiSurfacesParamsSchema
>;
export const kayingcodePluginsListUiSurfacesResultSchema = z
  .object({ surfaces: z.array(kayingcodePluginUiSurfaceSchema) })
  .strict();
export type KayingCodePluginsListUiSurfacesResult = z.infer<
  typeof kayingcodePluginsListUiSurfacesResultSchema
>;

// ── Plugin 对话引用 catalog（docs/plugin-reference-mention.md）──
// Session-scoped 只读投影：带 sessionId → 该 Session 创建时冻结的身份 catalog；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。身份与能力字段保持
// identifiers-only，不携带 rootPath/配置等；可选 icon/displayName(I18n)/description(I18n)
// 仅供 UI 展示与 Picker 搜索，不参与身份、权限或 runtime reminder。
export const kayingcodePluginReferenceCatalogEntrySchema = z
  .object({
    // 仅 referenceCatalogWithCategory 返回；旧入口保持原结构。
    category: nonEmptyString.optional(),
    pluginId: nonEmptyString,
    name: nonEmptyString,
    marketplace: nonEmptyString,
    icon: z.string().optional(),
    // 商店 listing 的 display-only 本地化显示名投影（沿 icon 先例）：让 Picker 能按
    // 中文显示名搜索/展示；locale 解析复用 shared 的 plugin-display-name helper。
    displayName: z.string().optional(),
    displayNameI18n: z.record(z.string(), z.string()).optional(),
    // 仅供 Picker 展示，不进入能力身份或 model-only reminder。
    description: z.string().optional(),
    descriptionI18n: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean(),
    // 非空 = 与其他 enabled Plugin 共享 manifest name 的 V1 fail closed 冲突：
    // Picker 禁选并展示原因，runtime 解析按 ambiguous 跳过。
    conflictingPluginIds: z.array(nonEmptyString),
    skillQualifiedNames: z.array(nonEmptyString),
    mcpServerNames: z.array(nonEmptyString),
    // 旧 Host 不投影该字段时按空数组兼容；只有新 Agent 会把它用于 reminder live 交集。
    subagentNames: z.array(nonEmptyString).default([]),
  })
  .strict();
export type KayingCodePluginReferenceCatalogEntry = z.infer<
  typeof kayingcodePluginReferenceCatalogEntrySchema
>;

export const kayingcodePluginsReferenceCatalogParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    // 已有 Session 的 Picker 必须带 sessionId 才能拿到 session-owned catalog；
    // session 不存在时按协议错误 fail closed，禁止静默回退 workspace authority。
    sessionId: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodePluginsReferenceCatalogParams = z.infer<
  typeof kayingcodePluginsReferenceCatalogParamsSchema
>;
export const kayingcodePluginsReferenceCatalogResultSchema = z
  .object({
    authority: z.enum(["session", "workspace"]),
    plugins: z.array(kayingcodePluginReferenceCatalogEntrySchema),
  })
  .strict();
export type KayingCodePluginsReferenceCatalogResult = z.infer<
  typeof kayingcodePluginsReferenceCatalogResultSchema
>;

// ── Skill 对话引用 catalog──
// 新草稿读取 workspace 当前目录；已有 Session 读取 AgentRuntime 首次 context
// 初始化时冻结的发现结果。该协议只承载 Composer 的只读引用投影，不替代 Settings
// 的 Skill 管理接口，也不持久化 runtime 快照。
export const kayingcodeSkillReferenceCatalogEntrySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    description: z.string(),
    path: nonEmptyString,
    scope: z.enum(["workspace", "user", "plugin"]),
    enabled: z.literal(true),
    pluginName: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodeSkillReferenceCatalogEntry = z.infer<
  typeof kayingcodeSkillReferenceCatalogEntrySchema
>;

export const kayingcodeSkillsReferenceCatalogParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    // 带 sessionId 时必须命中该进程内的 resident Session；未知 Session fail closed，
    // 禁止回退到 workspace 当前目录而把新 Skill 泄漏进旧对话。
    sessionId: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodeSkillsReferenceCatalogParams = z.infer<
  typeof kayingcodeSkillsReferenceCatalogParamsSchema
>;
export const kayingcodeSkillsReferenceCatalogResultSchema = z
  .object({
    authority: z.enum(["session", "workspace"]),
    skills: z.array(kayingcodeSkillReferenceCatalogEntrySchema),
  })
  .strict();
export type KayingCodeSkillsReferenceCatalogResult = z.infer<
  typeof kayingcodeSkillsReferenceCatalogResultSchema
>;

// ── 已保存工作流的 GUI 中枢──
// workspace 级、无会话的五个方法，照 skills/referenceCatalog 的先例：每次调用现扫
// `<cwd>/.kayingcode/workflows/`（挂载时快照会漏掉手改的文件）。形状与 @zcode/contracts 的
// saved-workflow.ts 逐字对齐——依赖方向是 contracts → shared，所以这里结构化地再声明一遍，
// 而不是 import；两边的 strict 形状由 bootstrap 侧的协议测试互相钉住。
export const kayingcodeSavedWorkflowArgTypeSchema = z.enum(["string", "number", "boolean", "json"]);
export type KayingCodeSavedWorkflowArgType = z.infer<typeof kayingcodeSavedWorkflowArgTypeSchema>;
export const kayingcodeSavedWorkflowArgDeclarationSchema = z
  .object({
    type: kayingcodeSavedWorkflowArgTypeSchema,
    description: z.string().optional(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
  })
  .strict();
export type KayingCodeSavedWorkflowArgDeclaration = z.infer<
  typeof kayingcodeSavedWorkflowArgDeclarationSchema
>;
export const kayingcodeSavedWorkflowArgsDeclarationSchema = z.record(
  z.string(),
  kayingcodeSavedWorkflowArgDeclarationSchema,
);
export type KayingCodeSavedWorkflowArgsDeclaration = z.infer<
  typeof kayingcodeSavedWorkflowArgsDeclarationSchema
>;
export const kayingcodeSavedWorkflowMetaSchema = z
  .object({
    description: nonEmptyString,
    whenToUse: nonEmptyString.optional(),
    args: kayingcodeSavedWorkflowArgsDeclarationSchema.optional(),
  })
  .strict();
export type KayingCodeSavedWorkflowMeta = z.infer<typeof kayingcodeSavedWorkflowMetaSchema>;
// 作用域两档：项目档落 `<cwd>/.kayingcode/workflows/`、全局档落 agent 机器的 `~/.kayingcode/workflows/`。作用域由文件所在目录推得，frontmatter 不存 scope。
export const kayingcodeSavedWorkflowScopeSchema = z.enum(["project", "global"]);
export type KayingCodeSavedWorkflowScope = z.infer<typeof kayingcodeSavedWorkflowScopeSchema>;
export const kayingcodeSavedWorkflowEntrySchema = z
  .object({
    name: nonEmptyString,
    description: z.string(),
    whenToUse: z.string().optional(),
    args: kayingcodeSavedWorkflowArgsDeclarationSchema.optional(),
    scope: kayingcodeSavedWorkflowScopeSchema,
    path: nonEmptyString,
  })
  .strict();
export type KayingCodeSavedWorkflowEntry = z.infer<typeof kayingcodeSavedWorkflowEntrySchema>;
export const kayingcodeSavedWorkflowInvalidEntrySchema = z
  .object({ path: nonEmptyString, reason: nonEmptyString })
  .strict();
export type KayingCodeSavedWorkflowInvalidEntry = z.infer<
  typeof kayingcodeSavedWorkflowInvalidEntrySchema
>;
/** 名字非法 / 未找到 / frontmatter 坏 / 读错——与 core store 的 resolve 失败四态逐字对应。 */
export const kayingcodeSavedWorkflowFailureReasonSchema = z.enum([
  "invalid_name",
  "not_found",
  "parse_error",
  "read_error",
]);
export type KayingCodeSavedWorkflowFailureReason = z.infer<
  typeof kayingcodeSavedWorkflowFailureReasonSchema
>;
const kayingcodeSavedWorkflowFailureSchema = z
  .object({
    ok: z.literal(false),
    reason: kayingcodeSavedWorkflowFailureReasonSchema,
    detail: z.string().optional(),
  })
  .strict();

export const kayingcodeWorkflowsListParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    // 缺省即 `project`（本项目档）。给 `global` 时改扫本机 `~/.kayingcode/workflows/`；此时 `workspace`
    // 仍必填，但只是**载体运行时**——协议处理器对全局档不读它的路径。
    scope: kayingcodeSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkflowsListParams = z.infer<typeof kayingcodeWorkflowsListParamsSchema>;
export const kayingcodeWorkflowsListResultSchema = z
  .object({
    workflows: z.array(kayingcodeSavedWorkflowEntrySchema),
    invalid: z.array(kayingcodeSavedWorkflowInvalidEntrySchema),
    // 扫过的目录（本地绝对路径），即使目录还不存在也回：GUI 的文件监听靠它 watch。
    dir: nonEmptyString,
  })
  .strict();
export type KayingCodeWorkflowsListResult = z.infer<typeof kayingcodeWorkflowsListResultSchema>;

export const kayingcodeWorkflowsGetParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    name: nonEmptyString,
    // 缺省 `project`；`global` 时只查本机全局根。`workspace` 语义同 list（全局档只当载体）。
    scope: kayingcodeSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkflowsGetParams = z.infer<typeof kayingcodeWorkflowsGetParamsSchema>;
export const kayingcodeWorkflowsGetResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      name: nonEmptyString,
      path: nonEmptyString,
      scope: kayingcodeSavedWorkflowScopeSchema,
      meta: kayingcodeSavedWorkflowMetaSchema,
      /** 脚本本体（frontmatter 之后逐字节），即被类型检查与执行的那一份。 */
      script: z.string(),
    })
    .strict(),
  kayingcodeSavedWorkflowFailureSchema,
]);
export type KayingCodeWorkflowsGetResult = z.infer<typeof kayingcodeWorkflowsGetResultSchema>;

export const kayingcodeWorkflowsUpdateMetaParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    name: nonEmptyString,
    meta: kayingcodeSavedWorkflowMetaSchema,
    // 缺省 `project`；`global` 时只写本机全局根那一份。`workspace` 语义同 list。
    scope: kayingcodeSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkflowsUpdateMetaParams = z.infer<
  typeof kayingcodeWorkflowsUpdateMetaParamsSchema
>;
export const kayingcodeWorkflowsUpdateMetaResultSchema = z.union([
  z.object({ ok: z.literal(true), path: nonEmptyString }).strict(),
  kayingcodeSavedWorkflowFailureSchema,
]);
export type KayingCodeWorkflowsUpdateMetaResult = z.infer<
  typeof kayingcodeWorkflowsUpdateMetaResultSchema
>;

export const kayingcodeWorkflowsDeleteParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    name: nonEmptyString,
    // 缺省 `project`；`global` 时按 scope 选根删除（不再写死 roots[0]）。`workspace` 语义同 list。
    scope: kayingcodeSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkflowsDeleteParams = z.infer<typeof kayingcodeWorkflowsDeleteParamsSchema>;
export const kayingcodeWorkflowsDeleteResultSchema = z.union([
  z.object({ ok: z.literal(true), path: nonEmptyString }).strict(),
  kayingcodeSavedWorkflowFailureSchema,
]);
export type KayingCodeWorkflowsDeleteResult = z.infer<typeof kayingcodeWorkflowsDeleteResultSchema>;

export const KAYINGCODE_WORKFLOWS_RUNS_MAX_LIMIT = 50;
export const kayingcodeWorkflowsRunsParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    /** 只要这个名字的 run（`dwf_run.name` 字面等值）；缺省即本项目全部 run。 */
    name: nonEmptyString.optional(),
    limit: z.number().int().min(1).max(KAYINGCODE_WORKFLOWS_RUNS_MAX_LIMIT),
    // 缺省 `project`：只查 `dwf_run.cwd === workspacePath` 的 run。`global` 时**不**按 cwd 过滤，
    // 跨所有项目取该名字的运行历史（全局工作流在任何项目里跑，历史因此跨 cwd）；结果行带 `cwd`
    // 供 GUI 标项目。`workspace` 语义同 list（全局档只当载体）。
    scope: kayingcodeSavedWorkflowScopeSchema.optional(),
  })
  .strict();
export type KayingCodeWorkflowsRunsParams = z.infer<typeof kayingcodeWorkflowsRunsParamsSchema>;
// 三终态词汇：errored = 脚本之错，stopped = 被停下（可恢复）。
export const kayingcodeSavedWorkflowRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "errored",
  "stopped",
]);
export type KayingCodeSavedWorkflowRunStatus = z.infer<
  typeof kayingcodeSavedWorkflowRunStatusSchema
>;
export const kayingcodeSavedWorkflowRunStopReasonSchema = z.enum([
  "user",
  "model",
  "provider",
  "interrupted",
  "superseded",
]);
export const kayingcodeSavedWorkflowRunSchema = z
  .object({
    runId: nonEmptyString,
    name: z.string().optional(),
    status: kayingcodeSavedWorkflowRunStatusSchema,
    // `status === "stopped"` 才在场。
    stopReason: kayingcodeSavedWorkflowRunStopReasonSchema.optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    spentTokens: z.number(),
    /** 发起它的会话与 CreateWorkflow 工具调用：有这两个才能从中枢打开实例详情。老行可缺。 */
    parentSessionId: z.string().optional(),
    toolCallId: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    // 实际运行的项目目录（`dwf_run.cwd`）。全局档的 `workflows/runs` 跨 cwd 查询，GUI 用它给
    // 每行标项目；项目档变体里它恒等于 workspacePath，GUI 可忽略。老行可缺。
    cwd: z.string().optional(),
    // 这次运行发布的**用户面产物**：中枢的运行历史行在
    // 状态词之后画一串 kind chips，详情页头部的「最近产物」条取最近一次 completed run 的这一份。
    // ⚠ 术语：这里的 artifact 是脚本经 `artifact.*` 发布给用户看的产出，不是脚本的顶层返回值。
    // 只带 chip 画得下的字段（≤ 8 件，取最新版的元数据）；字节与条目经 v4 查询按需读。
    // optional，照上面 `cwd` 的先例：老 CLI 不发，少一个键是退化不是错误。
    artifacts: z
      .array(
        z
          .object({
            id: nonEmptyString,
            kind: z.enum(["file", "markdown", "chart", "table", "metrics", "board"]),
            title: z.string().optional(),
            version: z.number(),
            contentType: z.string().optional(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();
export type KayingCodeSavedWorkflowRun = z.infer<typeof kayingcodeSavedWorkflowRunSchema>;
export const kayingcodeWorkflowsRunsResultSchema = z
  .object({
    runs: z.array(kayingcodeSavedWorkflowRunSchema),
    /** 为真时才在场：还有更多 run 没进这一页（多取一条判定，不是 length === limit）。 */
    truncated: z.literal(true).optional(),
  })
  .strict();
export type KayingCodeWorkflowsRunsResult = z.infer<typeof kayingcodeWorkflowsRunsResultSchema>;

// workflows/move：把本机全局根的同名文件搬到 `workspace` 项目根。**只此一向**：项目→全局不是搬文件而是模型的概括（「提升为
// 全局」在该项目开新会话、经 SaveWorkflow 另存），所以没有 `to` 参数。同机同用户，rename 优先、EXDEV
// 回落 copy+unlink；逐字节搬，不改内容（frontmatter 不存 scope）；`move` 不覆盖——目标已存在即拒绝
// （覆盖是 SaveWorkflow 经确认窗才有的动作，不变式 7）。`workspace` 既是载体运行时也是目标项目。
export const kayingcodeWorkflowsMoveParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    name: nonEmptyString,
  })
  .strict();
export type KayingCodeWorkflowsMoveParams = z.infer<typeof kayingcodeWorkflowsMoveParamsSchema>;
export const kayingcodeWorkflowsMoveResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      /** 源落点路径（全局根，搬走前）。 */
      from: nonEmptyString,
      /** 目标落点路径（项目根，搬到处）。 */
      to: nonEmptyString,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      // target_exists：目标档已有同名（move 不覆盖）；not_found：源档没有这个名字；
      // read_error / write_error：搬运时的 I/O 失败；invalid_name：名字先验没过。
      reason: z.enum(["invalid_name", "not_found", "target_exists", "read_error", "write_error"]),
      path: z.string().optional(),
      detail: z.string().optional(),
    })
    .strict(),
]);
export type KayingCodeWorkflowsMoveResult = z.infer<typeof kayingcodeWorkflowsMoveResultSchema>;

// ── 从一次 run 保存工作流（docs/dynamic-workflow/transcript-and-notifications.md「Saving the
// run, and running it again」）──
// 完成卡的「直接保存」走这条：**不收脚本，只收 runId**——要写的那份正文是这次 run 实际执行的
// 脚本，agent 从 journal 记录（`scriptText`）里读。脚本不经 GUI 走一圈有两个后果值得写下来：
// 修订过的 run 存下的是**结算它的**那一份，而工具行入参被快照裁成预览的老对话也照样存得出
// 同样的字节。名字合法性、覆盖、遮��与类型检查全部复用 SaveWorkflow 的同一套实现（不变式 3）。
/** 另一档已有同名定义（遮蔽事实）；与 contracts 的 SavedWorkflowShadowing 逐字对齐。 */
export const kayingcodeSavedWorkflowShadowingSchema = z.enum(["hides_global", "hidden_by_project"]);
export type KayingCodeSavedWorkflowShadowing = z.infer<
  typeof kayingcodeSavedWorkflowShadowingSchema
>;

export const kayingcodeWorkflowsSaveParamsSchema = z
  .object({
    // 两用：既是载体运行时，也是这次 run 的项目——journal 在它那里，项目根也在它那里。
    // 全局档同样带它（与 list/get 的「全局只当载体」不同）：脚本必须从这个 agent 的 journal 读。
    workspace: kayingcodeWorkspaceRefSchema,
    runId: nonEmptyString,
    name: nonEmptyString,
    meta: kayingcodeSavedWorkflowMetaSchema,
    // 缺省 `project`。
    scope: kayingcodeSavedWorkflowScopeSchema.optional(),
    // 只有 GUI 已经把覆盖警告摆给用户看过时才为 true；缺省即「目标已存在就拒绝」——
    // 覆盖是用户的决定，不是一次保存的副作用（与 `workflows/move` 不覆盖同一条纪律）。
    overwrite: z.boolean().optional(),
  })
  .strict();
export type KayingCodeWorkflowsSaveParams = z.infer<typeof kayingcodeWorkflowsSaveParamsSchema>;
export const kayingcodeWorkflowsSaveResultSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      name: nonEmptyString,
      scope: kayingcodeSavedWorkflowScopeSchema,
      path: nonEmptyString,
      /** 写的那一刻重新判定，不回抄入参里的 `overwrite`（与 SaveWorkflow 的 `overwritten` 同源）。 */
      overwritten: z.boolean(),
      shadowing: kayingcodeSavedWorkflowShadowingSchema.optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      // run_not_found：journal 里没有这条 run；script_missing：老记录没存脚本原文；
      // target_exists：目标已存在而调用方没说覆盖；compile_failed：类型检查没过，一个字节都没写。
      reason: z.enum([
        "invalid_name",
        "run_not_found",
        "script_missing",
        "target_exists",
        "compile_failed",
        "write_error",
      ]),
      path: z.string().optional(),
      detail: z.string().optional(),
    })
    .strict(),
]);
export type KayingCodeWorkflowsSaveResult = z.infer<typeof kayingcodeWorkflowsSaveResultSchema>;

// ── 一次 run 对应哪个已保存工作流 ──
// 完成卡的「已保存」芯片与「再次运行」都问这一个问题，而答案**推导得来、不记在卡上**：重开
// 会话、换一个窗口保存、在对话里保存，都走同一条判定。判定住在 agent 一侧，因为两份事实
// （run 的 journal 记录与磁盘上的定义）都在那里；返回解析好的 entry，用户后来删掉的那一份
// 因此会自动不再算数。
/** 转写自对话的候选：模型用 `SaveWorkflow` 存过、并在入参里认领了这次 run。 */
export const kayingcodeWorkflowsForRunCandidateSchema = z
  .object({ name: nonEmptyString, scope: kayingcodeSavedWorkflowScopeSchema.optional() })
  .strict();
export type KayingCodeWorkflowsForRunCandidate = z.infer<
  typeof kayingcodeWorkflowsForRunCandidateSchema
>;
/** 候选上界：一次 run 在一段对话里被存过的次数远小于它。 */
export const KAYINGCODE_WORKFLOWS_FOR_RUN_MAX_CANDIDATES = 8;
export const kayingcodeWorkflowsForRunParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    runId: nonEmptyString,
    candidates: z
      .array(kayingcodeWorkflowsForRunCandidateSchema)
      .max(KAYINGCODE_WORKFLOWS_FOR_RUN_MAX_CANDIDATES)
      .optional(),
  })
  .strict();
export type KayingCodeWorkflowsForRunParams = z.infer<typeof kayingcodeWorkflowsForRunParamsSchema>;
export const kayingcodeWorkflowsForRunResultSchema = z
  .object({
    /** 命中的定义；缺席即这次 run 还没有对应的已保存工作流。 */
    entry: kayingcodeSavedWorkflowEntrySchema.optional(),
    /** 命中的是哪一条规则（诊断与测试用；UI 只看 entry 在不在）。 */
    match: z.enum(["candidate", "script", "name"]).optional(),
    /** 这次 run 跑时用的实参（journal 原样），供「再次运行」预填实参窗。 */
    runArgs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type KayingCodeWorkflowsForRunResult = z.infer<typeof kayingcodeWorkflowsForRunResultSchema>;

// 推荐 Prompt 的可信插件解析：UI 不拆解 stableId，也不从旧目录快照推断可安装性。
export const kayingcodePluginSuggestedReferenceStatusSchema = z.enum([
  "ready",
  "disabled",
  "missing",
  "conflict",
  "unavailable",
]);
export type KayingCodePluginSuggestedReferenceStatus = z.infer<
  typeof kayingcodePluginSuggestedReferenceStatusSchema
>;
export const kayingcodePluginOperationStateSchema = z.enum([
  "checking",
  "refreshing",
  "installing",
  "enabling",
  "cancelling",
  "cancelled",
  "complete",
  "failed",
]);
export type KayingCodePluginOperationState = z.infer<typeof kayingcodePluginOperationStateSchema>;
export const kayingcodePluginOperationProgressNotificationSchema = z
  .object({
    operationId: nonEmptyString,
    state: z.literal("refreshing"),
  })
  .strict();
export type KayingCodePluginOperationProgressNotification = z.infer<
  typeof kayingcodePluginOperationProgressNotificationSchema
>;
export const kayingcodePluginsResolveSuggestedReferenceParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    stableId: nonEmptyString,
    operationId: nonEmptyString,
    clientMode: kayingcodeDeliveryKindSchema,
    deliveryKind: kayingcodeDeliveryKindSchema,
  })
  .strict();
export type KayingCodePluginsResolveSuggestedReferenceParams = z.infer<
  typeof kayingcodePluginsResolveSuggestedReferenceParamsSchema
>;
export const kayingcodePluginsSetEnabledParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString,
    enabled: z.boolean(),
    operationId: nonEmptyString.optional(),
    scope: kayingcodePluginScopeSchema.optional(),
  })
  .strict();
export const kayingcodePluginsSetEnabledResultSchema = z
  .object({
    plugin: kayingcodePluginInfoSchema,
    enabled: z.boolean(),
  })
  .strict();
export type KayingCodePluginsSetEnabledResult = z.infer<
  typeof kayingcodePluginsSetEnabledResultSchema
>;

// 商店信息（Store Listing）：目录条目携带的展示性元数据（显示名/icon/分类/作者/链接/hero/
// 示例提示词），全部可选，UI 缺失时按降级矩阵处理（字母头像/隐藏区块/省略信息行）。
// i18n 采用 `<字段>I18n` map，locale 解析复用 shared 的 plugin-display-name helper。
export const kayingcodePluginStoreListingSchema = z
  .object({
    gameDevelopment: gameDevelopmentPluginListingSchema.optional(),
    skillDetails: pluginSkillDetailsSchema.optional(),
    displayName: z.string().optional(),
    displayNameI18n: z.record(z.string(), z.string()).optional(),
    descriptionI18n: z.record(z.string(), z.string()).optional(),
    icon: z.string().optional(),
    category: z.string().optional(),
    publisherType: z.enum(["official", "community"]).optional(),
    author: z.string().optional(),
    authorUrl: z.string().optional(),
    homepage: z.string().optional(),
    privacyPolicy: z.string().optional(),
    termsOfService: z.string().optional(),
    heroImage: z.string().optional(),
    examplePrompts: z.array(z.string()).optional(),
    examplePromptsI18n: z.record(z.string(), z.array(z.string())).optional(),
    /**
     * 需要付费套餐才好用的插件：市场目录条目声明 `requiresPaidPlan: true`，
     * UI 在标题右侧展示提示图标。描述的是「使用条件」而非「插件是收费商品」——
     * 不参与安装门禁与计费，命名也不绑定具体套餐商品名。
     */
    requiresPaidPlan: z.boolean().optional(),
  })
  .strict();
export type KayingCodePluginStoreListing = z.infer<typeof kayingcodePluginStoreListingSchema>;

export const kayingcodePluginsResolveSuggestedReferenceResultSchema = z
  .object({
    stableId: nonEmptyString,
    status: kayingcodePluginSuggestedReferenceStatusSchema,
    marketplace: nonEmptyString.optional(),
    pluginName: nonEmptyString.optional(),
    sourceTrust: z.literal("official").optional(),
    // 官方 Marketplace listing 的可选展示投影；不参与身份、安装或权限判断。
    icon: z.string().optional(),
    listing: kayingcodePluginStoreListingSchema.optional(),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status !== "ready" && value.status !== "disabled" && value.status !== "missing") {
      return;
    }
    if (!value.marketplace || !value.pluginName || value.sourceTrust !== "official") {
      context.addIssue({
        code: "custom",
        message: "actionable suggested Plugin results require trusted install identity",
      });
    }
  });
export type KayingCodePluginsResolveSuggestedReferenceResult = z.infer<
  typeof kayingcodePluginsResolveSuggestedReferenceResultSchema
>;

export const kayingcodePluginMarketplaceSummarySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    source: jsonObjectSchema,
    description: z.string().optional(),
    lastUpdated: z.string().optional(),
    pluginCount: z.number().int().nonnegative(),
    isOfficial: z.boolean().optional(),
    // 目录顶层 featured 策展名单（商店「公开」分段 Featured 区）。
    featured: z.array(z.string()).optional(),
    refreshFailure: z
      .object({
        code: z.string(),
        failedAt: z.string(),
        message: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodePluginMarketplaceSummary = z.infer<
  typeof kayingcodePluginMarketplaceSummarySchema
>;

export const kayingcodeAvailablePluginSummarySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    marketplace: nonEmptyString,
    description: z.string().optional(),
    version: z.string().optional(),
    installed: z.boolean(),
    componentTypes: z.array(z.string()).optional(),
    listing: kayingcodePluginStoreListingSchema.optional(),
  })
  .strict();
export type KayingCodeAvailablePluginSummary = z.infer<
  typeof kayingcodeAvailablePluginSummarySchema
>;

export const kayingcodeInstalledPluginSummarySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    marketplace: nonEmptyString,
    description: z.string().optional(),
    version: z.string().optional(),
    enabled: z.boolean(),
    scope: kayingcodePluginScopeSchema,
    installPath: z.string().optional(),
    installedAt: z.string().optional(),
    componentTypes: z.array(z.string()).optional(),
    hookDetails: z.array(kayingcodePluginHookDetailSchema).optional(),
    updateStatus: z.enum(["none", "update-available", "version-changed"]).optional(),
    latestVersion: z.string().optional(),
    listing: kayingcodePluginStoreListingSchema.optional(),
  })
  .strict();
export type KayingCodeInstalledPluginSummary = z.infer<
  typeof kayingcodeInstalledPluginSummarySchema
>;

export const kayingcodePluginsOverviewParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    configScope: kayingcodePluginScopeSchema.optional(),
  })
  .strict();
export const kayingcodePluginsOverviewResultSchema = z
  .object({
    marketplaces: z.array(kayingcodePluginMarketplaceSummarySchema),
    availablePlugins: z.array(kayingcodeAvailablePluginSummarySchema),
    installedPlugins: z.array(kayingcodeInstalledPluginSummarySchema),
    restorableBuiltins: z.array(kayingcodeAvailablePluginSummarySchema),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
    capability: z
      .object({
        supported: z.boolean(),
        reason: z.string().optional(),
      })
      .strict(),
  })
  .strict();
export type KayingCodePluginsOverviewResult = z.infer<typeof kayingcodePluginsOverviewResultSchema>;

export const kayingcodePluginsMarketplaceAddParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    source: nonEmptyString,
    dryRun: z.boolean().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();
export const kayingcodePluginsMarketplaceRemoveParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    marketplace: nonEmptyString,
  })
  .strict();
export const kayingcodePluginsMarketplaceUpdateParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    marketplace: nonEmptyString.optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();
export const kayingcodePluginsMarketplaceMutationResultSchema = z
  .object({
    marketplace: kayingcodePluginMarketplaceSummarySchema.optional(),
    marketplaces: z.array(kayingcodePluginMarketplaceSummarySchema).optional(),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema).optional(),
  })
  .strict();
export type KayingCodePluginsMarketplaceMutationResult = z.infer<
  typeof kayingcodePluginsMarketplaceMutationResultSchema
>;

export const kayingcodePluginsInstallParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginName: nonEmptyString,
    marketplace: nonEmptyString,
    scope: kayingcodePluginScopeSchema.optional(),
    dryRun: z.boolean().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();

/** KayingCode.localrun：本地路径安装（目录 / plugin.json / 本地 marketplace.json）。 */
export const kayingcodePluginsInstallLocalParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    path: nonEmptyString,
    scope: kayingcodePluginScopeSchema.optional(),
    dryRun: z.boolean().optional(),
    operationId: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodePluginsInstallLocalParams = z.infer<
  typeof kayingcodePluginsInstallLocalParamsSchema
>;
export const kayingcodePluginsCancelOperationParamsSchema = z
  .object({
    operationId: nonEmptyString,
  })
  .strict();
export type KayingCodePluginsCancelOperationParams = z.infer<
  typeof kayingcodePluginsCancelOperationParamsSchema
>;

export const kayingcodePluginsCancelOperationResultSchema = z
  .object({
    operationId: nonEmptyString,
    cancelled: z.boolean(),
  })
  .strict();
export type KayingCodePluginsCancelOperationResult = z.infer<
  typeof kayingcodePluginsCancelOperationResultSchema
>;
export const kayingcodePluginsUninstallParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString.optional(),
    pluginName: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
    removeCache: z.boolean().optional(),
  })
  .strict();
export const kayingcodePluginsInstallResultSchema = z
  .object({
    installedPlugins: z.array(kayingcodeInstalledPluginSummarySchema),
    dependencyClosure: z.array(z.string()),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
  })
  .strict();
export type KayingCodePluginsInstallResult = z.infer<typeof kayingcodePluginsInstallResultSchema>;

export const kayingcodePluginsUninstallResultSchema = z
  .object({
    removedPlugin: kayingcodeInstalledPluginSummarySchema.optional(),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
  })
  .strict();
export type KayingCodePluginsUninstallResult = z.infer<
  typeof kayingcodePluginsUninstallResultSchema
>;

export const kayingcodePluginsUpdateParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
  })
  .strict();
export const kayingcodePluginsRestoreBuiltinParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString,
  })
  .strict();
export const kayingcodePluginsRestoreBuiltinResultSchema = z
  .object({
    pluginId: nonEmptyString,
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
  })
  .strict();
export type KayingCodePluginsRestoreBuiltinResult = z.infer<
  typeof kayingcodePluginsRestoreBuiltinResultSchema
>;

export const kayingcodePluginsConfigureParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString,
    options: jsonObjectSchema,
    clearOptionKeys: z.array(nonEmptyString).optional(),
    scope: kayingcodePluginScopeSchema.optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();
export const kayingcodePluginsConfigureResultSchema = z
  .object({
    pluginId: nonEmptyString,
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
  })
  .strict();
export type KayingCodePluginsConfigureResult = z.infer<
  typeof kayingcodePluginsConfigureResultSchema
>;

export const kayingcodePluginsResetConfigParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginId: nonEmptyString,
    scope: kayingcodePluginScopeSchema.optional(),
  })
  .strict();
export type KayingCodePluginsResetConfigParams = z.infer<
  typeof kayingcodePluginsResetConfigParamsSchema
>;

export const kayingcodePluginsValidateParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginName: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
    source: nonEmptyString.optional(),
  })
  .strict();
export const kayingcodePluginsValidateResultSchema = z
  .object({
    ok: z.boolean(),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema),
    compatibility: z
      .object({
        runnable: z.array(z.string()),
        diagnosticOnly: z.array(z.string()),
        unsupported: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export type KayingCodePluginsValidateResult = z.infer<typeof kayingcodePluginsValidateResultSchema>;

// plugins/describe：按需枚举单个插件的组件「名称 + 描述」。
// 已安装插件读本地缓存目录；未安装候选按需解析/临时 clone 源后枚举再清理。
export const kayingcodePluginsDescribeParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema,
    pluginName: nonEmptyString,
    marketplace: nonEmptyString,
  })
  .strict();
export const kayingcodePluginsDescribeResultSchema = z
  .object({
    components: z.array(kayingcodePluginComponentGroupSchema),
    diagnostics: z.array(kayingcodePluginDiagnosticSchema).optional(),
    // 插件包内 plugin.json 的展示性回退字段；未安装候选详情页信息区在商店 listing 缺失时兜底。
    metadata: z
      .object({
        author: z.string().optional(),
        authorUrl: z.string().optional(),
        homepage: z.string().optional(),
        version: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KayingCodePluginsDescribeResult = z.infer<typeof kayingcodePluginsDescribeResultSchema>;

export const kayingcodeAutomationScheduleRuleSchema = z
  .object({
    unit: z.enum(["minute", "hourly", "daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().positive(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    anchorAt: z.number().int(),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    monthDays: z.array(z.number().int().min(1).max(31)).optional(),
    /** yearly 用：1-12 人类月份。缺省回退 anchorAt 的月份（兼容未写该字段的旧记录）。 */
    months: z.array(z.number().int().min(1).max(12)).optional(),
    monthlyMode: z.enum(["date", "weekday"]).optional(),
  })
  .strict();
export type KayingCodeAutomationScheduleRuleProtocol = z.infer<
  typeof kayingcodeAutomationScheduleRuleSchema
>;

/** 会话侧长间隔周期 carrier 的 unit 枚举（与 scheduleRule.unit 同集）。 */
export const kayingcodeAutomationIntervalUnitSchema = z.enum([
  "minute",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const kayingcodeAutomationProtocolSchema = z
  .object({
    automationId: nonEmptyString,
    title: z.string(),
    cronExpr: nonEmptyString,
    prompt: nonEmptyString,
    modelSelection: modelSelectionSchema.optional(),
    mode: kayingcodeTaskModeSchema.optional(),
    targetTaskId: nonEmptyString.optional(),
    enabled: z.boolean(),
    lifecycleStatus: z.enum(["active", "completed", "failed", "paused"]),
    nextRunAt: timestampMsSchema.optional(),
    lastRunAt: timestampMsSchema.optional(),
    runCount: z.number().int().nonnegative(),
    recurring: z.boolean(),
    maxRuns: z.number().int().positive().optional(),
    // 自定义重复规则；缺省时调度回退到解析 cronExpr。会话卡片必须读到本字段才能展示
    // cron 无法表达的真实间隔（如每50小时、每40天，兼容 cronExpr 只是 0 * * * *）。
    scheduleRule: kayingcodeAutomationScheduleRuleSchema.optional(),
  })
  .strict();
export type KayingCodeAutomationProtocol = z.infer<typeof kayingcodeAutomationProtocolSchema>;

export const kayingcodeAutomationCreateParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    title: z.string().optional(),
    cronExpr: nonEmptyString,
    relativeDelayMinutes: z.number().int().positive().max(525_600).optional(),
    prompt: nonEmptyString,
    modelSelection: modelSelectionSchema.optional(),
    mode: kayingcodeTaskModeSchema.optional(),
    targetTaskId: nonEmptyString.optional(),
    botDeliveryTarget: kayingcodeAutomationBotDeliveryTargetSchema.optional(),
    recurring: z.boolean().optional(),
    maxRuns: z.number().int().positive().optional(),
    // 会话侧自定义重复 carrier：每 N 分钟/小时/天/周/月/年均通过此字段归一化为权威 scheduleRule，
    // cronExpr 仅作合法兼容展示。
    intervalUnit: kayingcodeAutomationIntervalUnitSchema.optional(),
    interval: z.number().int().min(1).max(200).optional(),
  })
  .strict()
  // intervalUnit 与 interval 必须配对提交（只传一个无法确定真实间隔）。
  .refine((input) => (input.intervalUnit === undefined) === (input.interval === undefined), {
    message: "intervalUnit and interval must be set together",
    path: ["interval"],
  })
  // 周期 carrier 与一次性相对延迟语义冲突，禁止同传。
  .refine((input) => input.intervalUnit === undefined || input.relativeDelayMinutes === undefined, {
    message: "intervalUnit cannot combine with a relative delayMinutes",
    path: ["intervalUnit"],
  })
  .refine((input) => input.intervalUnit === undefined || input.recurring !== false, {
    message: "intervalUnit is a recurring carrier and cannot combine with recurring=false",
    path: ["recurring"],
  })
  .refine((input) => input.intervalUnit === undefined || input.maxRuns === undefined, {
    message: "intervalUnit is a recurring carrier and cannot combine with maxRuns",
    path: ["maxRuns"],
  });
export type KayingCodeAutomationCreateProtocolParams = z.infer<
  typeof kayingcodeAutomationCreateParamsSchema
>;

export const kayingcodeAutomationCreateResultSchema = z
  .object({ automation: kayingcodeAutomationProtocolSchema })
  .strict();
export type KayingCodeAutomationCreateProtocolResult = z.infer<
  typeof kayingcodeAutomationCreateResultSchema
>;

export const kayingcodeAutomationUpdateParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    automationId: nonEmptyString,
    title: nonEmptyString.optional(),
    cronExpr: nonEmptyString.optional(),
    prompt: nonEmptyString.optional(),
    recurring: z.boolean().optional(),
    maxRuns: z.number().int().positive().nullable().optional(),
    // 会话侧自定义重复 carrier（同 create 侧语义）。
    intervalUnit: kayingcodeAutomationIntervalUnitSchema.optional(),
    interval: z.number().int().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.cronExpr !== undefined ||
      input.prompt !== undefined ||
      input.recurring !== undefined ||
      input.maxRuns !== undefined ||
      input.intervalUnit !== undefined,
    { message: "automation update requires at least one field" },
  )
  .refine((input) => input.maxRuns !== null || input.recurring === true, {
    message: "clearing maxRuns requires recurring=true",
    path: ["maxRuns"],
  })
  .refine((input) => input.recurring !== true || typeof input.maxRuns !== "number", {
    message: "recurring=true cannot be combined with a numeric maxRuns",
    path: ["maxRuns"],
  })
  // intervalUnit 与 interval 必须配对提交（同 create 侧语义）。
  .refine((input) => (input.intervalUnit === undefined) === (input.interval === undefined), {
    message: "intervalUnit and interval must be set together",
    path: ["interval"],
  })
  .refine((input) => input.intervalUnit === undefined || input.recurring !== false, {
    message: "intervalUnit is a recurring carrier and cannot combine with recurring=false",
    path: ["recurring"],
  })
  .refine(
    (input) =>
      input.intervalUnit === undefined ||
      input.maxRuns === undefined ||
      (input.maxRuns === null && input.recurring === true),
    {
      message:
        "intervalUnit is a recurring carrier and only allows maxRuns=null with recurring=true",
      path: ["maxRuns"],
    },
  );
export type KayingCodeAutomationUpdateProtocolParams = z.infer<
  typeof kayingcodeAutomationUpdateParamsSchema
>;
export const kayingcodeAutomationUpdateResultSchema = z
  .object({ automation: kayingcodeAutomationProtocolSchema })
  .strict();
export type KayingCodeAutomationUpdateProtocolResult = z.infer<
  typeof kayingcodeAutomationUpdateResultSchema
>;

export const kayingcodeAutomationListParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema.optional() })
  .strict();
export type KayingCodeAutomationListProtocolParams = z.infer<
  typeof kayingcodeAutomationListParamsSchema
>;
export const kayingcodeAutomationListResultSchema = z
  .object({ automations: z.array(kayingcodeAutomationProtocolSchema) })
  .strict();
export type KayingCodeAutomationListProtocolResult = z.infer<
  typeof kayingcodeAutomationListResultSchema
>;

export const kayingcodeAutomationCheckTaskBindingParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema.optional(), targetTaskId: nonEmptyString })
  .strict();
export type KayingCodeAutomationCheckTaskBindingProtocolParams = z.infer<
  typeof kayingcodeAutomationCheckTaskBindingParamsSchema
>;
export const kayingcodeAutomationCheckTaskBindingResultSchema = z
  .object({ bound: z.boolean() })
  .strict();
export type KayingCodeAutomationCheckTaskBindingProtocolResult = z.infer<
  typeof kayingcodeAutomationCheckTaskBindingResultSchema
>;

export const kayingcodeAutomationDeleteParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema.optional(), automationId: nonEmptyString })
  .strict();
export type KayingCodeAutomationDeleteProtocolParams = z.infer<
  typeof kayingcodeAutomationDeleteParamsSchema
>;
export const kayingcodeAutomationDeleteResultSchema = z.object({ deleted: z.boolean() }).strict();
export type KayingCodeAutomationDeleteProtocolResult = z.infer<
  typeof kayingcodeAutomationDeleteResultSchema
>;

// 执行轮自暂停（CronPauseSelf）：automationId 来自 CLI loop state，Host 只在当前 workspace
// 内做条件暂停（active 且 enabled 才转 paused）并回报是否生效。
export const kayingcodeAutomationPauseParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema.optional(), automationId: nonEmptyString })
  .strict();
export type KayingCodeAutomationPauseProtocolParams = z.infer<
  typeof kayingcodeAutomationPauseParamsSchema
>;
export const kayingcodeAutomationPauseResultSchema = z.object({ paused: z.boolean() }).strict();
export type KayingCodeAutomationPauseProtocolResult = z.infer<
  typeof kayingcodeAutomationPauseResultSchema
>;

// ---- Off-Peak（闲时任务）会话内创建协议----
// 与 automation 兄弟并列（独立域，禁止互相复用标记/表）。workspace 由 host 端从
// 当前 session 的已协商 workspace 注入。permissionMode 只开放产品
// 四档词表（D29-4）；缺省解析在 host 端（D49-4：yolo / allowed_models 末位 / 最高推理档）。
export const kayingcodeOffPeakPermissionModeSchema = z.enum([
  "build",
  "edit",
  "plan",
  "yolo",
  "guarded",
]);
export type KayingCodeOffPeakProtocolPermissionMode = z.infer<
  typeof kayingcodeOffPeakPermissionModeSchema
>;

export const kayingcodeOffPeakCreateParamsSchema = z
  .object({
    workspace: kayingcodeWorkspaceRefSchema.optional(),
    title: nonEmptyString,
    prompt: nonEmptyString,
    permissionMode: kayingcodeOffPeakPermissionModeSchema.optional(),
    model: nonEmptyString.optional(),
    thoughtLevel: nonEmptyString.optional(),
    // 会话内创建绑定当前会话（对齐 automation/create 的 targetTaskId），由 CLI 端口填入。
    boundSessionId: nonEmptyString.optional(),
  })
  .strict();
export type KayingCodeOffPeakCreateProtocolParams = z.infer<
  typeof kayingcodeOffPeakCreateParamsSchema
>;

// 协议侧任务快照：轮尾卡片与 OffPeakList 的最小字段面。
// 不暴露 serverTicketId（跨边界禁带）。
export const kayingcodeOffPeakTaskSnapshotSchema = z
  .object({
    offPeakTaskId: nonEmptyString,
    title: z.string(),
    status: z.enum(["queued", "paused", "running", "completed", "failed", "cancelled"]),
    queuePosition: z.number().int().positive().optional(),
    sessionId: nonEmptyString.optional(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type KayingCodeOffPeakTaskProtocolSnapshot = z.infer<
  typeof kayingcodeOffPeakTaskSnapshotSchema
>;

// 失败分类跨协议保真（镜像 shared OffPeakTaskCreateResult 的判别联合，错误不降级为字符串）。
// model 白名单预校失败复用 client_validation 分类 + errorCode "model_not_allowed"，不扩分类枚举。
export const kayingcodeOffPeakCreateResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), task: kayingcodeOffPeakTaskSnapshotSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      failureStage: z.enum(["client_validation", "ticket_request", "local_persist"]),
      errorCategory: z.enum([
        "client_validation",
        "eligibility_3101",
        "quota_3103",
        "network",
        "invalid_response",
        "local_persist",
        "unknown",
      ]),
      errorCode: z.string(),
    })
    .strict(),
]);
export type KayingCodeOffPeakCreateProtocolResult = z.infer<
  typeof kayingcodeOffPeakCreateResultSchema
>;

export const kayingcodeOffPeakListParamsSchema = z
  .object({ workspace: kayingcodeWorkspaceRefSchema.optional() })
  .strict();
export type KayingCodeOffPeakListProtocolParams = z.infer<typeof kayingcodeOffPeakListParamsSchema>;
export const kayingcodeOffPeakListResultSchema = z
  .object({ tasks: z.array(kayingcodeOffPeakTaskSnapshotSchema) })
  .strict();
export type KayingCodeOffPeakListProtocolResult = z.infer<typeof kayingcodeOffPeakListResultSchema>;

// Session 运行实例生命周期；不同于 session/stop（停止生成）。
export const sessionLifecycleParamsSchema = z.object({ sessionId: z.string().min(1) }).strict();
export const sessionLifecycleActivationParamsSchema = sessionLifecycleParamsSchema.extend({
  workspace: kayingcodeWorkspaceRefSchema.optional(),
});
export const sessionLifecycleStateSchema = z.enum([
  "unloaded",
  "starting",
  "ready",
  "stopping",
  "faulted",
]);
export const sessionLifecycleOperationSchema = z.enum(["ensureReady", "stop", "restart"]);
export const sessionLifecycleFailureSchema = z
  .object({
    operation: sessionLifecycleOperationSchema,
    code: z.string(),
    message: z.string(),
  })
  .strict();
export const sessionLifecycleSnapshotSchema = z
  .object({
    sessionId: z.string().min(1),
    state: sessionLifecycleStateSchema,
    generation: z.number().int().nonnegative().default(0),
    revision: z.number().int().nonnegative().default(0),
    lastError: sessionLifecycleFailureSchema.nullable(),
  })
  .strict();
export const sessionLifecycleResultSchema = z.object({ completed: z.literal(true) }).strict();
export type SessionLifecycleState = z.infer<typeof sessionLifecycleStateSchema>;
export type SessionLifecycleOperation = z.infer<typeof sessionLifecycleOperationSchema>;
export type SessionLifecycleFailure = z.infer<typeof sessionLifecycleFailureSchema>;
export type SessionLifecycleSnapshot = z.infer<typeof sessionLifecycleSnapshotSchema>;

export const kayingcodeProtocolMethods = {
  sessionLifecycleChanged: "session/lifecycle/changed",
  sessionLifecycleGetState: "session/lifecycle/getState",
  sessionLifecycleEnsureReady: "session/lifecycle/ensureReady",
  sessionLifecycleStop: "session/lifecycle/stop",
  sessionLifecycleRestart: "session/lifecycle/restart",
  runtimeCapabilities: "runtime/capabilities",
  computerUseOperationEvent: "computer-use/operation-event",
  sessionCreate: "session/create",
  sessionResume: "session/resume",
  sessionList: "session/list",
  sessionSubagents: "session/subagents",
  sessionRequestRuntimePreferences: "session/requestRuntimePreferences",
  subagentsReadRuntimeConfig: "subagents/readRuntimeConfig",
  sessionRead: "session/read",
  sessionMessages: "session/messages",
  sessionEvents: "session/events",
  sessionDebug: "session/debug",
  sessionSubscribe: "session/subscribe",
  // @deprecated（部分）：send 主路径已收敛 v4 sendText；仅剩 adapter 附件
  // 回退分支消费（v4 attachmentRef 上传/寄存命令面未建模），待附件命令面落地后移除。
  sessionSend: "session/send",
  // @deprecated：host 客户端方法已删（stop 已收敛 v4 stop 命令）。
  // wire case 留兼容（transport bypass 名单仍引用），随旧词整体删除时一并移除。
  sessionStop: "session/stop",
  // @deprecated：host 客户端方法已删（已收敛 v4 cancelBackgroundWork 命令）。
  // wire case 留兼容，随旧词整体删除时一并移除。
  sessionCancelBackgroundTask: "session/cancelBackgroundTask",
  // @deprecated：host 客户端方法已删（v4 forkAssistant 原生 handler 经
  // forkSessionAtMessage 钩子直调 server-operations.forkSession op）。wire case 与
  // fork params/result schema 保留＝op 存活面；fork record 归 v4 原生重写。
  sessionFork: "session/fork",
  sessionCompact: "session/compact",
  sessionGoal: "session/goal",
  sessionClose: "session/close",
  // setModel 仍被 kayingcodeSessionService 的 desktop 旧链路消费；replayable
  // switchModelConfig 已直接由目标 Environment Registry 解析 Selection。
  sessionSetModel: "session/setModel",
  // replayable facade 的思考深度/模式已收敛 v4 switchModelConfig/
  // switchCollaborationMode；剩余消费 = kayingcodeSessionService（desktop 旧链路，随
  // 桌面 v4 UI 收口清零）与 setMode 的 auto 值残留（v4 值域刻意排除 auto）。
  sessionSetThoughtLevel: "session/setThoughtLevel",
  sessionSetMode: "session/setMode",
  workspaceReadPresentation: "workspace/readPresentation",
  workspaceHookTrustGrant: "workspace/hooks/trustGrant",
  // 进程级 Account Provider Config 与 workspace 运行目录分离。
  providerUpdateAccountConfig: "provider/updateAccountConfig",
  providerRefreshRegistry: "provider/refreshRegistry",
  workspaceUpdateInteractionPreferences: "workspace/updateInteractionPreferences",
  workspaceUpdateModelIoPreferences: "workspace/updateModelIoPreferences",
  // Off-Peak 工具面门禁是 workspace 级事实（灰度 + 本地/远程），由 host 在 agent 就绪时同步；
  // CLI 对 legacy create/resume 与 v4 冷恢复统一读取。旧 CLI method-not-found → host 降级忽略。
  workspaceUpdateOffPeakToolPolicy: "workspace/updateOffPeakToolPolicy",
  // 动态工作流灰度门禁：同 Off-Peak 的同步模式。
  workspaceUpdateDynamicWorkflowPolicy: "workspace/updateDynamicWorkflowPolicy",
  // LLM 执行面在 CLI，直连不可行；消费仅 services 内部
  // （commit message），待 v4 workspace 查询/命令面覆盖后移除。
  workspaceGenerateText: "workspace/generateText",
  workspaceCancelGenerateText: "workspace/cancelGenerateText",
  providerTestModelConnectivity: "provider/testModelConnectivity",
  mcpList: "mcp/list",
  workspaceMcpTrust: "workspace/mcp/trust",
  mcpReadResource: "mcp/readResource",
  mcpUiOpenInstance: "mcp/uiOpenInstance",
  mcpUiCloseInstance: "mcp/uiCloseInstance",
  mcpUiValidateInstance: "mcp/uiValidateInstance",
  mcpUiSampling: "mcp/uiSampling",
  mcpUiCancelSampling: "mcp/uiCancelSampling",
  mcpUiCallTool: "mcp/uiCallTool",
  mcpUiCancelCall: "mcp/uiCancelCall",
  mcpUiReadResource: "mcp/uiReadResource",
  mcpUiListResources: "mcp/uiListResources",
  mcpUiListResourceTemplates: "mcp/uiListResourceTemplates",
  mcpUiSubscribeResource: "mcp/uiSubscribeResource",
  mcpUiUnsubscribeResource: "mcp/uiUnsubscribeResource",
  // App-Provided Tools：页面工具登记 / 注销，与模型调用的认领 / 回传（信箱投递走 v4 live 增量）。
  mcpUiRegisterAppTools: "mcp/uiRegisterAppTools",
  mcpUiUnregisterAppTools: "mcp/uiUnregisterAppTools",
  mcpUiClaimAppToolCall: "mcp/uiClaimAppToolCall",
  mcpUiResolveAppToolCall: "mcp/uiResolveAppToolCall",
  pluginsList: "plugins/list",
  pluginsReferenceCatalog: "plugins/referenceCatalog",
  pluginsListUiSurfaces: "plugins/listUiSurfaces",
  pluginsReferenceCatalogWithCategory: "plugins/referenceCatalogWithCategory",
  skillsReferenceCatalog: "skills/referenceCatalog",
  // 已保存工作流的 GUI 中枢：workspace 级、无会话。
  workflowsList: "workflows/list",
  workflowsGet: "workflows/get",
  workflowsUpdateMeta: "workflows/updateMeta",
  workflowsDelete: "workflows/delete",
  workflowsRuns: "workflows/runs",
  // 在项目档 / 全局档之间移动同名文件。
  workflowsMove: "workflows/move",
  // 完成卡的「直接保存」与「已保存」判定（docs/dynamic-workflow/transcript-and-notifications.md）：
  // 前者按 runId 从 journal 取脚本落盘，后者回答「这次 run 对应哪个已保存工作流」。
  workflowsSave: "workflows/save",
  workflowsForRun: "workflows/forRun",
  pluginsResolveSuggestedReference: "plugins/resolveSuggestedReference",
  pluginsSetEnabled: "plugins/setEnabled",
  pluginsOverview: "plugins/overview",
  pluginsLocalSourceAdd: "plugins/local-source/add",
  pluginsLocalSourceRemove: "plugins/local-source/remove",
  pluginsLocalSourceRefresh: "plugins/local-source/refresh",
  pluginsInstall: "plugins/install",
  pluginsInstallLocal: "plugins/installLocal",
  pluginsCancelOperation: "plugins/cancelOperation",
  pluginsUninstall: "plugins/uninstall",
  pluginsUpdate: "plugins/update",
  pluginsRestoreBuiltin: "plugins/restoreBuiltin",
  pluginsConfigure: "plugins/configure",
  pluginsResetConfig: "plugins/resetConfig",
  pluginsValidate: "plugins/validate",
  pluginsDescribe: "plugins/describe",
  tapMakerProjects: "tapmaker/projects",
  automationCreate: "automation/create",
  topicResourceRead: "topic/resource/read",
  channelReply: "bot/channel/reply",
  topicResourceCancel: "topic/resource/cancel",
  automationUpdate: "automation/update",
  automationCheckTaskBinding: "automation/checkTaskBinding",
  automationList: "automation/list",
  automationDelete: "automation/delete",
  automationPause: "automation/pause",
  // Off-Peak 会话内创建：与 automation 兄弟并列的独立方法族。
  offPeakCreate: "offPeak/create",
  offPeakList: "offPeak/list",
  // @deprecated：host 消费已清零（kayingcodeAgentService 改走 v4/usage/stats）。
  // 仅剩 CLI server 的 wire 兼容 case；随旧词整体删除时一并移除。
  usageStats: "usage/stats",
  // KayingCode Protocol 对 agent 只暴露 session-first 方法；task 是 UI 投影概念，不能泄露进协议方法名。
  // @deprecated：host 已改走 v4/conversation/usage；后续与 usage/stats 一并移除。
  sessionUsage: "session/usage",
  // 资源管理器：CLI 回报其 MCP 子进程 pid 与插件归属（纯内存，无 I/O），采样在 Host 侧完成。
  processChildProcesses: "process/childProcesses",
  processNetworkCapture: "process/networkCapture",
  interactionRequestPermission: "interaction/requestPermission",
  interactionRequestUserInput: "interaction/requestUserInput",
  interactionRequestProviderRuntimeHeaders: "interaction/requestProviderRuntimeHeaders",
  interactionRequestOfficialMcpAuthHeaders: "interaction/requestOfficialMcpAuthHeaders",
  // browser-use 反向请求由 agent 发起，host 转给 main 中的 CDP executor。
  interactionBrowserList: "interaction/browserList",
  interactionBrowserExecute: "interaction/browserExecute",
} as const;

export type KayingCodeProtocolMethod =
  (typeof kayingcodeProtocolMethods)[keyof typeof kayingcodeProtocolMethods];

export const kayingcodeProtocolEmptyResultSchema = z.object({}).strict();

// 最新 V4 主链已不再依赖旧版全量方法表；这里仅保留仍被兼容测试和 browser broker
// 消费的最小契约集合，避免重新引入已移除的 legacy 方法。
export const kayingcodeProtocolSessionMethodContracts = {
  [kayingcodeProtocolMethods.mcpUiOpenInstance]: {
    params: kayingcodeMcpUiOpenInstanceParamsSchema,
    result: kayingcodeMcpUiOpenInstanceResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiCloseInstance]: {
    params: kayingcodeMcpUiCloseInstanceParamsSchema,
    result: kayingcodeMcpUiCloseInstanceResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiValidateInstance]: {
    params: kayingcodeMcpUiCloseInstanceParamsSchema,
    result: kayingcodeMcpUiResourceSubscriptionResultSchema,
  },
  [kayingcodeProtocolMethods.workspaceHookTrustGrant]: {
    params: kayingcodeWorkspaceHookTrustGrantParamsSchema,
    result: kayingcodeWorkspaceHookTrustGrantResultSchema,
  },
  [kayingcodeProtocolMethods.workspaceMcpTrust]: {
    params: kayingcodeWorkspaceMcpTrustParamsSchema,
    result: kayingcodeWorkspaceMcpTrustResultSchema,
  },
  [kayingcodeProtocolMethods.mcpList]: {
    params: kayingcodeMcpListParamsSchema,
    result: kayingcodeMcpListResultSchema,
  },
  [kayingcodeProtocolMethods.mcpReadResource]: {
    params: kayingcodeMcpReadResourceParamsSchema,
    result: kayingcodeMcpReadResourceResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiSampling]: {
    params: kayingcodeMcpUiSamplingParamsSchema,
    result: kayingcodeMcpUiSamplingResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiCancelSampling]: {
    params: kayingcodeMcpUiCancelSamplingParamsSchema,
    result: kayingcodeMcpUiCancelCallResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiCallTool]: {
    params: kayingcodeMcpUiCallToolParamsSchema,
    result: kayingcodeMcpUiCallToolResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiCancelCall]: {
    params: kayingcodeMcpUiCancelCallParamsSchema,
    result: kayingcodeMcpUiCancelCallResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiReadResource]: {
    params: kayingcodeMcpUiReadResourceParamsSchema,
    result: kayingcodeMcpUiReadResourceResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiListResources]: {
    params: kayingcodeMcpUiListResourcesParamsSchema,
    result: kayingcodeMcpUiListResourcesResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiListResourceTemplates]: {
    params: kayingcodeMcpUiListResourcesParamsSchema,
    result: kayingcodeMcpUiListResourceTemplatesResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiSubscribeResource]: {
    params: kayingcodeMcpUiResourceSubscriptionParamsSchema,
    result: kayingcodeMcpUiResourceSubscriptionResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiUnsubscribeResource]: {
    params: kayingcodeMcpUiResourceSubscriptionParamsSchema,
    result: kayingcodeMcpUiResourceSubscriptionResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiRegisterAppTools]: {
    params: kayingcodeMcpUiRegisterAppToolsParamsSchema,
    result: kayingcodeMcpUiRegisterAppToolsResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiUnregisterAppTools]: {
    params: kayingcodeMcpUiUnregisterAppToolsParamsSchema,
    result: kayingcodeMcpUiUnregisterAppToolsResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiClaimAppToolCall]: {
    params: kayingcodeMcpUiClaimAppToolCallParamsSchema,
    result: kayingcodeMcpUiAppToolAcceptedResultSchema,
  },
  [kayingcodeProtocolMethods.mcpUiResolveAppToolCall]: {
    params: kayingcodeMcpUiResolveAppToolCallParamsSchema,
    result: kayingcodeMcpUiAppToolAcceptedResultSchema,
  },
  [kayingcodeProtocolMethods.interactionBrowserList]: {
    params: kayingcodeBrowserListParamsSchema,
    result: kayingcodeBrowserListResultSchema,
  },
  [kayingcodeProtocolMethods.interactionBrowserExecute]: {
    params: kayingcodeBrowserExecuteParamsSchema,
    result: kayingcodeBrowserExecuteResultSchema,
  },
} as const satisfies Partial<
  Record<KayingCodeProtocolMethod, { params: z.ZodTypeAny; result: z.ZodTypeAny }>
>;

export type KayingCodeProtocolSessionMethodContract =
  (typeof kayingcodeProtocolSessionMethodContracts)[keyof typeof kayingcodeProtocolSessionMethodContracts];

// 启动入口的独立存储命令与严格结果 schema，和 CLI 共用一份契约。
export {
  STORAGE_MIGRATION_COMMAND,
  storageMigrationReportSchema,
} from "../sqlite-migrations/contract.js";

/** 仅存储准备子进程的私有控制帧，原始路径不进入业务事件或遥测。 */
export const kayingcodeStoragePreparationFrameSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("startup/storagePath"),
      params: z.object({ path: z.string().min(1).max(32768) }).strict(),
    })
    .strict(),
  z
    .object({ method: z.literal("startup/storagePrepared"), params: z.object({}).strict() })
    .strict(),
  z
    .object({
      method: z.literal("startup/storageState"),
      params: kayingcodeStorageStartupStateSchema,
    })
    .strict(),
]);
export const kayingcodeStoragePathReadySchema = z
  .object({ method: z.literal("startup/storagePathReady"), reuse: z.boolean().optional() })
  .strict();

// 桌面本地 TTFT 的严格事实合同；检查点不能替代实际内容帧。
export { localTtftFactsSchema } from "../local-ttft/contract.js";
export * from "../tapmaker-projects.js";
// 群来源由可信 Host 注入，V4 命令与持久化输入使用相同运行时校验。
export {
  botIdentitySchema,
  botTopicInputMessageSchema,
  botGroupInputSourceSchema,
  type BotGroupInputSource,
} from "../bots.js";
export {
  botTopicContextSchema,
  botTopicMessageSchema,
  type BotTopicHistoryBatch,
  type BotTopicMessage,
} from "../bots.js";
