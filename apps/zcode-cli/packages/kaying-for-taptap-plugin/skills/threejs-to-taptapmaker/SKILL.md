---
name: threejs-to-taptapmaker
description: 把网页 three.js / Canvas 游戏“按模块转写”为 TapTap Maker（UrhoX Lua）项目时使用：取证抓源码、判定引擎差异、关卡数据转 Lua、转写顺序与验收、以及实测坑位排查。用户提到 three.js 转 Maker、网页游戏移植 TapTap、Canvas 游戏复刻到 Maker、原版效果对不齐、转写后画面/手感不一致时都应使用本 Skill；即使用户没有说“Skill”或“转写”，只要目标是把一个已授权的网页游戏搬到 Maker 上并保持对等，就先按这里的流程建立取证与验收。
---

# three.js → TapTap Maker 转写工作流

目标：**把原版网页游戏的源码按模块搬过来**，让画面、玩法、手感对等；不是"另做一套类似玩法的新游戏"。两者的差别会在验收时全部暴露出来，所以从第一天就按转写做事。

前置：目标游戏已获授权。

## 转写铁律：源码是规格，截图是线索

> **截图/对比图只回答“哪里不一样”，不回答“应该改成什么”。**
> 任何视觉修改前，必须在 `source/` 中找到并记录证据：`文件:行号 + 具体值/分支/资源 + 期望行为`。
> 找不到源码证据时禁止编辑，先补取证（源码、运行时 DOM、GLB 材质、资源、动画）。
> 修复按根因批量进行，禁止按截图逐像素/逐区域微调。
> 同一检查点视觉修复最多 2 轮；超过则停止截图重试，回到源码审计。

执行顺序：

1. 冻结同一状态/视口的双端截图，用 diff/metrics 定位差异区域；
2. 把差异区域映射到源码 owner：DOM/CSS、custom shader、材质、模型、动画、相机、光照、UI；
3. 写 root-cause note：`file:line` + 值/分支/资源 + 期望行为；
4. 按根因批量修改，修完在同一状态/视口复验；
5. 复验不过先回源码审计，不要继续调截图。

例外：源码没有显式数值（烘焙贴图、运行时 DOM 生成的资源）时，证据取自**源资源/运行时 DOM**，不靠肉眼估色/估值。

**证据落盘**（不依赖上下文记忆）：

- `source/SOURCE_NOTES.md`：已确认的源码事实 + `file:line`；每次上下文压缩前/检查点更新，压缩后先读它。
- `source/audit/control-flow.md`、`shaders.md`、`materials.md`、`models.md`、`animations.md`、`ui.md`：审计产物。
- `project-info.json` 的 `visual_fixes`：每条视觉修复记录 `symptom / region / source_evidence / root_cause / fix / confidence`。

**反例**：Turbo Tails 转写中，Agent 按截图把标题相机从 4.45 m 调到 6.6 m、10.2 m，最后回到源码
`rC()` 的 6.3 m；根因是没先读源码，不是相机难调。同类反例见
[references/pitfalls.md](references/pitfalls.md) 的 H 节。

## KayingCode 内置调用约定

本 Skill 已属于内置 `kaying-for-taptap`，不再依赖独立的 `threejs-to-taptapmaker`
安装、旧插件目录或系统 `PATH`。下文的 `t3m <command> ...` 都是便于阅读的命令记法；
在 KayingCode 中实际调用 `kaying-for-taptap_transcription`，把子命令放入 `command`、
后续 argv 放入 `arguments`、工作目录放入 `cwd`。不要从 Bash 直接查找或编译 `t3m`。

## 右侧面板选择：转写只用“转写对比”

先按任务语义选面板，不按“当前哪个标签页已经打开”猜测：

| 场景                                               | 面板                | 内容                                       |
| -------------------------------------------------- | ------------------- | ------------------------------------------ |
| 普通 Maker 游戏开发、运行、QA、视觉修复            | **TapTap 游戏预览** | 单个最新 TapTap publication                |
| three.js / Canvas 网页游戏转写、原版对齐、转写验收 | **转写对比**        | 左侧原版 Web + 右侧同 revision TapTap 预览 |

本 Skill 属于网页游戏转写，所以**只打开和使用“转写对比”**。转写过程中不得打开、选择或把
“TapTap 游戏预览”当作替代品；即使单预览已经打开，也必须发布 comparison receipt 并使用 source/target
pair。首次发布和每次阶段性验证的新 publication 成功后，都要立即调用 `prepare_visual_comparison`，确认
comparison receipt 的 target publication revision 等于当前发布 revision，再认领双 guest。

## 0. 建工作目录（t3m init）

一次转写 = 一个独立工作目录，所有产物收拢在这里：

```bash
t3m init "<游戏地址>" [--name <项目名>]     # 建 convert_game_YYYYMMDDHHMMSS/
cd convert_game_YYYYMMDDHHMMSS/
```

