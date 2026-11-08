# Agent Gateway 模块合同

无产品状态的 HTTP/WS RPC ingress。Web Host（`packages/server` 装配）与 Agent Node
（`packages/zcode-server-cli` Server Core）共用同一实现，不再各自维护
`/ws`、`/ws/host`、host capability 与连接 scope 语义。

## 拥有（owns）

- `clientMode → connection scope role` 的唯一映射：`web-remote-replayable → terminal-client`，
  `desktop-continuous → trusted-host-relay`；调用方无法从参数或 header 升级信任角色。
- `/ws`（永远 replayable + terminal-client）、`/ws/host`（必须消费一次性 capability，
  永远 continuous + trusted-host-relay）、`/api/rpc-host-capability`（签发）、
  `/api/server-info`（按注入事实返回）四条路由的注册与语义。
- host capability store：TTL（默认 30s）、单次消费（成功/过期/重放都先删除）、过期清扫。
- 每连接生命周期：`SocketProtocol → ChannelServer`、connection scope（含
  `IProviderProvisioningTargetService` 对非 desktop 客户端的拒绝桩）、close 时
  dispose scope + raw server，连接登记表支撑 `activeConnectionCount()`。
- 有界关闭：close frame → drain 窗口 → terminate → scope dispose → wss close。

## 不拥有（must-not-own）

- task/session 业务状态、Agent runtime、Supervisor、身份数据库。
- 部署策略：loopback 限制、bearer token、静态资源、`/api/connect-remote`、
  remote bridge 路由——这些留在宿主；宿主自定义 WS 路由必须经
  `attachWebSocket()` 进入，不得绕过 clientMode 映射。
- server-info 事实（serverId/generation/workspaces/capabilities）由宿主构建后注入。

## 不变量

1. 同一连接内 clientMode/role 不可被客户端伪造：scope context 由 gateway 写入。
2. capability 无论成功、过期还是重放都单次消费；首次且 TTL 内的消费才获得
   trusted-host role。
3. connectionId = `${connectionIdPrefix}(${randomUUID})`，永不复用。
4. `close()` 在 drain 预算内有界完成；HTTP server 的 close 由宿主负责，两者配合
   不得出现悬挂 socket。
5. 自定义 WS 接入也必须经 `attachWebSocket` 固定 clientMode/role 并建立连接 scope；
   terminal-client 不得升级为 trusted-host-relay，Provider provisioning 写入口只对 Desktop trusted host 开放。
   旧 Node 移动 ingress/catalog/grant 已退役；现用 Web 的授权与 viewer 写入限制由 Host 会话边界实施。
