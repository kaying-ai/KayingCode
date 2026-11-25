# 插件扩展摘要的 CLI 装配与协议投影

状态：已实现（4.0.0 同步波次）。
上游来源：ZCode 4.0.0 `docs/plugins/plugin-publishing.md` §4.2–§4.3；共享协议见
`packages/shared/spec/plugin-extension-summary.md`。

## 1. 事实源

- 摘要的唯一输入是**市场目录条目**（`PluginMarketplaceEntry.raw`）的 `extensionSummary`；
  适配器 `parseEntryExtensionSummary` 负责校验与裁剪（只留 `engines.zcode` 与字符串 `grants`）。
- 解析发生在装配期而不是读目录时：旧版本缓存的 `marketplace.json` 不用迁移，下一次 overview 就能读到。
- 已安装插件的摘要 join 自目录**最新版**条目（`extensionSummaryByPluginId`），不是已装版本的；
  App 据此判断最新版能不能装。目录被移除时已安装条目没有摘要，UI 降级。

## 2. 装配（`src/plugins.ts`）

- `KayingCodeAvailablePluginData.extensionSummary?` / `KayingCodeInstalledPluginData.extensionSummary?`
  是 CLI 内部字段，与 `listing` 并列，**不**混进 `parseEntryStoreListing` 的产物
  （`@zcode/contracts` 的 `PluginStoreListing` 没有该键）。
- `toAvailablePluginData` 从 `entry.raw` 解析；可恢复内置条目只带 seed listing，没有摘要。
- `getKayingCodePluginsOverview` 在遍历目录时收集摘要，join 到 installed 条目。

## 3. 协议投影（`src/kayingcode-protocol/plugins.ts`）

```text
getPluginsOverview(params)
  ├─ params.includeExtensionSummary === true → available/installed 的 listing 并入 extensionSummary
  └─ 其他（缺省 / false）                    → 保持原 listing，摘要不出线
```

- `withExtensionSummary` 只在**请求要了**且条目**确有**摘要时才浅拷贝 listing 合并；
  两者任一不满足时原对象原样返回（零拷贝、零新键）。
- `restorableBuiltins` 永远不带摘要（内置定义没有目录摘要）。
- 安装 / 更新 / 卸载 / 列出 / 描述等响应的投影函数不接触摘要字段：结果 schema 与版本无关，
  带上等于对旧 services 破坏兼容。

## 4. 能力声明

`runtime/capabilities` 返回 `pluginExtensionSummary: true`：本 CLI 认识 `includeExtensionSummary`
并按它在商店信息里带摘要。services 只有看到这一位才会发参数（旧 CLI 的 strict 参数 schema 会整条拒绝）。

## 5. 失败降级

- 摘要非法 ⇒ 条目按没有摘要处理，listing 的其余字段照常返回，overview 不报错。
- 目录未缓存 / 读取失败走既有 marketplace 诊断，与摘要无关。

## 验收

- `tests/plugins-protocol.test.ts`：
  - 未带参数：`JSON.stringify(overview)` 不含 `extensionSummary`；install 结果同样不含。
  - `includeExtensionSummary: true`：available 与 installed 的 listing 等于
    `{ displayName, extensionSummary }`，未知键已被裁剪；无摘要条目 listing 保持 `undefined`。
  - 结果能被 `kayingcodePluginsOverviewResultSchema` 解析；参数能被 `kayingcodePluginsOverviewParamsSchema` 解析。
- `runtime/capabilities` 声明 `pluginExtensionSummary: true`。