```text
convert_game_YYYYMMDDHHMMSS/
├─ project-info.json   项目信息：名称/地址/版本/阶段状态/产物记录
├─ source/             原版文件（t3m fetch 落这里）
└─ dest/               Maker 游戏工程（用官方 project/ensure 建绑定，见 0.1）
```

- 时间戳为北京时间（UTC+8），精确到秒；`--name` 不给时按 URL 尾段推导。
- 每完成一步就 `t3m mark project-info.json <阶段>`，重要产物 `t3m note project-info.json <key> <路径>`。
- **原版参考源码只进 `source/`，不进 `dest/`，不提交进仓库**。
- 完整规范见 [references/workspace.md](references/workspace.md)。

## 0. 铁律

1. **先取证，再写代码**。抓原版源码（`t3m fetch`），不要凭截图猜。
2. **先找根因，再改东西**。画面不对时，禁止直接调颜色/换模型——先用证据（日志、像素统计、材质取值打印）定位是哪一层错了。
3. **数值照搬，不重新设计**。原版的相机 FOV、光照强度、格子尺寸、动画时长、星级阈值都直接转写；引擎差异导致必须换算的，把换算依据写在注释里。
4. **一次只改一类东西；阶段性验证时才跑重闭环**。主流程是**代码转换**——按九步连续转写，廉价检查（`t3m lint`、纯逻辑对拍）随时可跑。
   Maker publish → `prepare_visual_comparison` → 双 guest → `t3m compare` + 远端 rlog 这条闭环很贵，
   **只在阶段性验证检查点执行**（见 0.0.1），不要做成“改一处就发布对比”的开发循环。运行时日志与可复核视觉证据才是真相；
   KayingCode side-pane 可用时不得启动本地 runtime，必须用官方发布、右侧双预览和远端日志验证。
5. **不让用户当调试器，非必要不人工确认**。需要交互验证时，先想办法让代码自己跑到那一步（临时自驱、埋点）。
   高风险清单、模块顺序、屏幕方向、修复方案都自动推进并报告结果；只有授权/登录、平台工具硬性要求用户选择、
   或明确不可逆的高成本操作才打断用户。
6. **没跑过就不算做完——但“跑”指阶段性验证，不是每改必验**。静态检查（LSP / `t3m lint`）**不执行代码**，看不见运行时 nil、渲染路径与 API 语义错误；
   KayingCode 中用同一远端 revision 的官方发布、publication runtime log、guest 取证与对拍完成运行时验证。
   这些证据**在阶段性验证检查点收齐**（步骤完成标志、最终验收、新 API 探针），阶段内连续写码不必逐次发布。
   做法见 [references/runtime-loop.md](references/runtime-loop.md)。
7. **引擎 API 先查再写，新路径先用探针验证**。`dest/engine-docs/` 与 `.emmylua/*.d.lua` 是权威，不要照 three.js 的记忆猜
   （`renderer:Render()` 这类不存在的 API 就是这么来的）。自定义几何、surface shader、UI 根面板、实例染色这类新路径，
   先用 5~20 行探针在官方发布的 target guest 与 publication runtime log 里确认"画面/日志里真的出现了"，再铺开。
8. **数据对 ≠ 画得出来**。几何自检只验顶点/绕序/包围盒时，上传方式错了也全绿——断言要落在引擎侧可观测的东西上
   （`GetNumGeometries`、`inView`、截图像素）。"数据全对、画面全无、日志干净"是这类坑的统一形态。

## 0.0.1 主流程 = 代码转换；重验证闭环只在阶段性验证时跑

这是本插件最贵的一条约束，优先级高于“多验几次更保险”的本能。

| 模式                 | 什么时候         | 做什么                                                                                            | 成本       |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| **代码转换（默认）** | 九步流程的阶段内 | 连续转写模块/数据/规则；随时 `t3m lint dest`；纯逻辑用 wasmoon/Node 与原版对拍                    | 低，可高频 |
| **阶段性验证**       | 下表检查点       | 完整闭环：Maker publish → `prepare_visual_comparison` → 双 guest 取证 → `t3m compare` + 远端 rlog | 高，要克制 |

**阶段性验证检查点**（只有这些情况才跑完整闭环）：

1. **first-publish gate**：源码本地化后发布空骨架并打开对比面板——一次，建立基线；
2. **新引擎 API 路径首次探针**：自定义几何、surface shader、UI 根面板、实例染色等新路径第一次铺开前；
3. **步骤完成标志需要画面/运行时证据时**：棋盘取景与亮度、角色可见与朝向、装饰层次、UI 对齐、音频可听、最终验收——对应 `pipeline.md` 各步的完成标志；
4. **卡住必须靠画面/日志才能定位根因时**：先集中修同类根因，再验一轮，不要边猜边发布；
5. **最终验收 / 交付**：同 revision 远端证据 + 双 guest 对拍 + `t3m mark accept`。

