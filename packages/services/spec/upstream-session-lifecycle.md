# 官方 Web 的会话生命周期服务

官方 3.17.2 Web 的 conversation transport 在订阅前使用 getSessionLifecycle / ensureSessionReady / stopSessionRuntime / restartSessionRuntime 和 onDynamicSessionLifecycle。当前 CLI 与 ProtocolClient 已提供严格协议，但 Host Agent 服务丢失了转发面，导致官方聊天页 Event not found 并无法订阅。

恢复上游服务契约及通知分发；状态唯一 owner 仍为 CLI SessionLifecycleController，不从 UI、timer 或快照猜测 lifecycle，不增加状态副本。get 使用既有只读 client，activation 使用既有 getClient + canonical workspaceRef。scope 在 stopping 时只清对应会话的订阅 owner 与 pending ACK，并拒绝迟到 ACK；不清同 workspace 的其他会话与 sessions-index。dispose 撤销 scope 的事件订阅。只支持当前协议，不为旧 CLI 增加方法缺失回退。

验证：ProtocolClient 生命周期测试、scope stopping/dispose 测试、实际官方 Web 读取已有会话及刷新恢复，desktop-continuous 原订阅测试与根类型检查。

## 验证记录（2026-11-05）

- `upstreamSessionLifecycle.test.ts` 通过：生命周期转发到唯一 owner；stopping 只清理对应会话订阅；dispose 后事件不再送达且拒绝新订阅。
- 根 `pnpm run typecheck` 通过。
- 未执行：需要运行中 Desktop CDP 的官方 Web 会话读取与刷新恢复 E2E。
