import type { RemoteProjectHost } from "@/project-sidebar/contract.js";

export function remoteHostLabel(host: RemoteProjectHost): string {
  const target = host.target;
  if (!target) return host.id;
  switch (target.kind) {
    case "ssh":
      return `${target.username}@${target.host}`;
    case "docker":
      return target.container;
    case "wsl":
      return target.distro || "WSL";
    case "server":
      // 本地 shared 保留 Remote Agent 服务器变体（serverName），上游快照只有 name/url；
      // 两种 server 目标都必须能显示设备名，不能用 kind 分支直接假设 url 字段存在。
      return "url" in target
        ? target.name || target.url
        : target.serverName || `${target.ssh.username}@${target.ssh.host}`;
  }
}