**禁止**把闭环当成开发循环：改一个函数、调一个颜色、补一个控件就 publish + prepare + 截图对比——太浪费。
**不要每改一处就发布对比**。阶段内允许连做多类代码修改，攒到检查点再验；阶段验证失败时**批量修根因 → 再进入下一轮**，不要逐次微调重试。
纯逻辑模块（关卡/规则/求解器）的完成标志以离线对拍为准，**不**为了它们单独跑视觉闭环。

## 0.0.2 子 agent：只读并行，写入串行

`Agent`/subagent 可用时，按“**1 个主写手 + N 个只读分析员**”使用：

- **主 agent 独占**：`dest/` 写入、`publish`、`prepare_visual_comparison`、双 guest 截图、`t3m compare`、最终验收。
- **只读子 agent 适合**：源码控制流、custom shader、材质/模型/动画/UI 盘点、独立复核。
- **禁止**：子 agent 并发写共享 `dest/scripts`、场景、UI 根节点；子 agent 调用 publish/prepare/截图/compare；子 agent 的结论未经主 agent 回源码验证就直接改代码。
- 只有文件所有权完全不重叠时，才允许模块写手（如 `TracksData.lua`/`Audio.lua` 各一个），主 agent 合并、lint、验收。
- 小项目（源码 < 5k 行、资产 < 30）默认不用子 agent；只在源码 > 5k 行、资产 > 30、或至少 3 个独立审计任务时启用。
- 子 agent prompt 必须包含：只读、不 publish/prepare、每条结论 `file:line`、输出 schema、停止条件。模板见 [references/subagents.md](references/subagents.md)。

子 agent 的输出是**假设**，不是事实；主 agent 必须回源码验证、去重、更新 `SOURCE_NOTES.md` 后才改代码。

## 0.0.3 视觉验收：同状态、同视口、有指标

- 标题/菜单/比赛等有动画的画面，先冻结时间/状态（如 `self.st = 0.0` 或暂停），再截双端；
- 两端同 viewport、同 UI 状态；随机/计时元素用最小 mask，并写明理由；
- 必须跑 `t3m compare` 并记录 `compare_metrics`；不同相位截图只能做线索，不能做验收；
- 同一检查点的视觉修复最多 2 轮；第 2 轮仍不达标，回到 `source/audit/*` 查根因，不要继续截图微调。

## 0.1 KayingCode：源码本地化后立刻建空项目并打开对比面板

加载 Skill 后先检查实际工具清单，并在第一次视觉检查前选择、记录 `visual_review_mode`：

- 同时有 `prepare_visual_comparison` 与 Browser Use，且当前是 KayingCode Desktop 本地工作区时，必须选择
  `kayingcode-side-pane`。side-pane 可用时不得启动 LocalRuntime，也不得执行未指定远端日志文件 `--dir` 的
  `t3m rlog <dest>`。这种默认 rlog 命中陈旧本地日志时只是无效证据，绝不是降级理由。
- **源码本地化（`t3m fetch` 拿到最终 playable URL）完成后，立即做三件事，中间不要插入人工确认**：
  1. 在 `dest/` 创建 TapTap **空项目**并确保绑定 `dest/.maker-mcp/config.json`。
     KayingCode 必须走内置 `kaying-for-taptap`：优先 `kaying-for-taptap_ensure_project`（已有目录则 ensure），
     空目录可用 `kaying-for-taptap_init_project`；**禁止**在 KayingCode 里另跑系统 `taptap-maker init`/`login`
     把 PAT/tap-auth 写进 `~/.taptap-maker`（会与插件 `makerHome` 双 home 分叉）。
     其他宿主无官方插件时才允许 `taptap-maker init`。已绑定则只确认 `dest/.maker-mcp/config.json`。
  2. 按下节判定屏幕方向：用户明确指定时服从用户；用户未指定时才按“竖屏可正常运行和交互则优先竖屏”自动判断。
     把决策写进项目与 `project-info.json`。
  3. 到达 **first-publish gate**（`dest/.maker-mcp/config.json` 存在、原版 playable URL 已确认、当前切片
     `t3m lint dest` PASS——空项目通常即 PASS）后，连续执行 Maker publish → `prepare_visual_comparison`，
     直接打开右侧“转写对比”。在 comparison receipt 成功前，禁止继续普通 Read/Edit/Bash 探针或继续其他模块；
     只有 publish/prepare 自身失败时才定位该失败。
- comparison receipt 成功后，**面板对比是阶段性验证的唯一视觉基准**，不是每改必跑的开发循环：
  阶段内连续转写（廉价检查随时做），只在 0.0.1 的检查点执行
  修改 → Maker publish → `prepare_visual_comparison` → 双 guest 取证（修改可批量，验一轮即可）。
  第一次画面允许只有空骨架，它就是修复基线；不要等 UI、玩法或全部探针完成才打开面板。
