# KayingCode 双预览与像素对齐

## 0. 铁律：diff 是线索，不是规格

> **截图/对比图只回答“哪里不一样”，不回答“应该改成什么”。**
> 任何视觉修改前，必须在 `source/` 中找到并记录证据：`文件:行号 + 具体值/分支/资源 + 期望行为`。
> 找不到源码证据时禁止编辑，先补取证（源码、运行时 DOM、GLB 材质、资源、动画）。
> 修复按根因批量进行，禁止按截图逐像素/逐区域微调。
> 同一检查点视觉修复最多 2 轮；超过则停止截图重试，回到源码审计。

使用顺序：

1. 冻结同一状态/视口的双端截图（标题/菜单/比赛等动画画面先冻结时间或暂停）；
2. 用 diff/metrics 定位差异区域，只把区域当作“线索”；
3. 把区域映射到源码 owner：DOM/CSS、custom shader、材质、模型、动画、相机、光照、UI；
4. 写 root-cause note（`source_evidence` + `root_cause`）后再改代码；
5. 修完在同一状态/视口复验；不达标先回 `source/audit/*`，不要继续截图微调。

不同相位的截图只能做线索，**不能做验收**。像素统计、材质取值、光照标定只用于定位，不作为修改规格。

## 1. 发布比较会话

**源码本地化完成后的第一组外部动作**就是创建 TapTap 空项目、判定屏幕方向（用户明确方向时服从用户；
用户未指定且竖屏可正常运行和交互时优先竖屏，横屏只作保底），
然后发布这个空骨架并打开右侧“转写对比”。使用客观门禁决定第一次发布，不再判断“画面是否已经值得比较”，
也不停下来等人工确认。该门禁不依赖本地 preview 或 `t3m rlog`；以下三项同时成立即到达
**first-publish gate**：

1. `dest/.maker-mcp/config.json` 存在，项目已绑定（空项目即可）；
2. 最终原版 playable URL 已确认；
3. 当前切片 `t3m lint dest` 返回 PASS（空项目通常即 PASS）。

门禁到达后，下一组外部动作必须连续执行 Maker publish → `prepare_visual_comparison`。在 comparison receipt 成功前，
不得继续普通 Read/Edit/Bash 探针、继续转写其他模块或把发布留到最终验收；只有 publish/prepare 自身失败时，才执行直接用于
定位该失败的操作。第一次对比允许画面不完整（空骨架也可）——它就是后续修复的基线，不要求 UI、玩法或全部探针已经完成。

发布成功后确认工作区存在
`.maker/kaying-for-taptap/preview-publication.v1.json`。然后调用插件 MCP 工具：

```json
{
  "projectRoot": "/absolute/workspace/convert_game_xxx/dest",
  "sourceUrl": "https://example.com/final-playable-game/",
  "viewport": { "width": 720, "height": 1280 }
}
```

工具名是 `prepare_visual_comparison`。`session_id`、`workspace_key`、`workspace_path` 与 Plugin ID
由 KayingCode 宿主注入，不要作为参数臆造。成功后会原子写入
`.maker/threejs-to-taptapmaker/compare-publication.v1.json`，右侧“转写对比”面板自动挂载。

**viewport 跟随已判定的屏幕方向**：竖屏用 720×1280（或项目选定的竖屏尺寸），横屏用 1280×720；
不要用默认横屏 viewport 去验一个已判定竖屏的项目。方向判定与证据见 SKILL.md 0.2。

方向优先级不能反转：用户明确要求竖屏或横屏时，用户要求是最高优先级；只有用户未指定时，才在 source guest
比较候选 viewport。此时竖屏下核心玩法完整、HUD/菜单可读且主要交互可完成就优先竖屏；竖屏破坏关键体验时
才以横屏保底并记录失败证据。

任何一次用于阶段性验证的重新发布后都重新调用工具，旧 revision 不能用来验新代码。
**主流程是代码转换**：阶段内连续写码，只在 SKILL.md 0.0.1 的检查点（first-publish 基线、新 API 探针、
步骤完成标志、最终验收）跑完整对比闭环，不要每改一处就 publish + prepare。
comparison receipt 成功且双 guest 可用后，检查点轮次固定为修改 → Maker publish → `prepare_visual_comparison` → 双 guest 取证；
发布必须走官方 Maker MCP。
不得打开“TapTap 游戏预览”，也不得再执行本地 `preview stop/start`、未指定远端 `--dir` 的 `t3m rlog` 或本地窗口截图。
每次 publish 成功后都必须先为当前 revision 重新 prepare；旧 comparison receipt 或陈旧 rlog 不得触发 LocalRuntime。
只有当前 revision 的远端 publish/prepare/精确 guest pair/guest 加载明确失败，且远端错误与 publication runtime log 不足以定位时，
才允许记录原因后临时回到本地 runtime；官方工具报错时不得绕过插件读取 PAT 再直接调用 Maker CLI；不得复制 `pat.json`、`tap-auth.json`。

