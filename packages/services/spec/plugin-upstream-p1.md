# 扩展网关与 App 会话控制（上游 3.18 P1）

## 范围

- 移植 `packages/services/src/app-control`：App 会话控制 facade，按 Host 连接与项目归属重建可信作用域。
- 移植 `packages/services/src/extensions`：扩展门面、能力网关、授权记录、静态表读取、会话读镜像与各后端。
- 提供 `createWindowHostExtensions`、`getPluginUserOptionsReader` 与插件管理变更信号；扩展进程与 Main 监管器在 P2 接入。

## 状态所有权

- `AppControlService`：`createLocalServices` 创建一次，经 `onAppControlServiceCreated` 交给进程内可信组件；不注册进 `ServiceCollection`，不出现在 RPC 上。
- 会话事实仍是 CLI/`IKayingCodeAgentService` 的 owner；app-control 只经既有 V4 命令准入与只读接口，不新增输入队列、不直接写 CLI 数据库。
- 扩展静态表、授权记录与视图/订阅状态由 `createWindowHostExtensions` 持有；每个扩展连接以 `extension-host:<gen>:<pluginId>` 作为 fence，客户端 id 为 `extension:<pluginId>`。
- 插件 user 层设置读取器放在 `WeakMap<ServiceCollection, PluginUserOptionsReader>`，只在本机 Window Host 进程内取用；不挂在任何服务对象上。
- 插件管理变更信号来自 `IPluginManagementService` 的成功返回，dryRun 不触发；扩展网关据此重读静态表。

## 产品适配

- 复用本地 `IKayingCodeAgentService` / `KayingCodeAgentWorkspaceTarget` / `KayingCodeTaskServiceAdapter`，不引入第二套 Agent 或会话服务。
- app-control 的 discovery 目录、创建回执与 fork 预留在 P1 未接线（依赖接口保持 optional）；创建走本地 `IProjectService.prepareSession`，重试在缺少回执时按现有创建路径处理。
- 插件查询协议名沿用上游 `plugins/readUserOptions`、`plugins/mentionItems`；CLI handler 在 P3 接线前返回 method-not-found，客户端按 `supported: false` 降级。
- 扩展视图沙箱使用 `contentKind: "extension"`：不填 `sessionId` 与 `serverName`，必须带 `pluginId`；MCP App 与 Gen UI 的会话要求保持不变。
- 品牌目录与市场 ID 继续使用 `kayingcode-plugins-official`；本阶段不替换内置插件。

## 验收

- 能力网关：未知/未声明能力 `not-declared`、协议不匹配 `incompatible`、未授权 `not-granted`、入参非法 `invalid-input`；成功调用把插件身份与本代际传给后端。
- 订阅：授权撤销以一条 `not-granted` error 结束订阅；后端异常只回稳定 `internal` 文案，不泄漏路径或远端地址。
- 授权记录：只授予清单当前声明的档位；声明变多回到 needs-consent 并中止在途调用；撤销删除记录。
- 会话后端：换代后迟到的调用结果按 `cancelled` 丢弃；断开调用 `abortAll` 中止在途调用；撤销授权拒绝；每插件 wait 上限 4；写动作结束写一行审计。
- app-control：commandId 对同一 caller/request 稳定、对不同 caller 分离；远端创建要求 canonical identity，身份漂移报 `conflict`。
- 根 typecheck、lint（0 errors）、source:check、architecture:check --changed 通过。

## 非目标

- 不启动 extension host 进程、不接 Main supervisor、不注册桌面 Renderer 频道（P2/P4）。
- 不实现 session-control CLI/App adapter 与模型 `session/*` 工具（P3）。
- 不迁移插件市场内容或删除本地插件（P5）。