- **非必要不人工确认**：高风险转写清单写入 `source/report.md` 当作工作清单自动推进；模块顺序、方向选择、
  修复取舍都不停下来问用户。只有授权/登录、平台工具硬性要求用户选择（且无法写入项目配置绕开）、或明确
  不可逆的高成本操作才打断用户。
- 第一次 comparison receipt 成功后，所有画面观察、截图点击、亮度/布局判断和修复复查都优先在右侧 source/target
  guest 完成。阶段性验证用的目标代码变化后必须重新发布、重新 prepare；旧 target 截图不能验证新代码。
- **续做先实测**：恢复旧任务或更新 KayingCode 后需要继续对拍时，先按 [visual-compare.md](references/visual-compare.md)
  在当前会话调用 `agent.browsers.list()`。若已有回执属于当前会话且仍对应当前发布 revision，直接用它认领双 guest；
  若没有匹配的回执，先为当前会话和发布 revision prepare。历史错误和项目记忆不能作为本轮降级依据。
- **旧 receipt 不是 fallback**：每次 Maker publish 成功后，下一项外部动作必须是
  `prepare_visual_comparison`。旧 comparison receipt、旧 guest、旧截图或未指定 `--dir` 的旧 rlog 都不得验证新代码，
  也不得触发 LocalRuntime。必须先为当前 revision prepare，并核对 target publication revision。
- **远端阶段性验证闭环**：comparison receipt 成功且双 guest 可用后，检查点轮次固定为
  修改 → Maker publish → `prepare_visual_comparison` → 双 guest 取证。不得打开“TapTap 游戏预览”，不得执行本地
  `preview stop/start`、未指定远端日志文件的 `t3m rlog` 或本地窗口截图；只有**当前 revision** 的 publish、prepare、
  精确 guest pair 或 guest 加载明确失败，且远端错误与当前 publication runtime log 不足以定位时，才允许临时降级。
  官方工具失败必须报告并修复，绝不得绕过插件读取 PAT 再直接调用 Maker CLI；不得复制 `pat.json`、`tap-auth.json`。
- 只有比较 MCP/Browser Use 缺失，或当前 revision 的 publish、prepare、精确 guest pair、guest 加载明确失败，且远端错误与
  当前 publication runtime log 不足以定位时，才能记录 `visual_review_mode=local-runtime-fallback` 并选择本地兜底。
  降级记录必须包含失败的 operation/revision、失败步骤和具体原因；系统截图必须标记“双预览未执行”。条件恢复后
  下一轮自动回到 side-pane。
- “尚未做第一次发布”不是降级理由：源码本地化后就发布空项目并建立双预览，不先启动本地 preview，也不先铺完九步。

## 0.2 屏幕方向：用户明确要求最高优先级；未指定时竖屏可玩则优先竖屏

先读取当前用户请求中是否明确写了竖屏 / `portrait` 或横屏 / `landscape`，再定 `screen_orientation`
（写入 Maker 项目配置；已写入的不可改）：

1. **用户明确指定**：用户明确要求竖屏或横屏时，用户要求是最高优先级，直接采用；不得以源码比例、当前画面效果或
   自动判断覆盖。预览暴露的问题用于适配布局，不用于偷偷改方向。
2. **用户未指定**：才进入自动判断；先看源码侧证据：`meta viewport`、CSS `aspect-ratio` / `orientation` media query、canvas 宽高比、
   是否存在 landscape-only 布局（宽幅双栏、固定 16:9 舞台）。
3. **source guest 证据**：在“转写对比”里把 source guest 放到竖屏 viewport（如 720×1280）实测——核心玩法是否完整可见、
   主要交互（点击/滑动/键盘）是否可完成、HUD/菜单是否可读可点且不重叠。
4. **自动决策规则**：
   - 用户未指定且竖屏下核心玩法完整、HUD/菜单可读、主要交互可完成 → **优先竖屏**；
   - 竖屏裁切关键玩法、控件不可达/重叠、或原版是不可适配的硬编码横屏舞台 → **横屏作为保底**，并写明是哪一条不成立。
5. **记录**：`t3m note project-info.json orientation portrait|landscape` 与
   `t3m note project-info.json orientation_reason "<证据摘要>"`；后续 UI 布局、相机取景、`prepare_visual_comparison`
   的 viewport 都跟着这个方向走（竖屏例：720×1280，横屏例：1280×720）。
6. 转写竖屏关卡时，格子索引相关的映射（朝向/拾取/提示）必须整套旋转，见 `t3m lint` 的 `portrait-turn`。

## 1. 取证（t3m fetch）

```bash
t3m fetch "<游戏地址>" --out source/
t3m mark project-info.json fetch
t3m note project-info.json fetch_manifest source/FETCH_MANIFEST.txt
```

