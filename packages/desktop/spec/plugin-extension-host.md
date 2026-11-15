# 扩展宿主进程与 Main 监管器（上游 3.18 P2）

## 产品规则

- 全 App 只有一个 extension host utility process；扩展代码在进程内按插件动态 import，不与 Main/Window Host 共享进程。
- Main 的 `extensionHostSupervisor` 是进程生命周期、日志环形缓冲与崩溃预算的唯一 owner；Window Host 只转发状态与牵线端口。
- 首个 Window Host 服务就绪（`extension-host/window-ready`）后才拉起扩展进程；同一时刻只给一个 Window Host 牵线，Host 退出后切到下一个。
- 崩溃恢复：5 分钟内最多自动重启 3 次，退避 1s/2s/4s；第 4 次崩溃停止并推 `stopped`。计划重启/重新加载不计入预算。
- 扩展进程每 5 秒探活一次，连续 3 次无响应判为卡死并 kill，按不响应原因进入预算。
- 环境变量按白名单传递；代理、No Proxy 与自定义 CA 只来自设置页，不继承 Main 的环境凭据。进程标签使用 `KAYINGCODE_PROCESS_LABEL=extension-host`。
- 日志：进程 stdout/stderr 与扩展日志统一进 Main 环形缓冲（最多 `EXTENSION_LOG_BUFFER_LIMIT` 条，seq 连续），同时推给已就绪 Window Host；`logs-request` 按 `sinceSeq` 返回快照。
- 退出：Main 退出时先发送 `extension-host/dispose`，1.5 秒后强杀；扩展进程不在服务器 Host、远程 workspace 或手机白名单中启动或暴露。

## 状态所有者

- Main supervisor：进程代际 `gen`、崩溃时间窗、探活、日志缓冲、Window Host 配对。
- 扩展进程：已激活扩展的注册表、每个扩展的激活事务与贡献表；不读 plugin.json 的静态表 owner 仍是 Window Host 的 extensions service。
- Window Host：扩展静态表、授权、视图/订阅与 AppControl facade；P2 只负责把三个扩展服务注册到本机 Host 并在就绪后 announce。

## 接口

- `createExtensionHostSupervisor({ logger, readNetworkSettings? })` → `{ trackWindowHost(host), dispose() }`。
- 进程消息：`extension-host/init|attach-window|dispose|probe`（Main → 子进程）、`extension-host/ready|probe-ack|log|request-restart`（子进程 → Main）、`extension-host/pair|status|logs|logs-snapshot`（Main → Window Host）。
- Window Host：`createWindowHostExtensions` 注册 `IExtensionsService`、`IExtensionViewsService`、`IExtensionGrantsService`，并调用 `announceReady()`。
- 构建：新增 `extension-host/index` tsup 入口与 `tsconfig.extension-host.json`；MCP client/server SDK 内联进扩展进程产物。

## 验收

- 首个 window-ready 拉起一次进程；ready 后给该 Host 牵线一个端口。
- 崩溃后按退避重启；超过预算停止并推 `stopped`；计划重启不占预算。
- 环境白名单不携带遥测/账号变量；设置页代理/CA 生效。
- 日志请求返回连续 seq 快照。
- 根 typecheck、lint、source:check、architecture:check --changed 通过。

## 非目标

- 不接 extension-slots UI、不注册 Renderer 扩展频道（P4）。
- 不实现 session-control CLI/App adapter 与模型会话工具（P3）。
- 不替换内置插件或市场内容（P5）。
