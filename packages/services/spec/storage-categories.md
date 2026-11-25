# 存储分类目录（storage categories）

资源管理器“存储”tab 的类别来自 `packages/shared/src/storage.ts` 的 `STORAGE_CATEGORY_IDS`；
services 的 `storage/domain/storageCatalog.ts` 把 `.kayingcode` 根下的相对路径映射到类别、
聚合 key 与可清理性，是所有扫描/清理共用的唯一规则表。

## 规则与 owner

- `CLEANABILITY` 与 `PREFIX_RULES` 目前用 `Record<StorageCategoryId, ...>` 穷举；新增类别必须在
  shared、services、UI 三处**同一次变更**落地，否则任一侧的穷举 `Record` 直接编译失败。
- services 只负责分类、聚合与清理范围；类别的显示名、图标、描述由 UI 的
  `resource-manager/storage/storageCategoryPresentation.ts` 与 i18n 拥有，services 不保存第二份。
- 预装工具目录 `<dataRoot>/preinstalled-tools/<release>/` 归独立类别 `preinstalledTools`：
  - `CLEANABILITY.preinstalledTools = "none"`：删除只属于预装工具进程（先撤入口、检查占用、
    再删记录/版本），存储页不提供清理入口。
  - `PREFIX_RULES.preinstalledTools = ["preinstalled-tools"]`，聚合 key 为
    `preinstalled-tools/<release>`（例如 `preinstalled-tools/production`），多个发布身份分别展示。
  - 该目录不由 services 写入；分类只读，不触发安装或入口同步。
- 匹配顺序不变：根级特例 → 文件规则（精确）→ 前缀规则（最长前缀优先）→ 其他。

## 当前阻塞（本轮未落 services 映射）

上游 `STORAGE_CATEGORY_IDS` 含 `preinstalledTools`，产品 `packages/shared/src/storage.ts`
尚未包含。只改 services 会同时产生两个问题：

1. `CLEANABILITY` / `PREFIX_RULES` 的穷举 `Record<StorageCategoryId, ...>` 拒绝多余键（类型错误）；
2. `usageAggregate` 的类别快照按 `STORAGE_CATEGORY_IDS.map(...)` 生成，未进入 shared 的 id
   会被静默丢弃：字节仍计入根总计，但类别明细消失；UI 的
   `STORAGE_CATEGORY_ICONS: Record<StorageCategoryId, ...>` 也缺少图标，运行时会取到 `undefined`。

因此本轮只固定产品规则与验收，不改 services 规则表。需要一次性补齐：

- shared：`STORAGE_CATEGORY_IDS` 增加 `"preinstalledTools"`（放在 `"runtimes"` 之后、`"config"` 之前）。
- services：`CLEANABILITY` 增加 `preinstalledTools: "none"`；`PREFIX_RULES` 增加
  `preinstalledTools: ["preinstalled-tools"]`。
- UI（不在本模块范围）：`STORAGE_CATEGORY_ICONS` 增加图标，i18n 增加
  `resourceManager.storage.category.preinstalledTools` 与
  `resourceManager.storage.categoryDescription.preinstalledTools`；services 不提供文案 key。

## 验收

- `classifyStoragePath("preinstalled-tools/production/bin/zcode-python", ...)` →
  `{ categoryId: "preinstalledTools", entryKey: "preinstalled-tools/production" }`。
- `getStorageCategoryCleanability("preinstalledTools") === "none"`；
  `getStorageCleanScopes("preinstalledTools")` 为空数组。
- 扫描快照包含 `preinstalledTools` 类别行（0 字节也保留），根总计与各类别之和一致。
- 已有类别、清理范围与保护规则（`setting.json`、`credentials.json` 等）不因新增类别改变。
- 单元测试：`packages/services/test/storageCatalog.test.ts` 覆盖上述分类、可清理性与聚合 key；
  shared id 落地前该测试无法编写（分类结果不存在合法 `StorageCategoryId`）。
