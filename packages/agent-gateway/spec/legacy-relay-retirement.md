# Gateway 退役旧 Node Relay

Gateway 仅保留现用 HTTP/WebSocket RPC ingress、clientMode 到 role 映射与单次 Host capability。移除旧 Node control、配对、provider 管理转发和双腿 attachment 适配器及其公开导出。Web Host 不再读取旧 Relay 环境变量或提供配对接口；新远控复用 Desktop Host attachment。任务与会话所有者、远端 stdio、SSH/WSL/Docker 接入和恢复语义不变。完整规则见 `packages/shared/spec/legacy-relay-retirement.md`。
