# 插件商店扩展兼容提示（extensionSummary）

> 目标：把上游 4.0.0 的「插件扩展摘要」UI 行为搬到本产品插件商店 —— 目录里要求更高插件 API 版本的
> 插件不再能被静默安装/更新，详情页在安装前展示扩展的版本要求与申请的权限。后端（CLI 解析、能力位、
> `plugins/overview` 的 `includeExtensionSummary`、services 发送门禁）已完成，本 spec 只覆盖 UI 一半。

## 范围

- `packages/ui/src/settings/pluginStoreListing.ts`：兼容判定与「安装/更新被挡」纯函数。
- `packages/ui/src/settings/PluginStoreCard.tsx`：安装按钮禁用与原因文案、卡片上的更新被挡提示。
- `packages/ui/src/settings/PluginStoreDetailView.tsx`：头部禁用原因 + 安装前的扩展说明区块。
- `packages/ui/src/settings/PluginStorePage.tsx`：`handleInstall` 与「检查更新」计数的同一判定。
- `packages/ui/src/i18n/locales/{en-US,zh-CN}.ts`：`settings.plugins.store.extension.*` 与
  `extensions.grants.tier.*`。
- 不改：市场源、区域过滤、本地源（localrun）、游戏专区、信任门禁、安装卡片布局、卸载流程。

## 数据源与权威

- 唯一来源是**目录条目的扩展摘要** `listing.extensionSummary`：
  `{ engines: { zcode: string }, grants: string[] }`，协议定义见
  `packages/shared/spec/plugin-extension-summary.md`。
- 摘要只在 CLI 声明 `pluginExtensionSummary` 能力、且 `plugins/overview` 请求带
  `includeExtensionSummary: true` 时出现；UI 不自己发请求、不缓存第二份、不从 manifest 推导。
- 已安装条目的 listing 来自目录**最新版**条目（`installedMeta.listing`），所以它描述的是「下一版」的
  摘要，恰好用于判断更新是否可装。
- UI 只读摘要，不写回、不参与插件身份、安装来源或执行权限判定。

## 产品引擎版本映射决定

- `engines.zcode` 是**插件 API 版本**（extension-host 的 `EXTENSION_API_VERSION`），不是 App/产品版本，
  与上游 `packages/shared/src/extension-host/manifest.ts` 的语义一致。
- 市场目录的键名固定为 `zcode`（`engines.zcode` 由目录/CLI 协议定义，不能按产品品牌改名），产品沿用同一
  extension-host 契约与同一 shared 实现，因此直接调用
  `@zcode/shared/extension-host` 的 `isExtensionEngineCompatible(range)`；未显式传宿主版本时默认
  `EXTENSION_API_VERSION`（当前 `1.4.0`）。**不比较产品版本号，也不在 UI 里另建版本常量。**
- 判定语义（与扩展进程加载清单时同一函数）：只认 `^x.y.z` 与精确 `x.y.z`；主版本必须与宿主一致；
  `^0.y.z` 要求 `0.y` 相同；`^` 范围下宿主版本不得低于要求；写法不认识时按**不兼容**处理
  （未来版本可能认识该写法，宁可让用户先升级）。

## 拦截与提示矩阵

| 条目状态 | 摘要 | 安装/更新 | 详情页提示 | 说明 |
| --- | --- | --- | --- | --- |
| 未安装（含可搜索候选） | 无 / 缺 `engines.zcode` | 可安装，行为同改动前 | 无扩展说明 | 旧 CLI 或非扩展插件 |
| 未安装 | 兼容 | 可安装 | 显示扩展说明（版本要求 + 申请权限） | 安装前知情 |
| 未安装 | 不兼容 | **禁用安装**，按钮文案 `extension.requiresUpdate`；`handleInstall` 同步拒绝（示例提示词等入口） | 顶部警告 `extension.incompatibleHint` + 扩展说明 | 详情页主按钮同一禁用态 |
| 未安装且 restorable（内置恢复） | 任意 | 可恢复，不受摘要影响 | 同未安装：摘要存在就显示说明 | 恢复不是新装，不做门禁 |
| 已安装，无更新 | 任意 | 无更新入口 | 显示「权限」区块，不显示安装前说明 | 已安装态归授权门面 |
| 已安装，有更新且最新版兼容 | 兼容 | 行内更新 / 菜单更新 / 详情更新卡可用 | 无新增提示 | 与改动前一致 |
| 已安装，有更新但最新版不兼容 | 不兼容 | **不显示更新徽标/按钮/菜单项与详情更新卡**，等同不可更新 | 顶部警告 `extension.updateBlockedHint` | 「安装后的更新」也要挡住 |
| 已安装，孤立来源（orphaned） | 任意 | 不可更新（既有规则） | 既有来源缺失提示 | 既有规则优先，不叠加 |