产出：`index.html`、ES 模块图里的所有自有 JS、CSS，以及 `FETCH_MANIFEST.txt`（含 importmap、被跳过的库文件与外部引用）。

- 库文件（`three.module.min.js`、`vendor/`、`*.min.js`）只记录不下载，避免污染分析。
- 若证书链有问题，加 `--insecure`。
- **门户地址往往是外壳，真正的游戏在 iframe 里，而且要两跳**：
  `play.<portal>/zh/g/<slug>`（Next.js 外壳）→ `…/embed/<slug>`（播放器页）→ `<cdn>/v/<hash>/index.html`（游戏本体）。
  `t3m fetch` 现在会自动跟随同站 wrapper 页一跳，并在结尾打印 **iframe / wrapper hop(s)** 与 **game entry candidate(s)**，
  manifest 里也记了 `next:` 那一行。按它抓第二跳：

  ```bash
  t3m fetch "<game entry candidate>" --out source/game/
  t3m analyze source/game/ --out source/report.md      # 分析、转写都以 source/game/ 的原版源码为准
  ```

  只抓到外套时（`source/` 里只有 `_next/`、`*.css`，`report.md` 几乎无命中）说明停在了外壳层，**不要**基于它写代码。

- 顺手确认渲染栈：`import ... from "three"` 说明是 three.js；`<canvas>` + 自绘说明是 Canvas 2D。
- Canvas 2D 游戏没有模块图，`fetch` 只能拿到页面与脚本文件——手绘逻辑照样转写，只是没有 importmap 可参考。
- **源码本地化完成 = 立刻进入 0.1 的空项目 + 对比面板**，不要停在“报告完等确认”。

## 2. 差异判定（t3m analyze）

```bash
t3m analyze source/ --out source/report.md
t3m mark project-info.json analyze
t3m note project-info.json report source/report.md
```

报告把源码里的 three.js 用法映射成**按风险排序的工作清单**（高风险 13 类：环境光失效、镜面 F0、Canvas 纹理、实例染色、DOM UI 换屏…）。这份清单就是后续逐项要处理的东西。

- **清单是工作清单，不是待确认项**：写入 `report.md` 后直接按风险顺序推进，并在对话里简要同步进展；
  不要停下来等用户批准每一项。完整映射表见 [references/engine-gap-map.md](references/engine-gap-map.md)；
  每个坑的症状/根因/证据/修法见 [references/pitfalls.md](references/pitfalls.md)。

## 3. 转写顺序

按 [references/pipeline.md](references/pipeline.md) 的九步走，**顺序本身很重要**：

1. **数据**：关卡/配置/词典 → Lua（`t3m levels`）。保持原版的索引语义（0 基就继续 0 基），只把字符串切片改 1 基。
2. **规则**：纯逻辑优先（移动、机关、求解器）。无渲染依赖，可以离线自检 + 求解器验证"有解"。
3. **棋盘**：场景、相机取景、光照、材质、机关表现。取景公式整段转写，别自己发明。
4. **角色**：模型部件清单、动画队列、朝向表。
5. **装饰**：道具、背景墙、粒子。氛围靠这些。
6. **界面**：标题/选关/结算/设置/商店。
7. **音频**：`text_to_sound_effect` / `text_to_music` 生成后接入。
8. **验收**：见第 5 节。

KayingCode side-pane 可用时，源码本地化后先建空项目、定方向、打开对比面板（first-publish 基线，一次）；
之后**按代码转换推进九步**，只在 0.0.1 的阶段性验证检查点走官方 Maker publish → `prepare_visual_comparison` → 双 guest 取证，
并对显式的远端 publication runtime log 执行分类检查。不先启动、重启或读取本地 runtime（日志与降级命令见 [references/runtime-loop.md](references/runtime-loop.md)）。

## 4. 高发陷阱（详见 references/pitfalls.md）

转写时**必然**遇到、且一定会以"看起来像玄学"的方式表现出来的：

