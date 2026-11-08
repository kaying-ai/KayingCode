# TapTap 提交后自动打开

发布规则、回执接口、事件顺序与跨端验收以 [插件预览规范](../../../apps/zcode-cli/packages/kaying-for-taptap-plugin/spec/preview-workflow.md) 为准。

`useAppPanels` 通过文件服务 hook 读取 publication，使用现有 `openTapTapPreviewSidePane` 写入侧栏状态。只有启用插件且支持 embedded browser 时订阅自动打开；按回执 sessionId 绑定任务，只有当前任务结果展开面板。回执不提供任务归属时禁止猜测当前任务。

文件监听覆盖首次创建的嵌套回执；读取串行合并，建立订阅后补读，工作区切换/卸载后取消旧投影。revision 去重只控制自动展开，不另存业务发布状态。手动打开面板继续支持旧回执。

回执的可选 `previewMode` 由插件发布工具决定。`transcription-compare` revision 仍纳入去重，但不触发独立预览回调；首轮 compare receipt 尚未出现也不打开独立面板。已有「转写对比」继续读取同一发布回执更新 target，source guest、任务焦点与面板所有者不变。缺省及 `standalone` 保持普通预览行为；后续普通项目的新 revision 不受之前转写影响。E2E 覆盖转写首轮、连续提交、重复事件、任务切换及转写后普通发布。

预览面板只承载游戏浏览与截图，不提供「测试游戏」「发布游戏」草稿快捷按钮，也不通过预览面板向对话输入框写入指令。移除这两个按钮所在的整行操作栏，游戏视图直接占用面板内容区；同步清理中英文按钮/提示词。发布回执与 guest 的所有者、刷新顺序沿用上述链路。

交互验收：桌面和手机宽度下，加载有效回执后均显示游戏预览，无测试/发布快捷入口及其占位行；预览 URL 仍选择可玩 tab，截图准备请求继续传递给 guest。
