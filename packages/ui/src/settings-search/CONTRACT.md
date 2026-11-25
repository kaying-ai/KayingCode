# 设置搜索

提供设置项搜索入口和设置导航定位。

- SettingsSearch 只持有当前对话框和查询草稿，从已有分类、翻译及平台可见性投影结果，不挂载未选中的设置页。
- SettingsPage 接收 SettingsSearchResult，沿用原导航，并持有唯一定位目标。产品当前没有给每个设置行传稳定 searchId，因此由 `SettingsSearchSectionTarget` 在目标分区挂载时滚动到分区、聚焦并让高亮约 2 秒后消失；不改变其它分区的滚动位置。
- `useSettingsSearchTarget` 与 `SettingsSearchTargetContext` 按上游契约保留：后续设置行接入 searchId 后可直接消费同一个导航目标，无需改搜索入口。
- 定位不操作控件，不保存配置，不更改 Host 或 workspace。查询与关闭对话框没有持久化副作用。
- 新固定设置行在 `settingsSearchIndex.ts` 中登记翻译 id、所属分类、说明和可见条件。动态用户资源（插件、MCP、Memory 文件等）仍由原页面管理，搜索只把用户带到对应分区。
- 旧目标或已隐藏分区由 `resolveSettingsSearchNavigation` 降级到仍可见的分区，并丢弃过期行 id。
- 通过 `index.ts` 公开组件、定位上下文、导航收敛函数和 hook；`contract.ts` 公开导航结果、定位 id 类型与导航收敛规则。内部匹配与索引不作为其他模块的业务状态源。
