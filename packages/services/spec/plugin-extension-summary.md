# `plugins/overview` 扩展摘要能力门禁

`plugins/overview` 的 `includeExtensionSummary` 参数与结果里的 `listing.extensionSummary` 都是
**strict** schema：旧 CLI 收到新参数整条拒绝，旧 services 解析到新字段整页失败。因此 services 是
Host 侧唯一门禁 owner，只在 CLI 明确声明 `pluginExtensionSummary: true` 时才要求摘要。

协议定义见 `packages/shared/spec/plugin-extension-summary.md`；CLI 侧投影见
`apps/zcode-cli/packages/bootstrap/spec/plugin-extension-summary.md`。

## 事实源与 owner

- CLI 在 `runtime/capabilities` 响应中声明 `pluginExtensionSummary: true` 才是唯一事实源。
- `packages/services/src/kayingcode-agent/independentPlanSupport.ts` 的
  `supportsPluginExtensionSummary` 是探测与缓存的唯一实现，复用该文件里既有的
  `discoverCapabilities`（按**物理 CLI client** 缓存、失败不缓存）。
- 不发摘要时 CLI 也不会带字段，所以旧 services 不会解析到新键；两侧都不需要兜底分支。

## 门禁语义

```text
getPluginsOverview(params)
  ├─ runtime/capabilities（每连接最多一次）
  │    ├─ pluginExtensionSummary === true → params 追加 includeExtensionSummary: true
  │    └─ false / 缺省 / 探测失败         → 不发送该键（旧 CLI 不会拒绝）
  └─ client.request(pluginsOverview, params, resultSchema)
```

- 只有明确 `=== true` 才算支持；`"true"`、`1` 等歧义值一律按不支持。
- 探测失败（method-not-found、超时、解析失败）按不支持处理，且**不缓存失败**：
  下一次 overview 允许重试；探测成功的结果随 client 生命周期缓存。
- 探测结果只用于决定是否发送参数；不改变其他 overview 参数（`workspace` / `configScope`）。
- 摘要缺失不是错误：不要求时 listing 没有该字段，overview 正常返回。

## 与其他能力位的关系

- 与 `pluginDiscoveryUi` / `historyFirst` 共用同一个 `discoverCapabilities` 缓存：
  同一 client 的多个能力查询只产生一次 `runtime/capabilities` 往返。
- 与 Host/UI 无关：UI 不感知该参数，只消费协议结果里的 listing。

## 验收

单元测试 `packages/services/test/pluginExtensionSummary.test.ts`：

- 声明 `pluginExtensionSummary: true`：`plugins/overview` 的 params 带 `includeExtensionSummary: true`。
- 未声明 / 显式 `false` / 值非布尔：params 不含该键。
- 同一 client 连续两次 overview 只探测一次；探测失败后下一次会重新探测并可在成功时带上参数。
- 探测失败时 overview 仍然发出（只是不带参数），不抛错。
