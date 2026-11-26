# 设置搜索

提供设置项搜索入口和设置行级导航定位。

- SettingsSearch 只持有当前对话框和查询草稿，从已有分类、翻译及平台可见性投影结果，不挂载未选中的设置页。
- SettingsPage 接收 SettingsSearchResult，沿用原导航，并独占持有唯一定位目标；普通侧栏导航会清空该目标。
- 定位 id 归 `settingsSearchIndex.ts` 所有：索引用翻译 key 作为稳定 `SettingsSearchId`，只登记所属分区、说明 key 与可见性，不保存任何配置值。设置行通过 `SettingsRow` 的 `searchId` 引用同一 id，不复制字符串常量。
- 索引形状：`SETTINGS_SEARCH_ITEMS` 是固定设置行的唯一登记表，`findSettingsSearchItem` / `isSettingsSearchId` 提供只读查找；动态用户资源（插件、MCP、Memory 文件等）和条件授权操作仍由原页面管理，不进入行索引。
- 行级定位：`SettingsRow` 把 `searchId` 交给 `useSettingsSearchTarget`，输出 `data-settings-search-id`、`data-settings-search-highlighted` 与 `tabIndex=-1`。目标行实际挂载后滚动到视口中央、聚焦，并高亮约 2 秒；高亮按目标对象区分轮次，旧轮次到期不会清掉后续命中。设置行的 ID 也登记到模块内挂载注册表，供分区目标判断是否需要兜底。
- 分区兜底：`SettingsSearchSectionTarget` 只在「没有行级 id」或「行级 id 在约一次宏任务后仍未挂载」时滚动到分区标题并高亮。未挂载包括平台条件隐藏、运行时数据未就绪（如缺少 services 时的插件自动推荐）以及索引已移除的旧 id。行已挂载时分区不滚动、不高亮，避免双重定位；行迟到挂载时仍由行自身接管后续滚动与高亮。
- 导航收敛：`resolveSettingsSearchNavigation` 先收敛分区（不可见则回退到 `fallbackSection`），再用索引校验 `setting` 仍属于该分区；任何过期或跨分区的行 id 只保留分区。
- 不可变边界：定位不操作控件，不保存配置，不更改 Host 或 workspace；导航结果只含 `section` 与 `setting`，不携带配置值。查询、选中与关闭对话框都没有持久化副作用。
- 通过 `index.ts` 公开组件、定位上下文和目标组件；`contract.ts` 公开导航结果、`SettingsSearchId` 类型、导航收敛规则和 `useSettingsSearchTarget`。挂载注册表、索引查找与内部匹配不属于其他模块的业务状态源。
