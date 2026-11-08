# Agent 工作模式菜单展示

- 菜单候选与模式 ID 唯一来自 shared 的 getKayingCodeAgentAvailableModes；UI 仅翻译与展示，不新增模式、不改变权限语义。
- plan 继续为独立勾选项；build/guarded/yolo 是权限单选项。
- guarded 在中文中显示「自主模式」，说明「有风险时先询问。」；英文为 Autonomous mode / Ask when there is risk.
- guarded 使用 ShieldCheck 图标，区别于 build 的手形确认图标与 yolo 的 ShieldAlert 图标。
- 共享 display-help 映射覆盖全部当前候选，Composer 菜单和其他复用入口保持一致；保留历史 edit 的映射。
- 用户选择继续只更新原草稿 owner，通过现有 onSwitchMode 发送意图，不触发运行时或配置写入。
- 验收：中英菜单每项标题与说明完整；guarded 单选状态与触发器文案同步；plan 可以独立切换且不改变 guarded 权限选择。

浏览器验收：`node packages/ui/test/modeMenu.e2e.mjs`；使用真实模式菜单和语言包，仅隔离应用设置及快捷键装配。
