# 转写九步（顺序本身就是方法）

每一步都有"完成标志"，没达到就别进入下一步——后面的东西都建在前面之上，混着改会同时引入多个根因，调试成本翻倍。

**主流程是代码转换**：阶段内连续转写，廉价检查（`t3m lint`、纯逻辑对拍）随时做；
**重验证闭环**（Maker publish → `prepare_visual_comparison` → 双 guest → `t3m compare` + 远端 rlog）
**只在阶段性验证检查点跑**——见 SKILL.md 0.0.1。不要把“每改一处就发布对比”当成推进方式，太浪费。

需要画面/运行时证据的步骤，其完成标志在**检查点**收齐：同 revision 的远端 publication runtime log 经
`t3m rlog` PASS（0 Lua 报错、0 项目资源缺失、日志不比代码新）+ 对应视觉证据。只看静态检查不算完成——
实测过一次"LSP 0 error + lint 全绿 + 远端构建成功，然后一启动就崩 6 处"。
完整方法见 [runtime-loop.md](runtime-loop.md)。纯逻辑步骤（数据/规则）的完成标志以离线对拍为准，不单独跑视觉闭环。

前置：先 `t3m init "<游戏地址>"` 建工作目录 `convert_game_YYYYMMDDHHMMSS/`（内含 `project-info.json` + `source/` + `dest/`），之后所有命令都在该目录内执行。每完成一步就 `t3m mark project-info.json <阶段>`。完整工作目录规范见 [workspace.md](workspace.md)。

> **先建"最小可视闭环"**：拿到第一帧画面（场景骨架 + 一个方块 + 一段日志）之后再铺内容。
> 顺序是"能跑 → 跑对 → 铺满"，不是"铺满 → 一看崩了 → 反推"。
>
> KayingCode Desktop 中，源码本地化后**立即**创建 TapTap 空项目、判定屏幕方向（用户明确要求优先；
> 未指定时竖屏可玩则优先竖屏，横屏保底），
> 并用首个 publication + 右侧“转写对比”打开面板（first-publish 基线，**一次**）；空骨架即可，不要等内容铺完。
> 之后回到代码转换，只在阶段性验证检查点再跑完整闭环。转写不使用“TapTap 游戏预览”；当前 revision 的
> publish → prepare → 双 guest + 远端日志是默认路径。只有当前 revision 的双预览能力或发布明确失败，且远端证据
> 不足以定位时才降级本地 runtime，并记录 operation/revision 与原因。
> 高风险清单与后续决策按工作清单自动推进，非必要不人工确认。

## 0 取证

```bash
t3m fetch "<游戏地址>" --out source/
# 门户页只是外壳时：按结尾提示抓真正入口（/embed/ → <cdn>/v/<hash>/index.html）
t3m fetch "<game entry candidate>" --out source/game/
t3m analyze source/game/ --out source/report.md
t3m mark project-info.json fetch && t3m mark project-info.json analyze
t3m note project-info.json report source/report.md
```

- 确认渲染栈（three.js / Canvas 2D）、模块划分、关卡与配置的来源文件。
- **抓对层**：`t3m fetch` 会自动跟随同站 wrapper 页一跳并打印 iframe / game entry 候选；
  `source/` 里只有 `_next/` 和 css、`report.md` 几乎无命中 → 停在外壳层了，别据此写代码。
  原版源码与 `report.md` 一律以真正的游戏入口（`source/game/`）为准。
- 顺手确认可玩路径：主菜单 → 关卡 → 过关，把状态机画出来（后面 UI 转写照这个走）。
- **把界面也当数据取证**：`t3m ui source/game/ --out source/UI_INVENTORY.md`，得到页面容器、CSS 盒子模型、
  控件清单（`data-a`/`data-r`/`data-k` + class + 文案 key）、屏幕与导航、键盘/指针映射、节奏与计时节点。
  这是第 6 步的规格书：**控件 1:1、位置尺寸按 CSS 直译、功能与显隐条件逐条对照**（见 [ui-parity.md](ui-parity.md)）。
  清单是骨架，模板字符串里看不见的东西要回源码补齐。