- **环境光是 no-op**：默认 `AMBIENT_PREBAKED/SKYBOX` 下 `zone.ambientColor` 被引擎清零，必须 `zone.ambientSource = AMBIENT_COLOR`。症状：画面整体暗 2 倍以上。
- **镜面 F0**：three.js 非金属默认 0.04，本引擎要显式给 `MatSpecColor`；写成 0.45 会让掠射角的地面/台板整片泛白（正对镜头的地方却正常）。
- **坐标手系**：three.js 右手、本引擎左手（同 Unity）。相机在 +Z 看原点时世界 +X 落在屏幕**左**侧 → 棋盘会镜像、左右键手感反转；要统一翻转格子 X，**朝向表也要跟着翻**。
- **几何 UV 不同源**：内置 `Models/Box.mdl` 的 UV 与 three.js 不同，贴图会旋转 90°（箱子箭头变横向）。需要同源就 `RoundedBoxGeometry(...):ToModel()`。
- **UI 换屏**：绝不在 UI 事件回调里替换/销毁控件树（库会访问已释放控件并自旋死锁，Windows 报"无响应"且 CPU 打满）。换屏动作延迟到下一帧。
- **Canvas 纹理**：引擎没有 canvas 2D，按绘制逻辑转写成 `Image:SetPixel` + `Texture2D:SetData`，保持同一 PRNG 种子以便复现。
- **实例染色**：原版 `InstancedMesh.setColorAt()` 的逐实例颜色不能丢，否则整体偏暗（盖板原版提亮 1.25~1.45 倍）。
- **Node 显隐**：`node:SetEnabled(bool)`；`SetVisible` 只属于 UI 控件。
- **拾取**：`Camera:GetScreenRay(x, y)` 要 0..1 归一化坐标，且拿到的世界坐标要用与建棋盘相同的镜像映射还原格子。
- **存档**：相对路径 `File("save.json", FILE_WRITE)`；`GetProgramDir()` 返回空串，`load()`/`io` 已被沙箱移除。

第二次转写（3D 平台跳跃类）新暴露、且同样"看起来像玄学"的一批（pitfalls D/E 段，`t3m knowledge --landmines` 可打印）：

- **自定义几何**：`CustomGeometry` 没有索引缓冲（按 `DefineVertex` 顺序组三角形）→ 上传合并网格必须按索引逐三角形发顶点，并按 ~21k 三角形分块（16 位索引上限，超限静默掉面）。
- **`FillModel()` 后必须 `SetBoundingBox`**：否则包围盒不覆盖几何，网格被视锥剔除，**静默不画**（`inView` 仍为 true、日志干净）。
- **Model 的构建节点**：别在将要持有该 StaticModel 的节点（或其后代）上建临时 `CustomGeometry`，否则那个节点永远不画；角色走 `CustomGeometry` 直挂，静态道具走共享 Model。
- **引擎全局被遮蔽**：`local cache = {}` 会让该文件所有 `cache:…` 变成 nil 调用（引擎全局共 14 个，见 pitfalls E1）。
- **`Vector2/Vector3` 是值类型**：出参写回无效（相机取景函数踩过）；`Quaternion:EulerAngles()` 返回的是 `Vector3`，不是三个数。
- **shader 阶段**：`INSTANCE_COLOR` 只在 `vertex()` 可用（片元里引用会编译失败，并级联成整屏不渲染）；材质创建要能回落。
- **UI 根面板默认不透明**：会把 3D 画面整块糊住（"点击开始后场景是空的"）。
- **未发布的资源不要请求**：`ResourceCache` 对缺失路径记 ERROR，而 `cache:Exists` 探测不了 manifest 资源（会把音效全静音）。
- **灯组**：`LightGroup/Daytime.xml` 自带一盏太阳 + 引擎包里没有的 IBL，不要加载。

第三次转写（3D 塔防类，DOM 界面很重）新暴露的一批集中在 **UI 文字与布局**（pitfalls F 段）——
统一形态是"界面能跑、日志干净、两道门禁全绿，字还是被画坏了"：

- **Button 的 text 只有一行**：`urhox-libs/UI` 的 Button 用单行 `nvgText` 绘制，没有换行/省略号，
  超出边框就从字形中间裁掉。`\n` 不是换行符（会被当普通字符画在同一行）——"名称 + 费用"这种两行内容
  要用 Panel + 两个 Label；按钮宽度必须用 `UI.MeasureTextWidth` 量出来再加 padding。
- **文字不会自动缩小**：shrink-to-fit 只在 `UI.defaultAutoFitText = true`（即引擎 i18n 模块启用）时生效；
  项目自带 Lua 词表时它是关的。CJK 每字约 1em，照英文定宽再换中文必然溢出。
- **别关掉库的布局溢出检查**：`SetOverflowWarnings(false)` 关掉的是转写期唯一的机械布局体检
  （它报的是"子控件尺寸超出容器"）；它抛错说明某个控件的 box 是 NaN/inf，那是真 bug 的信号。
- **同名局部函数会吃掉控件方法调用**：`local function setText(w,t) … setText(w,t) … end` 调用的是自己，
  控件永远收不到值——界面数字静默冻结（`t3m lint` 的 `self-call-shadows-method` 专抓这个）。

同一轮还暴露了更贵的一类：**界面被"重新设计"而不是"转写"**，以及由此带偏的**流程与节奏**。
它们同样"零报错"，所以验收清单和 `t3m ui` 清单是唯一能拦住它们的东西（完整判定见
[references/ui-parity.md](references/ui-parity.md)）：

- **UI 是规格，不是风格**：原版有几个控件就转几个。别新增原版没有的常驻控件（常驻建造栏、常驻选择面板），
  也别把"点格子/点塔就地弹出的菜单"改成常驻工具条——那是交互机制被改写，不是样式差异。
