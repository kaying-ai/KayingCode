# 游戏中心标签页

「我的游戏中心」的主视图标签页由 `packages/ui/src/lib/gameFeaturePages.ts` 的 `GAME_FEATURE_PAGES` 唯一维护；导航、ARIA 关联、测试 id 与标签顺序都从这一份数据派生。

## 标签顺序与目标

| 顺序 | id                  | 标签（zh / en）                 | 内容                                             |
| ---- | ------------------- | ------------------------------- | ------------------------------------------------ |
| 1    | `tapmaker-projects` | 我的游戏 / My games             | 内部 TapMaker 游戏列表（默认页），不加载外部 URL |
| 2    | `game-ai-hot`       | 游戏AI热点 / Game AI highlights | 外部页面 `https://daily.kayingcode.kaying.ai/`   |
| 3    | `game-ranking`      | 游戏排行 / Game ranking         | 外部页面 `https://www.taptap.cn/top/download`    |
| 4    | `free-token`        | 免费 Token / Free tokens        | 外部页面 `https://www.kayingai.com/freellm`      |

- 外部标签复用 `GameExternalFeatureContent`：支持内嵌浏览器的桌面端用统一浏览器视图打开，并提供「在浏览器中打开」；不支持时只展示外链说明。
- 每个标签必须有 `labelKey`、`titleKey`、`descriptionKey` 与 `TAB_ICONS` 图标；新增或调整顺序只改 `GAME_FEATURE_PAGES` 与对应图标、文案。
- 侧栏入口固定导航到默认页，不记忆上次标签；标签切换不改写外部页 URL 或持久化状态。
- 标签支持左右方向键、Home/End 切换，选中态用 `aria-selected` 表达。

## 验收

1. 标签顺序为 我的游戏 → 游戏AI热点 → 游戏排行 → 免费 Token。
2. 游戏AI热点打开 `https://daily.kayingcode.kaying.ai/`，在支持内嵌浏览器的桌面端可见页面并提供外链按钮。
3. 默认进入「我的游戏」；侧栏入口不恢复到上次标签。
4. 中英文文案与图标完整；新增标签不需要修改 `GameFeatureMainView` 的渲染分支。