- **源码控制流认证**（写代码前必做）：URL/query 参数、feature flag、主路径 vs fallback（如
  `rb()`/`ab()`/`?char=old`）、模型/资源选择、每角色/每关卡覆盖。每条写 `file:line` + 触发条件 +
  目标实现位置，写入 `source/audit/control-flow.md`。
- **custom shader 盘点**：搜 `onBeforeCompile`、`ShaderMaterial`、`customProgramCacheKey`、
  `onBeforeRender`、`material.clone`、`envMapIntensity`、`emissiveIntensity`；列出注入点、uniform、
  依赖的几何/UV/法线、目标实现状态（已转/近似/未转），写入 `source/audit/shaders.md`。
- **材质 parity**：对每个源 GLB 材质与目标 XML 对比 baseColor、metallic/roughness、clearcoat、
  emissiveFactor/emissiveStrength、doubleSided、alphaMode、COLOR_0 顶点色、texture/UV/tangent；
  写入 `source/audit/materials.md`。
- **模型语义映射**：建立 `id → 显示名 → 模型 → 图集 → 颜色` 表，用运行时资源或 GLB 节点验证；
  不要假设 id 等于显示名（例如 `frog` id 的模型可能是狐狸）。写入 `source/audit/models.md`。
- **动画盘点**：GLTF animation + 程序化动画（车轮 spin/steer、Wob\_ 弹簧、眨眼、头部 look、UI tween），
  标出目标实现位置与状态，写入 `source/audit/animations.md`。
- 以上审计的**已确认事实**同步写入 `source/SOURCE_NOTES.md`，每条带 `file:line`；上下文压缩前/检查点更新，
  压缩后先读它，不凭摘要记忆。
- 同时开始读 Maker 工程自带的资料：`dest/AGENTS.md`、`dest/engine-docs/`（`api/globals.md`、
  `recipes/procedural-geometry.md`、`recipes/surface-shader.md`、`recipes/rendering.md`、
  `gotchas/`）与 `.emmylua/*.d.lua` 类型存根。**引擎 API 的"能调用什么"以这些为准**，
  不要照 three.js 的记忆猜（`renderer:Render()` 这类不存在的 API 就是这么来的，见 pitfalls E4）。
- **KayingCode：源码本地化完成立刻接空项目 + 对比面板**（见 SKILL.md 0.1/0.2），不要把 analyze/ui
  做成“报告完等确认”的停顿点。
- **完成标志**：`report.md` 生成，高风险项清单能逐条说清"在哪、要做什么"；`UI_INVENTORY.md` 生成；
  `source/audit/*.md` 与 `source/SOURCE_NOTES.md` 已建立，关键分支/材质/动画/模型语义都有 `file:line` 证据。

## 1 数据

```bash
t3m levels source/.../levels/data.js --out dest/scripts/CKData.lua --name CKData.LEVELS
t3m mark project-info.json levels
```

- 关卡、世界主题、词典（i18n）、每日池一次性搬完。
- **索引语义保持不变**：原版数据用 0 基格子索引，Lua 侧继续用 0 基（只把字符串切片改 1 基），这样求解器/邻居表和原版算法能逐行对应。
- **完成标志**：条目数与原版一致（例：120 关 + 48 每日池），字段名逐个核对。

## 2 规则

- 纯逻辑先转写：解析、移动、机关（冰面滑行、压力板闸门、滑槽传送、坑填埋、传送带）、撤销、求解器。
- 无渲染依赖 → 离线自检，而且要用**真 Lua** 跑（wasmoon / lua 5.4），与原版 JS 在 Node 里的输出逐字段 diff
  （方法见 runtime-loop.md 第 8 节）。只做"解析通过"是不够的：要证明与原版**逐位一致**。
- **完成标志**：全量关卡解析通过 + 抽样求解成功，且求解出的推数与原版记录一致。完成后 `t3m mark project-info.json rules`。

## 3 棋盘

- 场景骨架（Zone/Octree/Camera/Viewport）、取景公式、光照灯组、材质、地板/墙/目标、五种机关的表现与逐帧动画。
- 数值全部照搬原版（FOV、倾角、留白、格子尺寸、墙高、动画时长）。
- Maker 工程在 `dest/` 内，本地预览都在 `dest/` 里跑。
- **程序化几何先过探针**：合并网格上传、自定义 shader、UI 根面板这类新路径，先用最小探针在真 runtime 里
  确认"屏幕上真的出现了"，再铺开（pitfalls D1~D3 三个坑都是"数据全对、画面全无"）。