- **位置与尺寸按 CSS 直译**：药丸（38px/圆角 20）、44×44 图标按钮、62px 圆形英雄头像 + 血条、
  150×60 两行绿色波次按钮 + 进度环——px 值直接进 props；别用"文字按钮 + 动作栏"替代图标按钮。
- **功能与显隐条件一起转**：每个控件的点击动作必须对应原版同一个动作；`hidden/on/pulse/poor/lock/sel/ready/down`
  这些状态决定控件何时出现/禁用/换文案，只转静态样式等于丢一半交互。
- **节奏节点**：谁开始第一波（原版手动就不要加自动开始）、波次按钮的显隐与提前召唤奖励、
  速度档位与其持久化、暂停菜单项、教程提示时序、波次横幅、结算卡可达性——逐条对齐，否则游戏节奏会变。
- **动手前先出清单**：`t3m ui source/game/ --out source/UI_INVENTORY.md`；
  `t3m mark project-info.json ui` 会在对齐表没填、或原版控件在转写代码里缺对应实现
  （`t3m ui source/game/ --check dest`）时拒绝——和 `accept` 一样是有意设计。
- **组合控件用 Panel + onClick**：Button 只有单行文字且子控件不参与布局（实测叠画）；
  任意控件都支持 `props.onClick`，所以"药丸/两行按钮/图标按钮"都用 Panel 组合
  （`t3m lint` 的 `button-addchild` 拦 Button+AddChild）。
- **阶段性验证要收尾，阶段内不要逐次发布**：KayingCode side-pane 可用时，界面等步骤在**检查点**（完成标志/对齐表收口）固定跑 lint → 官方发布 → prepare → 远端 publication runtime log → 双 guest 对拍 → `t3m note`；
  阶段内连续改控件/文案时只跑 `t3m lint`，攒到检查点再验。
  开发自测开关（`DEV_SMOKE` 这类）必须关——`dev-switch-on` 是高风险，开着它预览就是自驱画面，
  用户会说"看不到变化"。改结构用替换，不要用回退（`ui-parity.md` 第 2.6 节）。
- **文案必须能查到 key**：`t(key)` 查不到会原样把 key 画到界面上（实测端上出现过按钮写着 `paints`），
  `t3m lint` 的 `i18n-missing-key` 会逐条列出「用了但词表里没有」的 key；硬编码文案由
  `hardcoded-ui-text` 点出来。
- **菜单屏先抄骨架**：首页/标题屏一半是**没有 `data-*` 锚点**的容器与静态件（左上钱包 chip、
  右上角按钮、菜单列与行、页脚版权行）。`t3m ui` 的清单第三节会列出这些「布局骨架」+ 盒子模型，
  对齐表也逐行要求填——漏掉它们就是「首页差很多」。等宽菜单行用 `flexGrow = 1` 而不是固定 px 宽，
  图标在上文字在下要用 Panel + 两个 Label（`ui-parity.md` 第 2.7 节）。

## 5. 验收

KayingCode 中从首个可发布视觉检查点开始，通过 Maker publication + 远端 publication runtime log + 右侧双预览看效果，
最终再做一次同 revision 的远端构建与验收；这条路径不以本机 runtime 为前置。

- 逐条走查：[references/acceptance.md](references/acceptance.md)（17 项 + 运行时底线）。
  UI 文字那一条（每个界面 × 每个状态都不裁字、不压边）**必须用测量断言**，不能靠看截图"差不多"。
- 静态与远端运行时两道门禁都要绿：

```bash
t3m lint dest        # 静态：默认查 scripts/ 与 assets/**/*.shader；高风险 → 退出码 1
t3m rlog dest --dir dest/.maker/logs/runtime/runtime.log  # 分类同 revision 远端日志
t3m note project-info.json runtime_log dest/.maker/logs/runtime/runtime.log
t3m note project-info.json screenshot <右侧 target guest 截图路径>
t3m note project-info.json maker_url "<url>"
t3m mark project-info.json accept    # 缺 runtime_log / maker_url 会被拒绝（有意设计）
```

- **KayingCode 的视觉检查从首个可发布检查点就必须走双预览**：成功发布 TapTap 预览后，立即调用
  `prepare_visual_comparison`（传最终 playable 原版 URL 与 `dest/`），再按
  [references/visual-compare.md](references/visual-compare.md) 匹配回执对应的 source / target
  两个 tab。两边进入相同确定性检查点、按 receipt viewport 串行截图后，运行 `t3m compare`；后续视觉修复轮
  重复 publish → prepare → 双截图，不回退到本地窗口截图。
- 默认最多执行 3 个 comparison pair、最多 2 轮自动修复；单侧截图失败也消耗该 pair，先修复取证条件，
  不得原样无限重试。Desktop 双 guest 不可用时明确降级为“未执行”，不伪造视觉验收。
