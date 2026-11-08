import { z } from "zod";
import { compatibilityManifestSchema } from "./source-server/compatibility.js";
export {
  buildRemoteAgentWorkspaceIdentity,
  parseRemoteAgentWorkspaceIdentity,
} from "./remote-workspace-identity.js";

export const SERVER_REMOTE_PROTOCOL_VERSION = 2;

export const serverRemoteCapabilitySchema = z
  .object({
    desktopContinuous: z.literal(true),
    /** v1 Source Server 可不声明这些 v2 扩展能力。 */
    trustedHostCapability: z.literal(true).optional(),
    workspaceCatalog: z.literal(true).optional(),
    conversationV4: z.boolean().optional(),
    attachmentChunkUpload: z.boolean().optional(),
    file: z.boolean().optional(),
    git: z.boolean().optional(),
    terminal: z.boolean().optional(),
    providerSettings: z.boolean().optional(),
    browserControl: z.boolean().optional(),
    cua: z.boolean().optional(),
    automationScheduler: z.boolean().optional(),
    websocketRpc: z.literal(true),
    virtualProjects: z.literal(true).optional(),
    // 旧 Server 缺少新增 dynamic event，必须先声明能力再订阅，避免异常打进对端读循环。
    processResourceTelemetry: z.boolean().optional(),
    remoteConversationTelemetry: z.boolean().optional(),
  })
  .strict();

export const serverRemoteWorkspaceInfoSchema = z
  .object({
    workspaceId: z.string().trim().min(1),
    path: z.string().trim().min(1),
    label: z.string().trim().min(1),
    workspaceIdentity: z.string().trim().min(1),
    access: z.enum(["read-write", "read-only"]),
  })
  .strict();

export const serverRemoteInfoSchema = z
  .object({
    serverId: z.string().trim().min(1),
    instanceGeneration: z.number().int().nonnegative().optional(),
    name: z.string().trim().min(1).optional(),
    version: z.string().trim().min(1),
    protocolVersion: z.literal(SERVER_REMOTE_PROTOCOL_VERSION),
    minimumClientProtocolVersion: z.literal(SERVER_REMOTE_PROTOCOL_VERSION).optional(),
    authRequired: z.boolean(),
    auth: z
      .object({
        methods: z.array(z.enum(["ssh-tunnel", "bearer-token"])).min(1),
        tlsRequired: z.boolean(),
      })
      .strict()
      .optional(),
    workspaces: z.array(serverRemoteWorkspaceInfoSchema),
    compatibility: compatibilityManifestSchema.strip().optional(),
    // 上游 server-core 在迁移失败时随握手返回计数；strict schema 必须显式接受。
    migration: z.object({ failedPathCount: z.number().int().nonnegative() }).optional(),
    // Source Server 握手身份；旧 server-core 不返回，按可选处理。
    identity: z
      .object({
        osUser: z.string().trim().min(1),
        hostname: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    capabilities: serverRemoteCapabilitySchema,
  })
  .strict();

export const serverRemoteWorkspaceInfoOutputSchema = serverRemoteWorkspaceInfoSchema;

const serverRemoteInfoBaseShape = {
  serverId: z.string().trim().min(1),
  instanceGeneration: z.number().int().nonnegative().optional(),
  name: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1),
  protocolVersion: z.literal(SERVER_REMOTE_PROTOCOL_VERSION),
  minimumClientProtocolVersion: z.literal(SERVER_REMOTE_PROTOCOL_VERSION).optional(),
  authRequired: z.boolean(),
  auth: z
    .object({
      methods: z.array(z.enum(["ssh-tunnel", "bearer-token"])).min(1),
      tlsRequired: z.boolean(),
    })
    .strict()
    .optional(),
};

export const serverRemoteInfoOutputSchema = z
  .object({
    ...serverRemoteInfoBaseShape,
    workspaces: z.array(serverRemoteWorkspaceInfoOutputSchema),
    compatibility: compatibilityManifestSchema.optional(),
    migration: z.object({ failedPathCount: z.number().int().nonnegative() }).strict().optional(),
    identity: z
      .object({
        osUser: z.string().trim().min(1),
        hostname: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    capabilities: serverRemoteCapabilitySchema,
  })
  .strict();

export const serverRemoteAnonymousInfoSchema = z.object({
  version: z.string(),
  protocolVersion: z.literal(SERVER_REMOTE_PROTOCOL_VERSION),
  authRequired: z.literal(true),
  compatibility: compatibilityManifestSchema.strip().optional(),
});

export type ServerRemoteWorkspaceInfo = z.infer<typeof serverRemoteWorkspaceInfoSchema>;

export type ServerRemoteInfo = z.infer<typeof serverRemoteInfoSchema>;

export type ServerRemoteAnonymousInfo = z.infer<typeof serverRemoteAnonymousInfoSchema>;

export const serverRemoteHostCapabilitySchema = z
  .object({
    capability: z.string().trim().min(1),
    expiresAt: z.number().int().positive(),
    instanceGeneration: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ServerRemoteHostCapability = z.infer<typeof serverRemoteHostCapabilitySchema>;
