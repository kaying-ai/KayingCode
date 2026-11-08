---
name: threejs-fetch
description: 抓取网页游戏的源码并生成按风险排序的转写工作清单（t3m fetch + analyze）。
---

对目标游戏地址执行取证，并回报结果（在工作目录 `convert_game_YYYYMMDDHHMMSS/` 内执行；没有则先 `t3m init "<URL>"` 创建）：

下文 `t3m ...` 是可读记法，实际使用内置 `kaying-for-taptap_transcription` 的 `command`、
`arguments` 和 `cwd`，不依赖系统 PATH 或旧插件目录。

1. `t3m fetch "<URL>" --out source/` — 下载 `index.html`、自有 JS 模块图与 CSS；库文件只记录不下载。若报证书吊销失败，加 `--insecure`。
2. **看结尾的 iframe / wrapper hop(s) 与 game entry candidate(s)**：门户地址通常只是外壳，真正的游戏在两跳之后
   （`/zh/g/<slug>` → `/embed/<slug>` → `<cdn>/v/<hash>/index.html`）。按提示抓真正入口，**以 `source/game/` 为准**：
   `t3m fetch "<candidate>" --out source/game/`
   若只抓到 `_next/` 与 css（没有游戏自己的 `src/*.js`），说明停在了外壳层，回报时明确说明，不要基于外壳写代码。
   `t3m init` 会先把输入地址记录为 `artifacts.source_preview_url`，后续 `fetch` 发现 game entry 时会自动改成
   最终候选；准备双预览时读取这个字段，旧工程缺字段则显式传最终 playable URL，不猜门户地址。
3. `t3m analyze source/game/ --out source/report.md`（没有 iframe 时就是 `t3m analyze source/ --out source/report.md`）——生成引擎差异工作清单。
4. `t3m ui source/game/ --out source/UI_INVENTORY.md` —— **界面同样是取证对象**：提取页面容器、CSS 盒子模型、
   控件清单（`data-a`/`data-r`/`data-k` 锚点 + class + 文案 key）、屏幕与导航、键盘/指针映射、节奏与计时节点，
   外加一张逐条对齐表。第 6 步的界面转写照它做，不要凭印象重设计（判定标准见 Skill 的 `references/ui-parity.md`）。
5. `t3m mark project-info.json fetch`、`t3m mark project-info.json analyze` 更新阶段状态；`t3m note project-info.json report source/report.md` 记录产物。
6. 回报给用户：文件数/行数、模块图要点、**高风险项逐条列出**（每项含"在哪个文件、要改成什么"）、
   **界面控件清单概况**（控件条目数，以及原版独有、最容易漏掉的：图标按钮、血量条、冷却环、锚定弹窗、
   键盘层），以及未命中的待人工确认项。

参数：游戏地址（必填）、工作目录（默认当前 `convert_game_*` 目录）。