- 必须同时查看 `source.png`、`target.png`、`diff.png` 和 `metrics.json`；只有 profile 的 global 与所有
  required ROI 全部通过，才能说“像素对齐通过”。动态粒子、计时器或随机内容必须先用有理由的 mask
  排除，不能靠放宽全局阈值掩盖。
- 把 `compare_source` / `compare_target` / `compare_diff` / `compare_metrics` / `compare_operation`
  五项写入 `project-info.json`；`mark accept` 会提示缺失、文件失效、代码或 publication 更新后证据过期，
  以及 metrics verdict 未通过。

- **亮度对齐不要靠肉眼**：截取棋盘区域的像素统计（中位亮度/均值）与原版对比，差距压到 15% 以内；过曝/过暗都先在光照标定里解决，别去改材质颜色。
- **没达标就照实写**：某一项确实达不到（引擎能力边界 / 尚未定位）时，把实测数字记进 `pixel_stats` 并注明"未达标"，
  在交付说明里列为已知差异；`t3m mark accept` 只校验证据**存在**，判定由你负责（细节见 acceptance.md 第四节）。
- 参考案例（含每一步的实测数字）见 [references/case-crate-keeper.md](references/case-crate-keeper.md)。

## 6. 交付

- KayingCode 中用 Maker MCP 的 `maker_build_current_directory` 提交构建，在同 revision 远端 publication runtime log 与双 guest 证据通过后，把返回的 maker_url 给用户，并 `t3m note project-info.json maker_url "<url>"` 记录。
- 手机体验需要测试二维码时再走 `generate_test_qrcode`（用户明确要求时）。
- 工作目录整体不提交进仓库（`source/` 原版文件 + `dest/` 构建产物都不提交）。

## 工具

CLI 源码与当前平台预编译二进制都随内置 `kaying-for-taptap` 分发。KayingCode 通过
`kaying-for-taptap_transcription` 调用它并强制 workspace 边界；**不要**修改 `PATH`、不要从旧插件目录
取二进制，也不要在会话里 `cargo build`。若工具报告当前平台二进制缺失，应停止并报告内置插件产物不完整，
不能用 curl、旧 cache 或临时脚本顶替（取证策略与门禁都在内置二进制里）。

| 命令                                                                                       | 用途                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `t3m init <url> [--name NAME]`                                                             | 新建工作目录 `convert_game_YYYYMMDDHHMMSS/`（信息文件 + source/ + dest/）                                                                       |
| `t3m fetch <url> --out <dir>`                                                              | 抓取页面 + 模块图 + CSS；自动跟随同站 iframe wrapper 一跳，并提示真正的游戏入口                                                                 |
| `t3m analyze <dir> --out <report.md>`                                                      | 生成按风险排序的转写工作清单                                                                                                                    |
| `t3m ui <源码目录> --out <UI_INVENTORY.md> [--json]`                                       | 提取原版 UI 规格：页面容器 / CSS 盒子模型 / 控件清单（`data-*` 锚点 + class + 文案 key）/ 屏幕与导航 / 键盘指针映射 / 节奏计时节点 + 逐条对齐表 |
| `t3m ui <源码目录> --check <dest>`                                                         | **对齐下限检查**：原版每个可操作控件在转写 UI 代码里都要有对应实现，缺失 → 退出码 1                                                             |
| `t3m levels <file.js> --out <file.lua> [--name CKData.LEVELS]`                             | 关卡/配置数组 → Lua 表                                                                                                                          |
| `t3m lint <项目> [--json] [--all]`                                                         | 转写后体检（含引擎坑位、未发布资源、shader 阶段、UI 文字尺寸与换行；高风险 → 退出码 1）                                                         |
| `t3m rlog <项目> [--dir <会话或日志>] [--json]`                                            | **运行时门禁**：找最新 runtime.log 并分类裁决（不通过 → 退出码 1）                                                                              |
| `t3m compare <source.png> <target.png> --profile <profile.json> --out <证据目录> [--json]` | 同尺寸逐像素计算 changed-pixel、RGB MAE/RMSE、SSIM、全局/ROI 中位亮度并输出 diff；必检区失败 → 退出码 1                                         |
| `t3m mark <info> <stage> [status] [--force]` / `t3m note <info> <k> <v>`                   | 更新阶段状态（`ui` 要控件清单、`accept` 要运行时证据） / 记录产物路径                                                                           |
| `t3m knowledge [--markdown] [--landmines]`                                                 | 引擎差异知识库 / 引擎 API 坑位表                                                                                                                |
| `t3m doctor`                                                                               | 环境体检：本机 runtime 与 `preview` 命令族、LSP、ImageMagick、node/curl                                                                         |

CLI 源码位于内置插件的 `native/threejs-to-taptapmaker/`（Rust；依赖已锁定）。二进制由
`kaying-for-taptap` 的 `build:native` 在目标平台构建并进入内置插件发布物；终端用户不需要也不应该编译。