当 `prepare_visual_comparison` 与 Browser Use 已出现在工具清单时，本流程是 KayingCode 的默认视觉与运行时观测路径。
从第一次发布起就不启动本地 runtime，直接读取同 revision 的远端 publication runtime log。只有 publish、prepare、
精确 guest pair 或 guest 加载明确失败，且远端错误与 publication runtime log 不足以定位时才能降级；记录具体原因与 `visual_review_mode=local-runtime-fallback`，
失败记录必须包含 operation/revision、失败步骤与具体原因；能力恢复后下一轮重新 prepare。

这条能力只在 KayingCode Desktop 本地工作区可用。若宿主没有暴露 browser user tabs、双 guest 不完整，
或当前是 Web/mobile/远程工作区，明确报告“未执行双预览视觉验收”，继续保留 lint/rlog 与人工截图证据；
不得伪造 tab、URL、截图路径或把单侧截图当作 pair。

## 2. 精确认领两个 guest

1. 在当前会话按 Browser Use 的 `control-browser` 初始化，调用 `agent.browsers.list()` 确认可用的 IAB，
   然后读取 `browser.tabs.list()` 和 `browser.user.openTabs()`。恢复任务或升级后可沿用同时匹配当前会话和当前发布
   revision 的回执。以这次调用的结果为准，即使旧记录写过 Browser Use 不可用。
2. 取 prepare 响应给出的组名 `plugin-compare:<pluginId>:transcription-compare:<sessionId>`，或用已保存回执的字段构造该组名。
   对 `browser.user.openTabs()` 按 `tabGroup` 精确匹配。对已认领的 `browser.tabs.list()` 按组名加
   `:source:` 或 `:target:` 的完整 ID 前缀匹配。
3. 两份列表合起来必须恰好一个 source、一个 target，且 URL 分别等于 receipt。
4. 已认领的用 `browser.tabs.get(id)`，其余用 `browser.user.claimTab(id)`。两边均调用
   `tab.setViewportSize(publication.viewport)`。多候选、缺候选、URL 不符时记录本轮结果。
5. 左右各自用自己的 screenshot observation 操作；不得把左侧 observation 用于右侧。

同一 scope 对已认领 tab 再次 `claimTab` 是**幂等成功**（续预算 / 换 tool cell 重绑）。不要因为
第二次 claim 返回成功就以为 tab 被替换；也不要改成新建替代页。

把游戏带到同一个可复现状态：优先菜单、暂停页、固定关卡起点、无随机粒子的 HUD。**有动画/计时的画面必须先冻结时间或暂停**（例如标题屏固定 `self.st`），两端必须同状态、同 viewport；随机/计时元素用最小 mask 并写明理由。最终证据按
source → target 顺序串行调用 `nodeRepl.emitImage(await tab.screenshot())`，记录工具返回的
`Browser screenshot saved to:` 原始 PNG 绝对路径，按下节复制到工作区。截图完成后必须运行
`t3m compare` 并记录 `compare_metrics`；只有截图、没有 metrics 的结果不能作为验收依据。

默认预算是**最多 3 个 comparison pair、最多 2 轮自动修复**。任一侧截图失败即消耗当前 pair，
本轮结论为“证据不足”并停止原样重试；先定位并修复截图/页面状态问题，只有状态发生变化后才能进入下一 pair。

### 2.1 认领 / 点击失败树

`browser.user.openTabs()` 为空、claim 失败、或截图/点击 `backend_unavailable` 时，**按 error.reason 分支**，
不要空转重试同一调用：

| reason / 现象                                | 含义                                        | 下一步                                                                                                                    |
| -------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `agent.browsers.list()` 抛错或当前未提供 IAB | 当前会话未能连接内置浏览器                  | 记录本次调用的原始错误或实际后端列表及当前 revision                                                                       |
| （openTabs 空 + tabs.list 空）               | 双 guest 尚未挂载，或 host 未暴露 user tabs | 确认 `prepare_visual_comparison` 已成功且面板已挂载；仍空则记 `visual_review_mode=host-guests-unavailable` 并停止视觉分支 |
| `tab_not_found`                              | tabId 不在注册表（旧 UUID / 已关闭）        | 重新读 openTabs 取**当前** pair 的新 id；禁止复用历史 tabId                                                               |
| `tab_closed`                                 | tombstone                                   | 同上；关闭后重开会是新 child UUID，不能续用旧 id                                                                          |
| `tab_claimed_elsewhere`                      | 已被其它 scope 认领                         | 只能在同一 session/workspace 操作；换会话则停止并报告                                                                     |
| `tab_scope_mismatch`                         | window/workspace/session 不一致             | 用 receipt 的 sessionId 重读 openTabs，核对 tabGroup                                                                      |
| `tab_not_ready`                              | 普通 human tab 仍是空白页                   | 等页面加载出真实 URL 再 claim；产品壳层 guest（`:source:`/`:target:`/`taptap-preview:`）不受此限                          |
| 截图 `backend_unavailable`                   | guest 未附着 / CDP 未就绪                   | 先 claim 并 `tabs.list()` 确认 tab 仍在；仍在则等一拍后重试**一次**截图                                                   |
| 点击无效果                                   | 可能点在游戏画布外或页面状态已变            | 重新 screenshot observation 后再点；不要复用旧 observation 坐标                                                           |

