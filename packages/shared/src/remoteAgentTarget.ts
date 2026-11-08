import {
  stripRemoteTargetSecrets,
  type RemoteTarget,
  type SSHConnectOptions,
} from "./remoteTarget.js";

/** 远程 Agent 只复用 SSH 身份认证字段，不携带受管部署的资源安装策略。 */
export type RemoteAgentSshTarget = Pick<
  SSHConnectOptions,
  | "host"
  | "port"
  | "username"
  | "sshConfigAlias"
  | "password"
  | "privateKeyPath"
  | "privateKeyPassphrase"
>;

/**
 * 已独立运行的 Agent Server。它与会部署/启动 Agent 的 RemoteTarget 保持类型隔离。
 * MVP 仅允许经 SSH tunnel 到达远端 loopback Core。
 */
export interface RemoteAgentTarget {
  kind: "server";
  transport: "ssh-tunnel";
  /** 可选固定端口；未提供时从默认 Server Supervisor 状态发现当前 Core 端口。 */
  serverPort?: number;
  ssh: RemoteAgentSshTarget;
}

export type WorkspaceConnectionTarget = RemoteTarget | RemoteAgentTarget;

export function stripRemoteAgentTargetSecrets(target: RemoteAgentTarget): RemoteAgentTarget {
  const { password: _password, privateKeyPassphrase: _privateKeyPassphrase, ...ssh } = target.ssh;
  return { ...target, ssh };
}

export function stripWorkspaceConnectionTargetSecrets(
  target: WorkspaceConnectionTarget,
): WorkspaceConnectionTarget {
  return target.kind === "server" && "ssh" in target
    ? stripRemoteAgentTargetSecrets(target)
    : stripRemoteTargetSecrets(target);
}
