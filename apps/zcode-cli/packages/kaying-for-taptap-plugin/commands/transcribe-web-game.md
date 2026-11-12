---
name: transcribe-web-game
description: 把一个已授权的网页游戏按模块转写为 TapTap Maker（UrhoX Lua）项目，保持画面与玩法对等。
---

按 `threejs-to-taptapmaker` Skill 的九步流程推进本次转写，**不要跳过取证**；KayingCode 中源码本地化后立刻建空项目并打开对比面板，**非必要不人工确认**：

本命令属于内置 `kaying-for-taptap`。下文 `t3m ...` 是可读记法，实际统一调用
`kaying-for-taptap_transcription`（`command` + `arguments` + `cwd`），不得从 Bash 调旧插件二进制。

**转写铁律**：截图/对比图只回答“哪里不一样”，不回答“应该改成什么”。任何视觉修改前，必须在
`source/` 找到并记录 `文件:行号 + 值/分支/资源 + 期望行为`；找不到源码证据时禁止编辑，先补取证。
修复按根因批量进行，同一检查点视觉修复最多 2 轮；超过则回源码审计。证据落盘到
`source/SOURCE_NOTES.md`、`source/audit/*.md` 和 `project-info.json` 的 `visual_fixes`。

0. 建工作目录：`t3m init "<游戏地址>" [--name <项目名>]`，进入生成的 `convert_game_YYYYMMDDHHMMSS/`（内含 `project-info.json` + `source/` + `dest/`）。之后所有步骤都在该目录内执行。
1. 读 Skill：`skills/threejs-to-taptapmaker/SKILL.md`，并加载 `references/pipeline.md`、`references/ui-parity.md`（界面与流程对等）、`references/workspace.md` 与 `references/runtime-loop.md`（运行时闭环）。KayingCode 中先检查 `prepare_visual_comparison` 与 Browser Use；两者可用时不为本地 runtime 执行 `t3m doctor`。
2. **源码本地化**：`t3m fetch "<游戏地址>" --out source/`，**按结尾的 iframe / game entry 提示再抓一跳**（门户页是外壳，游戏在 `/embed/` → `<cdn>/v/<hash>/index.html`）到 `source/game/`。只抓到 `_next/` 外壳说明停错了层，先解决取证再动手。
3. **本地化完成后立即（不插入人工确认）**：
   - `t3m analyze source/game/ --out source/report.md` 与 `t3m ui source/game/ --out source/UI_INVENTORY.md`，高风险清单作为**工作清单**写入 report 后自动按序推进，**不要回报给用户等待确认**；
   - **源码审计**：写代码前补齐 `source/audit/control-flow.md`（URL 参数/feature flag/主备分支/模型选择）、`shaders.md`（`onBeforeCompile`/`ShaderMaterial`/`customProgramCacheKey`）、`materials.md`（clearcoat/emissiveStrength/doubleSided/vertex color）、`animations.md`（车轮/Wob\_/眨眼/头部/UI tween）、`models.md`（id/显示名/模型/图集）；把已确认事实写入 `source/SOURCE_NOTES.md`，每条带 `file:line`；
   - 在 `dest/` 创建 TapTap **空项目**（KayingCode 用 `kaying-for-taptap_ensure_project`/`kaying-for-taptap_init_project`，禁止系统 `taptap-maker init`/`login` 写 `~/.taptap-maker`；无官方插件才 `taptap-maker init`。已绑定则确认 `dest/.maker-mcp/config.json`）；
   - 按 Skill 0.2 在对比面板/source 形态上判定屏幕方向：**竖屏可正常运行和交互则优先竖屏**，写入项目配置与
     `t3m note project-info.json orientation portrait|landscape` + `orientation_reason`；
   - 读 `dest/engine-docs/` 与 `.emmylua/` 类型存根——引擎 API 以它们为准。
4. **打开右侧对比面板（first-publish 基线，一次）**：`dest/.maker-mcp/config.json` 存在、原版 playable URL 已确认、`t3m lint dest` PASS
   三项成立（空项目通常即 PASS）后，立即连续执行 Maker publish → `prepare_visual_comparison`（viewport 跟随已判定方向）。
   不得先启动本地 preview、不得执行默认读本地日志的 `t3m rlog dest`。在 comparison receipt 成功前，不得插入普通 Read/Edit/Bash 探针或继续其他模块；第一次画面可以是空骨架，它是后续验证基线。
