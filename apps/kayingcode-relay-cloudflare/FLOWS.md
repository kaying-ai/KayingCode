# Relay 技术流程

**中文（默认）** | [English](FLOWS.en.md) · [总览](README.md) · [实现](IMPLEMENTATION.md) · [部署](DEPLOYMENT.md)

核对日期：2026-11-07。图中 Relay 指同一 WebRemoteRelayObject；Host 指桌面已有窗口 Host。

## 用户操作与自动处理

用户只需开启远控、扫码并使用工作台。身份注册、邀请领取、凭据保存、连接票据获取及重连均由客户端自动处理。下文技术消息不是要求用户手工执行的部署步骤。

## 1. 首次授权

```mermaid
sequenceDiagram
  participant D as Desktop 安全凭据/远控管理器
  participant R as Relay 账号与设备 owner
  participant W as 手机 Web adapter
  D->>D: 创建并先保存 owner secret
  D->>R: register(ownerSecret)，重试同 secret
  R-->>D: 同一 userId
  D->>R: owner Bearer 注册 device_mid
  R-->>D: 新 device_sid
  D->>R: owner Bearer 创建邀请
  R-->>D: 邀请（默认五分钟单次，可配置）
  D-->>W: /remote/v4?sid=…#authorize=… 完整链接
  W->>W: 先清除 URL fragment，保留 sid
  W->>R: POST account/claim(invitation)
  R->>R: 扣减邀请领取次数，存 terminal 凭据摘要
  R-->>W: 独立 terminal token，默认 30 天有效
  W->>W: 保存浏览器会话；再加载工作台
```

owner 注册按同一 secret 幂等，设备注册每次创建新 SID。邀请不是长期登录凭据；一次性 fragment 不再保留在页面历史中。浏览器已有有效会话时，重新打开已使用链接不会主动清掉旧会话。claim 失败会提供重新扫码提示。

## 2. 独立票据与握手

```mermaid
sequenceDiagram
  participant D as Desktop device
  participant R as Relay
  participant W as Web terminal
  D->>R: owner Bearer 申请 role=device token
  W->>R: terminal Bearer 申请 role=terminal token
  R-->>D: 60 秒单次 ticket
  R-->>W: 60 秒单次 ticket
  D->>R: ws2?token=…&mid=… upgrade
  W->>R: ws2?token=… upgrade
  R->>R: upgrade 前消费各 ticket，attachment 分配 lease
  D->>R: auth_init(device_sid, meta)
  R-->>D: auth_ack(waiting 或 matched)
  W->>R: auth_init(同一 device_sid)
  R->>R: 核对账户/SID，生成 terminal_sid
  R-->>W: auth_ack(matched)
  R-->>D: pair_status_ack(matched)
```

连接顺序可以反过来，第一端 waiting，第二端完成后 matched。ticket 在 upgrade 失败后也不能重用。鉴权成功但等待另一端，不等于设备或任务运行失败；先检查两端 role、SID、账户和 Desktop 是否仍在线。

## 3. 消息与业务恢复

```mermaid
sequenceDiagram
  participant W as 手机工作台
  participant R as Relay
  participant H as Desktop 已有 Host
  participant C as CLI/runtime
  W->>R: data(JSON RPC payload)
  R->>H: 转发外层 data，不持久化
  H->>C: 按原会话与 owner/lease 路由
  C->>C: CommandInbox admission / 运行 / 快照
  C-->>H: 会话事件
  H-->>R: web-remote-replayable 输出
  R-->>W: data
  W->>R: pair_status_query
  R-->>W: pair_status_ack
  Note over W,H: 网络中断后，新票据/握手；业务 snapshot/resync 仍向同一 Host 请求
```

Relay 不保存断线期间的数据。没有目标连接时返回 DEVICE_OFFLINE；不承诺重放或业务 exactly-once。手机恢复由 Host/runtime 的快照、顺序和 stale-run 防护完成。Desktop 原实时通道保持 desktop-continuous，不改成手机的恢复链路。

## 4. 换连接与撤销

```mermaid
sequenceDiagram
  participant N as 同 SID/角色的新 socket
  participant R as Relay
  participant O as 旧 socket
  N->>R: 新 ticket upgrade + auth_init
  R->>O: 先将 attachment.initialized=false
  R-->>O: KICKED + close(1008)
  R->>N: 保存新 lease 与配对资格
  R-->>N: auth_ack
  O-->>R: 迟到 close
  Note over R: 旧 close 不撤销新 socket 的配对
```

同 SID 不支持多 terminal 同时占用。terminal logout 删除当前凭据摘要并关闭同摘要连接；其他独立 terminal 凭据不因此全部注销。owner 删除设备时删除记录并关闭同 SID 两种角色连接。重连必须重新取票据并重新鉴权。

## 5. 构建到部署

```mermaid
flowchart TD
  P[upstream-web.json 固定官方 commit] --> G[Git 导出到 .cache/upstream-web]
  G --> B[账号 adapter / bootstrap / 品牌适配 + 核心哈希核验]
  E[KAYINGCODE_REMOTE_ORIGIN 构建环境] --> B
  B --> V[Vite base=/remote/ → packages/web/dist]
  V --> N[保存上游声明 + 当前产品声明 + manifest]
  N --> C[清空 public → 复制 public/remote，排除 sourcemap]
  C --> W[Wrangler 部署 Worker / ASSETS / DO binding]
  W --> A[HTTP 探针 + 真机扫码与会话验收]
```

改变外部 origin 需要重新构建 Web。部署不重建账号；使用同一服务配置与对象身份。页面、Worker 与静态资源应作为对应版本一起恢复，代码回退不等于 DO 数据恢复。
