import { z } from "zod";
import { REMOTE_ASSET_INSTALL_MODES } from "@zcode/shared";

export const text = z.string().trim().min(1);
const sshEndpointSchema = z
  .object({
    host: text,
    port: z.number().int().min(1).max(65535).optional(),
    username: text,
    sshConfigAlias: z.string().optional(),
    privateKeyPath: z.string().optional(),
    passwordCredentialKey: text.optional(),
    privateKeyPassphraseCredentialKey: text.optional(),
  })
  .strict();
const remoteAgentTargetSchema = z
  .object({
    // 兼容历史 RemoteAgentTarget：固定 SSH tunnel，不带 url；serverId 在早期版本可缺省。
    kind: z.literal("server"),
    transport: z.literal("ssh-tunnel"),
    serverPort: z.number().int().min(1).max(65535).optional(),
    serverId: text.optional(),
    serverName: text.optional(),
    ssh: sshEndpointSchema,
  })
  .strict();
const serverTargetSchema = z
  .object({
    kind: z.literal("server"),
    url: z.url(),
    name: text.optional(),
    workspacePath: text.optional(),
    serverId: text.optional(),
    tokenCredentialKey: text.optional(),
  })
  .strict();
export const targetSchema = z.union([
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("ssh"),
        host: text,
        username: text,
        port: z.number().int().min(1).max(65535).optional(),
        sshConfigAlias: z.string().optional(),
        privateKeyPath: z.string().optional(),
        passwordCredentialKey: text.optional(),
        privateKeyPassphraseCredentialKey: text.optional(),
        assetInstallMode: z.enum(REMOTE_ASSET_INSTALL_MODES).optional(),
        resourcePackages: z
          .object({ selectedPackageIds: z.array(z.string()).optional() })
          .strict()
          .optional(),
      })
      .strict(),
    z.object({ kind: z.literal("wsl"), distro: text.optional(), user: text.optional() }).strict(),
    z.object({ kind: z.literal("docker"), container: text }).strict(),
  ]),
  serverTargetSchema,
  remoteAgentTargetSchema,
]);
export const rootSchema = z
  .object({ rootPath: text, position: z.number().int().nonnegative(), isPrimary: z.boolean() })
  .strict();
export const cacheSchema = z
  .object({
    projectId: text,
    name: text,
    roots: z.array(rootSchema),
    deleted: z.boolean().optional(),
  })
  .strict()
  .refine(
    ({ roots }) =>
      new Set(roots.map((root) => root.rootPath)).size === roots.length &&
      (roots.length === 0 || roots.filter((root) => root.isPrimary).length === 1),
    "remote-project.invalid-roots",
  );