5. **主流程按代码转换推进九步**（关卡输出到 `dest/scripts/`）。阶段内连续写码/转数据，随时 `t3m lint dest`；
   纯逻辑用 wasmoon/Node 与原版对拍。**重验证闭环只在阶段性验证检查点跑**（SKILL.md 0.0.1）：
   first-publish 基线、新引擎 API 探针、步骤完成标志要画面/运行时证据、最终验收。
   检查点轮次以 `t3m lint dest` → Maker publish → `prepare_visual_comparison` → 远端 publication runtime log → 双 guest 取证收尾；
   **不要每改一处就发布对比**。新引擎 API 路径在检查点用小探针验证，不另外打开本地 runtime。
   第 6 步（界面）额外要求：**按 `source/UI_INVENTORY.md` 逐条转**——控件 1:1、位置尺寸按 CSS 直译、
   点击动作与显隐条件照搬、锚定弹窗不改成常驻栏、节奏节点（开波方式/速度档位/暂停项/教程提示/结算可达）对齐；
   收尾 `t3m note project-info.json ui_inventory source/UI_INVENTORY.md` 后 `t3m mark project-info.json ui`（缺清单会被拒绝）。
6. comparison receipt 成功且双 guest 可用后，每个需要视觉判断的 KayingCode 修复轮都按 `references/visual-compare.md` 固定执行
   修改 → Maker publish → `prepare_visual_comparison` → 双 guest 取证，再串行双截图 → `t3m compare`；不得再执行本地 `preview stop/start`、`t3m rlog` 或本地窗口截图。
   **修复轮也按检查点节奏走**：先批量修完一类根因再验一轮，不要逐次微调就重发布。
   每个视觉修复先写 root-cause note（`source_evidence` + `root_cause`），再改代码；禁止只凭截图调相机/颜色/logo/布局。同一检查点视觉修复最多 2 轮。
   只有远端 publish/preview 明确失败，且远端错误与 publication runtime log 不足以定位时，才能记录 `visual_review_mode=local-runtime-fallback` 与具体原因后降级；
   官方工具报错时不得绕过插件读取 PAT 再直接调用 Maker CLI；不得复制 `pat.json`、`tap-auth.json`。收尾再执行一次同 revision 的对拍并记录五个 `compare_*` artifact。
   同时要求 `t3m lint dest` 高风险 0，并逐条走查 `references/acceptance.md`；
   再记录 `runtime_log` / `screenshot` / `pixel_stats` / `maker_url` 后 `t3m mark project-info.json accept`；
   再用 `maker_build_current_directory` 交付；确认探针与临时代码已清除。

约束：

- **主流程是代码转换；重验证闭环只在阶段性验证时跑**（SKILL.md 0.0.1）：阶段内连续转写 + `t3m lint` / 纯逻辑对拍；
  Maker publish → prepare → 双 guest → compare + 远端 rlog 仅在 first-publish 基线、新 API 探针、
  步骤完成标志、最终验收这些检查点执行。不要每改一处就发布对比——太浪费时间。
- **非必要不人工确认**：高风险清单、方向选择、修复取舍都自动推进并同步结果；只有授权/登录、平台工具硬性要求
  用户选择、或明确不可逆的高成本操作才打断用户。
- **屏幕方向竖屏优先**：来源游戏在竖屏下能正常运行和交互就转写为竖屏；只有竖屏裁切关键玩法/控件不可达/原版
  硬编码横屏时才用横屏，并记录理由。
- 数值照搬原版；引擎差异导致必须换算时，把依据写进代码注释。
- **界面按清单转，不重设计**：控件 1:1、位置尺寸按 CSS 直译、点击动作与显隐条件照搬；
  不新增原版没有的常驻控件，不把锚定弹窗改成常驻栏；流程与节奏节点（开波方式、速度档位、暂停菜单项、
  教程提示、结算可达性）逐条对齐——这些差异任何静态检查都发现不了。
- 画面不对先做根因定位：用 `source/audit/*` + `SOURCE_NOTES.md` 找到源码 owner（DOM/CSS、shader、材质、模型、动画、相机、光照），写 `source_evidence` 后再改；禁止按截图逐像素/逐区域微调。像素/材质/光照统计只用于定位，不作为修改规格。
- **子 agent 只读并行**：可用时按“1 主写手 + N 只读分析员”；子 agent 不写 `dest/`、不 publish/prepare、结论必须带 `file:line`，主 agent 回源码验证后才改代码。详见 `references/subagents.md`。
- 原版参考源码只进工作目录的 `source/`，不进 `dest/`，不提交进仓库。
- 转写 CLI 只通过内置 `kaying-for-taptap_transcription` 调用；不要修改 PATH、读取旧插件 cache、现场
  `cargo build`，也不要用临时脚本顶替它的取证与门禁。

参数：游戏地址（必填）、项目名（可选，`--name`）、工作目录父目录（可选，默认当前目录）、是否只做取证（可选）。