- **相机取景函数不要用出参**（Vector3 是值类型，见 pitfalls E2）。
- **完成标志**：`t3m rlog dest` PASS（启动 0 Lua 报错）+ KayingCode 右侧双预览里棋盘布局与原版同向
  （第 1 关玩家在左、目标在右）+ 亮度量化接近（见 acceptance.md），并留一张截图。完成后 `t3m mark project-info.json board`。
  非 KayingCode 或双预览明确失败时，才用本地 runtime 系统截图替代并记录 fallback 原因。

## 4 角色

- 部件清单（靴/裤/衬衫/帽/围巾）按原版尺寸搭；动画队列（步伐/滑行/下落/传送）按原版时长与缓动。
- **按 `source/audit/animations.md` 逐条接**：GLTF animation 与程序化动画（车轮 spin/steer、Wob\_ 弹簧、
  眨眼、头部 look、UI tween）都要有目标实现位置；不要只做静态模型，也不要假设“模型自带”就会动。
- **朝向表要跟着坐标镜像一起改**。
- 关节角色走"每部件一个节点 + `CustomGeometry` 直挂"，静态道具走"合并几何 + 共享 Model"（pitfalls D3/D4）。
- **完成标志**：角色**在画面里可见**（截图确认，不要只看 `inView`）+ 四个方向的朝向与行进方向一致；
  推动时姿态朝向被推的箱子；`t3m rlog dest` 仍 PASS。完成后 `t3m mark project-info.json character`。

## 5 装饰

- 道具（货架/木桶/麻袋/盆栽/箱堆/托盘/猫/鸟）、背景墙（砖 + 窗 + 卷帘门）、地面、粒子。
- 氛围几乎全靠这一步；但也要控制节点数量（每格一个节点 × 数百格 + 装饰 → 实测 200 FPS 无压力，但别再无节制加）。
- **完成标志**：背景层次与原版一致（能看到货架与后墙），粒子/摆动/巡逻在动，且帧率不掉（`t3m rlog` 无逐帧报错）。完成后 `t3m mark project-info.json decoration`。

## 6 界面

**这一步是"照着清单搭"，不是"用引擎控件重做一遍"**。规格书是第 0 步生成的 `source/UI_INVENTORY.md`，
判定标准与直译表见 [ui-parity.md](ui-parity.md)：

- **控件 1:1**：原版有几个控件就转几个；不合并、不新增——**尤其不要新增原版没有的常驻控件**
  （常驻建造栏、常驻选择面板）。原版在点到的格子/塔旁弹菜单的，就继续弹菜单（锚定规则一起转）。
- **位置与尺寸直译**：CSS 的 px 直接进 props（`position/left/top/width/height/padding/gap/font-size/border-radius`）；
  药丸就是药丸（38px 高/圆角 20），图标按钮就是 44×44 图标按钮，两行按钮就是两行。
- **功能不变 + 显隐条件一起转**：`hidden/on/pulse/poor/lock/sel/ready/down/maxed` 决定控件何时出现、
  何时禁用、文案何时替换；只转静态样式等于丢一半交互。
- **节奏节点逐条对齐**：谁开始第一波（原版是手动、没有自动倒计时）、波次按钮的显隐与提前召唤奖励、
  速度档位与其持久化、暂停菜单项、教程提示时序、波次横幅、结算卡可达性——见 ui-parity.md 第 3 节。
- **文字尺寸量出来**：宽度用 `UI.MeasureTextWidth(text, Theme.FontSize(字号pt), 字体, 字距)` + 左右 padding
  （Button 默认 16/边）；两行内容用 Panel + 两个 Label，别往 Button 的 text 里塞 `\n`（pitfalls F1~F5）。
