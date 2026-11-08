// grant 固定的 workspace 目标：workspacePath 携带 grant 的 opaque workspaceId，
// 服务端 overrideWorkspaceTarget 会重写为 grant 真值（MOB-20），客户端无法也
// 无需得知 canonical path。独立成文件供连接与订阅两侧共用。
export interface RelayWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
}