- 本轮额外显式提示「已安装但更新被挡」：上游只静默隐藏更新入口，本产品用一条警告说明原因，
  避免用户以为「没有更新」。

## 降级（缺省即改动前行为）

- 没有 `listing`、没有 `extensionSummary`、或 `engines.zcode` 缺失 ⇒ `isExtensionIncompatible` 为 false：
  不显示扩展说明、不禁用安装、不改变更新入口，也不隐藏插件。
- 旧 Host / 旧 CLI 不带摘要属正常情况：商店照常展示，装上后由扩展进程判「版本不兼容」。
- `grants` 为空数组 ⇒ 说明区块显示「不申请权限」；未知档位（字符串）原样展示，不隐藏、不导致解析失败。

## 与上游的差异

- 安装前说明多一行版本要求：上游只显示「含常驻代码 + 申请的权限」，本产品额外显示 `engines.zcode`
  原文（`extension.engineRequirement`，仅摘要存在时出现），让「为什么被挡」在详情页可见。
- 「已安装但最新版不兼容」上游只静默隐藏更新入口；本产品在卡片与详情页各加一条警告
  （`extension.updateBlockedHint`），避免用户以为「没有更新」。
- 保留全部产品自有行为：区域过滤（`plugin-store-regions`）、个人/游戏开发分段、本地源（localrun）、
  项目目录插件信任门禁、安装卡片布局与卸载流程，均不受本轮改动影响。
- 新增 `extensions.grants.tier.*` 本地化：上游已有，本产品此前缺失，导致授权对话框与新的说明区块会显示
  原始 key。本轮补齐四个档位文案，未改动其他 `extensions.*` 行为。

## 状态所有权

- 纯函数判定，无新增状态、无持久化、无事件顺序要求。
- 判定输入只有 `StorePluginItem` / `installedMeta`（由 `pluginManagementStore` 单点持有），
  卡片、详情页、页面回调共用同一函数，避免多个写入路径得出不同结论。

## 接口

```ts
isExtensionIncompatible(listing): boolean            // 只看引擎范围，缺省 false
isStoreItemInstallBlocked(item): boolean              // 未安装 && 非 restorable && 不兼容
hasInstallableUpdate(installedMeta): boolean          // 有更新 && 最新版兼容
isPluginStoreUpdateBlocked(item): boolean             // 已安装 && 有更新 && 最新版不兼容（提示用）
canUpdatePluginItem(item): boolean                    // !orphaned && hasInstallableUpdate
```

`canUpdatePluginItem` 是更新入口的唯一判定；徽标、行内按钮、菜单项、详情更新卡全部经它，
所以不兼容的最新版不会在任何入口出现。

## 验收

1. 兼容摘要：安装按钮可用，详情页显示扩展说明（版本要求 + 权限），无警告。
2. 不兼容摘要：安装按钮禁用且文案为「需要更新 KayingCode」；详情页显示不兼容警告；`handleInstall` 被调用也直接返回。
3. 已安装 + 有更新 + 最新版不兼容：更新徽标、行内更新按钮、菜单更新项、详情更新卡都不出现，详情页显示更新被挡原因。
4. 摘要缺失：安装、更新、详情页与改动前完全一致（无说明、无禁用）。
5. 详情页说明区块渲染 `grants`：已知档位本地化，未知档位原样；含 `sessions.fullAccess` 时额外显示完全访问说明；无档位显示「不申请权限」。
6. 区域过滤、个人/游戏分段、信任门禁、卸载等既有行为不变。