- **所有换屏走延迟执行**（pitfalls B3）；**根面板透明**，3D 画面就是底（pitfalls E6）。
- 保留库自带的布局溢出检查（`SetOverflowWarnings`）——它是这一步唯一的机械体检。
- 中英双语按原版词典搬；触屏与桌面的布局差异按原版规则切（窄屏弹窗变 sheet 这类规则一起转）。
- **完成标志**：`source/UI_INVENTORY.md` 第七节「逐条对齐表」填满；`t3m ui source/game/ --check dest`
  无缺失控件（或缺失项都有"不做"的书面理由）；每个屏都有截图与原版并排比过位置；
  每个控件的五种状态（能点/不能点/选中/冷却/满级或买不起）都对过；键盘层逐条按过；
  随便打两波确认节奏与原版一致；HUD 的数字随玩法变化（金币/波次/倒计时动了才算接上——只改变禁用态不算，
  `t3m lint` 的 `self-call-shadows-method` 专门拦"看着在刷新、其实没写值"）。
  完成后 `t3m note project-info.json ui_inventory <路径>` 再 `t3m mark project-info.json ui`
  （对齐表没填满、或控件缺失都会被拒绝）。
- **阶段性验证要收尾，阶段内不要逐次发布**：检查点一轮 = lint → 官方发布 → prepare → rlog → **重新截图** → `t3m note screenshot`（截图比代码旧会被警告）；
  阶段内改控件/文案只跑 `t3m lint`。验证失败先批量修根因再验一轮。
  组合控件用 Panel + onClick（Button+AddChild 子控件不布局会叠画，`button-addchild` 会拦；
  改结构用替换不要用回退）；开发自测开关（`DEV_SMOKE` 这类）关掉再交付（`dev-switch-on` 会拦）。
  见 [ui-parity.md](ui-parity.md) 第 2.5/2.6 节。

## 7 音频

- `text_to_sound_effect` 生成音效（步/推/滑/到达/掉落/传送/撤销/过关），`text_to_music` 生成循环 BGM。
- **校验非静音**，按代码约定命名（例如 `dest/assets/audio/ck_bgm.mp3`）。
- **只请求确实随包发布的文件**：缺文件就让代码静默跳过，不要制造 `Could not find resource …`（pitfalls E8）；
  生成音乐要花时间就先不接，把曲目登记在表里，文件到位再开。
- **完成标志**：预览里能听到音效与音乐，设置里的开关生效，`t3m rlog` 无资源缺失。完成后 `t3m mark project-info.json audio`。

## 8 验收

```bash
t3m lint dest                     # 硬门禁：高风险必须 0
t3m rlog dest                     # 硬门禁：必须 PASS
t3m note project-info.json runtime_log <runtime.log 路径>
t3m note project-info.json screenshot <截图路径>
t3m note project-info.json pixel_stats "棋盘区域 mean/L p50 对比结果"
t3m note project-info.json compare_source verify/visual-compare/<operation>/source.png
t3m note project-info.json compare_target verify/visual-compare/<operation>/target.png
t3m note project-info.json compare_diff verify/visual-compare/<operation>/diff.png
t3m note project-info.json compare_metrics verify/visual-compare/<operation>/metrics.json
t3m note project-info.json compare_operation <operation>
t3m mark project-info.json accept  # 缺 runtime_log / maker_url 会被拒绝（有意设计）
```

- 逐条走查 [acceptance.md](acceptance.md)（17 项 + 运行时门禁）。
- KayingCode Desktop 按 [visual-compare.md](visual-compare.md) 完成双 guest 同 viewport 对拍；默认最多 3 pair、
  2 轮自动修复，单侧失败即停止本轮。`mark accept` 会警告 compare 证据缺失或比代码/publication 旧。
- **验收前先对证据**：`source/SOURCE_NOTES.md` 存在且关键事实带 `file:line`；`project-info.json` 的
  `visual_fixes` 每条都有 `source_evidence`；compare metrics 与最新 publication revision 对齐；
  至少一张最终 gameplay 截图（不只标题屏）；known gaps 与已完成分开写。
- **确定性对比**：有动画/计时的画面先冻结时间或暂停，两端同状态、同 viewport；随机/计时元素用最小 mask
  并写理由；必须跑 `t3m compare`。不同相位的截图只能做线索，不能做验收。
- **未达标的项要写清**：实测数字 + 已知差异 + 为什么停在这里（见 acceptance.md 第四节），
  不要用"基本一致"糊过去——门禁只校验证据存在，判定由你负责。
- **完成标志**：17 项验收全过 + `t3m rlog` PASS + 真机可玩 + maker_url 交付
  （`t3m note project-info.json maker_url "<url>"`）+ 探针/临时代码已清除。
