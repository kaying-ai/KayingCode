# 插件声明式 UI 面板

- `plugin.json` 的 `uiContributions` 由 `parsePluginUiContributions` fail-closed 解析；解析失败的条目只写 `plugin_ui_contribution_invalid` 诊断，不阻断插件加载。
- 解析后的 contributions 必须写入 `PluginMetadata.uiContributions`，且只在插件启用时暴露；`plugins/list` 依赖该字段向 renderer 提供“转写对比”等 side pane 入口。
- `uiContributions` 与 A5 `uiSurfaces` 是两条独立投影，`createPluginMetadata` 必须同时保留，不能用一个覆盖另一个。
- 同名多身份插件启用时，`pruneAmbiguousUiContributions` 删除贡献并写 `plugin_ui_contribution_ambiguous` 诊断。
- 回归入口：`test/pluginUiContributions.test.ts`，使用 `node --import tsx --test` 执行。
