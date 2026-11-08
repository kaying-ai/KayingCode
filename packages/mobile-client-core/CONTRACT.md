# Mobile Client Core 合同

本模块提供移动壳共用的 V2 URL/档案、平台端口、上游 OAuth/ws2、V4 会话投影和 commandId 幂等账本，不依赖 React、DOM、Taro 或 Flutter SDK。

自托管 KayingCode 授权 URL 只解析并保存，交给 Web 单次领取；不在 native core 建立配对、控制面或旧 attachment。原生上游渠道按 origin 隔离 AuthSession，拥有 OAuth flow/JWT 与取消代际；relay client 唯一拥有 socket generation、鉴权、心跳与重连，每次申请新 terminal token。详见 spec/zcode-relay-v2.md。

`RelayAgentConnection.fromAgent` 对已有上游通道提供 V4 握手、初始化、conversation/sessions-index/workspace-config 订阅和命令接口。业务受理事实属于 Agent/CLI CommandInbox；core 只有 pending 对账线索，未知 ACK 不换 commandId 自动重发。平台存储通过 RelayPlatformPorts 注入，壳不能复制协议状态。

不变量：

1. 发送先登记后上行；账本 TTL 锚定首次登记，重载不续期。
2. 订阅监听先于 RPC，快照早于 ACK 时先缓冲，再绑定 subscriptionId 按序放行。
3. 身份隔离使用 workspaceIdentity 的现有构造和 fallback，不仅按路径匹配远端工作区。
4. 断开或换代后旧订阅/迟到结果失效，恢复走当前桥与 snapshot/resync；Desktop continuous 与手机 replayable 边界不变。
5. 自托管档案以 origin+SID 去重，新邀请更新同设备；其他 SID 独立。旧档案不自动擦除，但旧格式不得连接。

删除的 Node control、配对/审核 REST、旧设备凭据、双腿传输与 HMAC 不属于公开接口。规则见共享 legacy-relay-retirement spec。UI、网站授权和 WebView 生命周期由各端壳/上游 Web 拥有。
