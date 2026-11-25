# 插件商店定向展示区域（regions）

适配上游 ZCode 4.0.0 的商店 `regions` 能力。`regions` 是**目录条目**的展示性元数据，只决定「在哪个地区的商店浏览列表里出现」，不参与插件身份、安装门禁、权限与运行。

- 协议：`kayingcodePluginStoreRegionSchema = z.enum(["cn", "global"])`；listing 上为可选 `regions: KayingCodePluginStoreRegion[]`。对象仍为 strict，未知值由 CLI 读目录时丢弃，不能进协议。
- 兼容：listing 无 `regions`（旧目录、旧缓存、内置 seed）表示所有区域可见；旧 payload 继续可解析。
- 唯一所有者：`packages/shared/src/kayingcode-protocol/index.ts`；`@zcode/contracts` 的 `PluginStoreListing` 只是同一规则的类型别名来源。
- 数据流：适配器 `parseEntryStoreListing` 只保留 `cn`/`global` 并去重（缺省 / 非数组 / 过滤后为空 ⇒ 不写字段）→ bootstrap 原样透传进 `plugins/overview` → services 按协议 schema 解析 → UI 按当前地区过滤**商店浏览列表**。
- UI 地区来源：产品暂无登录区域事实源（无 `useOAuth` 登录入口状态），按现有 locale 推导：`zh*` ⇒ `cn`，其余 ⇒ `global`。这与既有 `LoginApiKeyForm` 按 locale 预选 BigModel / Z.ai 入口的约定一致。将来引入登录区域事实源时，替换 `resolvePluginStoreRegion` 的输入即可，过滤与数据层不变。
- UI 过滤规则：已安装（`installed` 或有运行时 `info`）条目始终显示，避免已装插件从商店消失；非公开来源（个人 marketplace）不参与区域定向；详情页与管理已安装视图使用同一全集，不因过滤丢失条目。
- 游戏展示字段（`gameDevelopment` / `skillDetails`）与 `regions` 正交，同时存在时各自独立生效。

验收：

- 目录条目 `regions: ["global","cn","cn"]` ⇒ `["cn","global"]`；`["cn","mars",1,null]` ⇒ `["cn"]`；`[]` / `"cn"` / `{cn:true}` / 无字段 ⇒ 不写 `regions`。
- 合成 manifest 不携带 `regions`（目录层元数据不进入 `plugin.json`）。
- UI：`zh-CN` 下隐藏仅 `global` 的未安装条目；`en-US` 下隐藏仅 `cn` 的未安装条目；已安装条目两种 locale 都显示。
