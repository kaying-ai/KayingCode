# 会话控制绑定（CLI / App）

## 规则

- App 会话：协议 app-server 仅对可写根（interactive/workflow_parent，无 parent）与 fork 注入 `createAppSessionControlBinding`；它把 12 个动作映射到 shared `appControl/*` 反向 RPC，不建 App runtime、不缓存、不重跑 App 用例。
- App 调用必须带根会话、workspace、当前 `toolCallId`；取消只发 `appControl/cancel` 释放观察，不发 interrupt。
- Host 侧 `createAppControlReverseRpc` 在 chat lane 的 CLI 连接上处理反向请求；`bind` 用同一连接的持久 `session/list` 事实核对 caller 根会话与 workspace，连接换代/断开后旧调用 `forbidden`。
- 独立 CLI/TUI：`standaloneSessionControl: true` 时创建本进程 `CliSessionControlRuntime`；根会话用 CLI binding（`readAnyLocalSession: true`），后台根共用询问通道但固定 build 权限，不继承 yolo/审批结果。
- standalone 只允许独立本地 CLI 根：已有显式 `sessionControl`、parent 或 workspaceIdentity 时启动失败。

## 状态所有者

- App 会话事实与组织态：Host 的 AppControlService / 项目服务。
- 独立 CLI 根：本进程 `CliSessionControlRuntime` 与 session store；关闭时先等后台根中断落盘，再关闭发起会话。
- 模型工具身份：CLI tool runtime 注入，不由模型或 JSON 决定。

## 验收

- App binding 构造不触达 transport/runtime，暴露 12 个动作；错根/错 workspace/缺 toolCallId 被拒。
- standalone runtime 暴露 8 个共有动作，未 attach 根时调用报 `unavailable`，close 可重复。
- 回归：bootstrap `session-control` 与 `cli-session-control` contract 2/2；core session-control 24/24。

## 非目标

- 不在 CLI 建立第二套 App runtime、产品队列或缓存。
- 不把客户端类调用方暴露给模型工具；客户端类只由 Host 扩展网关构造。
