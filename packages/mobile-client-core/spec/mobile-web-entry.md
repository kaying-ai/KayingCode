# 手机 Web 入口与资源隔离

网页入口版本为 1。`?relay&bot=<非敏感档案id>` 选择客户端本地存储 scope；fragment `v=1&pairing=<origin#pairingId#claimSecret>` 仅用于首次配对交接。未知入口版本在任何恢复/网络副作用前拒绝。网页消费 fragment 后立即 replaceState 清理；同一 Bot 的配对等待态可存 sessionStorage，配对成功后移除，长期凭据仅存该 scope 的 storage port。

scope 是本地档案维度，不授予任何服务端权限。默认无 bot 的独立浏览器入口保留原有 storage key；有 bot 时对凭据、设备身份、pending 账本、草稿和最近目标加统一前缀，不回退读取无 scope 的凭据。不导入 Flutter 原生 token。多个 origin 的授权仍由实际凭据 origin 与 Relay grant 裁决。

网络端口支持 AbortSignal，基础 AbortController 合并取消和有界网络期限；不依赖旧 WebView 缺失的 AbortSignal.any/timeout。取消和代际校验共同保证旧请求不能提交 UI。socket dispose 必须真实关闭数据 leg，重复 close/error 只通知一次。

附件上传/读取在等待 RPC 时也响应取消，不等待迟到 ACK 才退出。失败清理 best effort，不让 abort RPC 阻塞用户继续操作；取消后不发送下一块或提交。重开同一个 Bot 且 pairingId 未变时恢复网页凭据，新配对码则表达新的配对意图；本地只记非秘密的 origin/pairingId。

网页恢复不重放业务命令；沿用 CommandInbox 幂等与 pending 对账。V4 handshake 严格校验后才允许初始化，附件走现有受限 RPC 与 trusted connectionId，失败 abort，不开敏感文件/终端 channel。

`/compact`、`/goal pause`、`/goal resume` 与目标文本走现有专用命令，共用移动命令路由；其它 slash 原样提交。`/goals` 等不同名称不能按前缀误判。held queue 的输入明确选择保留/清空，并携带用户看到的 queueItemId 集合；并发变化由服务端拒绝后保留草稿。

## 桌面扫码 Web 通道修复（2026-11-05）

遵循 [跨端入口规范](../../desktop/spec/mobile-web-remote.md)：同时接受原始配对串及 Web v1 二维码；按 Bot 隔离网页凭据，网页唯一拥有配对和恢复，不并行建立原生连接。配置不可用时显式报错并允许重试。

本轮只支持最新 Web v1 二维码，不实现旧桌面相机 URL 的重定向、fragment 还原或 legacy scope。原始配对串仍是当前 Relay 管理与配对 API 的输入格式。

配对状态遵循 [共享状态契约](../../shared/spec/relay-pairing-status.md)：等待批准时 device=null 为正常状态，唯一轮询 owner 继续等待；拒绝/过期/已领取凭据明确终止。必须覆盖延迟批准场景，避免立即批准测试漏掉正常空设备状态。

## 验证记录（2026-11-05）

- `mobile-client-core` 全量 208 项通过，覆盖 V2 原始 URL 校验、v1 二维码 fragment、入口发现与取消。
- Taro H5 E2E 6 个场景通过：320/375px、深浅色、v1/v2 入口、刷新、错误/迟到事件、重试；V2 入口不请求 `/v1/client-config`、不 claim、不建 socket。
- Flutter `android test` 119 项通过：邀请 URL 只接受 HTTPS + 精确 `/remote/v4`，打开原始 URL 且不发现配置。
- 未执行：iOS/鸿蒙与真机 WebView；本轮只跑 Flutter 上游 3.35.5 的 Android 测试目标。

## 2026-11-05 V2 取代桌面 v1

桌面入口直接使用官方 /remote/v4?sid=...#authorize=<43字符一次性邀请>。解析为 KayingCode、webEntryVersion=2，App 只打开原始完整 URL，不发现或重建 v1 配对 fragment，不消费邀请或创建 socket。只允许 HTTPS、纯 origin authority 与精确 /remote/v4 路径，拒绝混入旧 hash/t 及无效授权。官方 ZCode 不带 authorize 的 URL 保持独立渠道。账号与恢复由官方 Web 及授权适配器拥有。

旧 KayingCode 配对/解除配对专用文案无消费方时移除；上游 V2 授权等待状态保留。公开合同注释以当前 URL/档案、OAuth/ws2 与投影/账本为准，不再宣告旧 Node 配对目录能力。