恢复顺序固定为：**重新 list → 按 tabGroup/URL 精确匹配 → claim（可幂等）→ 设 viewport → 截图/点击**。
仍失败才写 `visual_review_mode` 降级原因；禁止伪造截图、禁止把单侧画面当 pair、禁止新建替代网页冒充 guest。

## 3. comparison profile v1

profile 由具体转换工程维护。坐标是 receipt viewport 的 CSS pixel，所有阈值必须显式填写；插件不提供
“万能默认阈值”。示例只说明结构，不代表已经对某个游戏校准：

```json
{
  "schemaVersion": 1,
  "checkpoint": "level-1-paused",
  "reason": "暂停后棋盘、HUD 与菜单均为确定性画面",
  "state": "level-1-paused",
  "freeze": "paused",
  "thresholds": {
    "pixelDelta": 8,
    "changedPixelRatioMax": 0.02,
    "rgbMaeMax": 4,
    "rgbRmseMax": 8,
    "ssimMin": 0.98,
    "medianLumaDeltaMax": 8
  },
  "regions": [
    {
      "id": "board",
      "reason": "核心棋盘必须逐区通过",
      "rect": { "x": 160, "y": 120, "width": 960, "height": 480 },
      "required": true,
      "thresholds": {
        "pixelDelta": 8,
        "changedPixelRatioMax": 0.01,
        "rgbMaeMax": 3,
        "rgbRmseMax": 6,
        "ssimMin": 0.99,
        "medianLumaDeltaMax": 6
      }
    }
  ],
  "masks": [
    {
      "id": "timer",
      "reason": "两引擎时钟无法在同一毫秒冻结",
      "rect": { "x": 1120, "y": 16, "width": 120, "height": 48 }
    }
  ]
}
```

阈值应由至少两个已完成案例的确定性检查点校准后再作为项目门禁。mask 必须有具体理由，并保持最小矩形；
禁止用整屏 mask 或放宽全局阈值掩盖可修复差异。

## 4. 生成并阅读证据

将 Browser Use 保存的两张原始 PNG 按字节复制到转换工程的
`verify/visual-compare/<comparison-operation-id>/`，分别命名为 `source.png` 和 `target.png`。
转写 MCP 从工作区读取输入。`cwd` 使用转换工程相对工作区的路径，其余路径相对 `cwd`。
调用 `kaying-for-taptap_transcription`，将示例中的目录和 operation ID 换成本次实际值。

```json
{
  "command": "compare",
  "cwd": "convert_game_demo",
  "arguments": [
    "verify/visual-compare/<comparison-operation-id>/source.png",
    "verify/visual-compare/<comparison-operation-id>/target.png",
    "--profile",
    "verify/compare-profile.v1.json",
    "--out",
    "verify/visual-compare/<comparison-operation-id>",
    "--json"
  ]
}
```

输入尺寸不一致会直接失败，工具不会 resize、拉伸或裁剪。输出固定为：

- `source.png`：原版截图的原始文件副本；
- `target.png`：TapTap 截图的原始文件副本；
- `diff.png`：同坐标色差热图，mask 区为灰色；
- `metrics.json`：changed-pixel ratio、RGB MAE/RMSE、SSIM、全局与每个 ROI 的中位亮度及判定。

逐项查看四个文件，先从 failedChecks 与 diff 的集中区域定位渲染/布局问题，再回代码修复。
**先批量修完一类根因**，再重新发布 TapTap → 重新 prepare → 重新截图 → 写入新的 operation 证据目录
（不要逐次微调就重验）。完成后记录：

```bash
t3m note project-info.json compare_source verify/visual-compare/<operation-id>/source.png
t3m note project-info.json compare_target verify/visual-compare/<operation-id>/target.png
t3m note project-info.json compare_diff verify/visual-compare/<operation-id>/diff.png
t3m note project-info.json compare_metrics verify/visual-compare/<operation-id>/metrics.json
t3m note project-info.json compare_operation <comparison-operation-id>
t3m note project-info.json pixel_stats "<关键指标 + PASS/未达标>"
```

required ROI 或 global 任一失败时 `t3m compare` 返回退出码 1；即使差异看起来小，也不能称为通过。
`t3m mark project-info.json accept` 会检查上述路径，并在 metrics 比目标 Lua 或最新 TapTap publication
更旧、或 metrics verdict 未通过时发出警告。
