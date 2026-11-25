# 对话引用批注（conversationQuoteComment）能力门禁

选区“批注”会在对话引用（`conversationQuotes[]`）上携带 `comment` / `agent` 字段。旧 CLI 的
引用 schema 非 strict，会静默剥掉这两个字段：用户看到批注，模型收不到。因此是否提供批注入口、
以及是否把字段发给 CLI，都必须以 CLI 自报的 runtime capabilities 为准。

## 事实源与 owner

- CLI 在 `runtime/capabilities` 响应中声明 `conversationQuoteComment: true` 才是唯一事实源
  （`packages/shared/src/kayingcode-protocol/index.ts` 已含该可选字段，本模块不改共享协议）。
- services 的 `KayingCodeAgentService` 按**物理 CLI 连接**缓存探测结果，是 Host 侧唯一门禁 owner；
  UI 只消费 `supportsConversationQuoteComment` 的结果决定是否显示“批注”入口。
- CLI 换代（进程重启/连接重建）后缓存随新 client 重新探测，不跨连接复用。

## 门禁语义

```text
sendConversationCommandV4(envelope)
  └─ payload.conversationQuotes 是否含 comment/agent？
       ├─ 否 → 原样转发，不发起能力探测
       └─ 是 → runtime/capabilities（每连接最多探测一次）
                ├─ conversationQuoteComment === true → 保留 comment/agent 原样转发
                └─ false / 缺省 / 探测失败      → 去掉 comment/agent 后转发（fail closed）
```

- 只在命令真正携带 `comment` / `agent` 时探测：普通引用（无批注）不增加任何协议往返。
- 探测失败（method-not-found、超时、解析失败）按不支持处理，且**不缓存失败**，下一条消息允许重试。
- 只处理信封 `payload.conversationQuotes`（`sendText` / `editUserQuery` / `editQueueItem` 共用的
  命令字段）；其他 payload 字段与无批注的引用对象保持不变，且不修改调用方传入的对象。
- 闸门以**原始命令**（`params.envelope`）为基准：命令在 Host 侧经过 `commandPayloadSchemas` 解析/
  重建（例如附带 `browserAmbientContext`）时，schema 会剥掉未声明字段；能力为真时用原始引用恢复
  `comment` / `agent`，能力为假时也按原始引用剥离，避免“支持但被 Host 提前丢掉”或“不支持却漏剥”。
- Host 不信任调用方“我支持批注”的自述；字段是否发给 CLI 由本轮探测结果唯一决定。
- `supportsConversationQuoteComment(target)` 供 Host/渲染层查询入口能力；缺省（旧 Host、远端未探测、
  CLI 未声明）一律返回 `false`，即不提供批注入口。

## 上游映射

- 上游 `zcodeAgentService.ts` 在 `getClient` 启动屏障里读取 `runtime/capabilities`，把声明该能力的
  client 放入 `WeakSet`，`supportsConversationQuoteComment` 直接读 `WeakSet.has(client)`。
- 产品没有同一条集中启动屏障，沿用服务内既有的“按 client 缓存 capability probe”模式
  （`independentPlanSupport.ts`、`resident-rows-range/contract.ts`）：语义相同（每连接一次、
  fail closed、换代重算），但探测在首次需要时触发，避免为所有发送增加启动期请求。
- 闸门本身对应上游“旧 CLI 会静默剥掉 comment / agent，入口只对声明者开放”的约束：未声明时
  services 主动剥掉字段，保证旧 CLI 不会收到它只会丢弃的字段。

## 依赖与边界

- 引用结构的 `comment` / `agent` 字段与长度上限在 `packages/shared/src/conversationSelection.ts`。
  当前产品共享 schema 尚未包含这两个字段（Host 解析会剥离）；补齐共享字段后本门禁无需改动即可转发。
  共享源码不在本模块修改范围，已作为交付说明上报。
- 不新增协议方法、不新增 Agent 工具；CLI 侧的 `runtimeCapabilities` 声明由 CLI 适配层负责。

## 验收

- 单元测试 `packages/services/test/conversationQuoteComment.test.ts`：
  - 声明 `conversationQuoteComment: true`：`comment` / `agent` 原样保留，其他字段不变；
    中间解析（如 `browserAmbientContext` 重建）剥掉后仍能按原始命令恢复。
  - 未声明 / 显式 false：字段被剥掉，其余引用字段（`text`、`path`、`senderId` 等）不变。
  - 探测抛错：按不支持剥离，且下一次调用会重新探测。
  - 引用不含 `comment` / `agent`：不发起探测，信封对象原样返回。
  - 同一 client 多次调用只探测一次。
