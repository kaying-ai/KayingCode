# 转写插件真实项目回放评估报告

- 日期：2026-11-13
- 分支：`plugin/transcription-source-first`
- 回放对象：Turbo Tails（`https://turbo-tails.vercel.app/`）
- 原工程：`/Users/feng/codes/games/opentaptap/1111/convert_game_20261111130547`
- 回放工程：`/Users/feng/codes/games/opentaptap/1111/replay-validation-20261113/convert_game_20261113113752`
- 回放范围：**有界回放**，验证插件的审计与验收门禁；不重跑 26 小时完整转写，不修改原工程。

---

## 1. 回放方法

### 1.1 目标

验证 Phase 1–3 的插件改动在真实项目上是否：

1. 能自动发现 Turbo Tails 的关键转写事实（模型分支、custom shader、材质、动画、光照/阴影）；
2. 能把“源码优先”落成可检查的证据（`SOURCE_NOTES.md` / `visual_fixes`）；
3. 能在 compare 证据缺失/未通过/过期时拒绝 `accept`；
4. 能在证据齐全时正常通过；
5. 暴露插件的误报、漏报和可用性问题。

### 1.2 步骤

```bash
# 1. 新工作区（自动生成 SOURCE_NOTES + source/audit/README）
t3m init "https://turbo-tails.vercel.app/" --name turbo-tails-replay --dir <replay-root>

# 2. 对原版源码跑审计（输出到回放工作区）
t3m audit <original>/source --out <replay>/source/audit

# 3. 填写源码事实台账与视觉修复台账
#    source/SOURCE_NOTES.md
#    source/audit/visual-fixes.md

# 4. 用原工程的双端截图跑 compare
t3m compare source.png target.png --profile profile.json --out verify/compare/out

# 5. 记录 artifacts 后验证 accept
t3m mark <replay>/project-info.json accept          # 真实 metrics → 应拒绝
t3m mark <replay>/project-info.json accept --force  # 逃生口 → 应通过
```

---

## 2. 回放结果

### 2.1 `t3m init`

新工作区自动生成：

- `source/SOURCE_NOTES.md`（含 `（待填）` 模板）
- `source/audit/README.md`（七类审计清单）
- `project-info.json`、`source/`、`dest/`

**结论：符合 Phase 2 设计。**

### 2.2 `t3m audit`

对真实 Turbo Tails 源码（`source/`，含 33 MB `index.html`、`game.pretty.js`、`style.css`）：

| 指标                |   结果 |
| ------------------- | -----: |
| 扫描文件            |      3 |
| 证据命中            |  1,158 |
| GLB 材质            |    281 |
| 带 `COLOR_0` 的网格 |     97 |
| 运行时间            | 0.15 s |
| 输出体积            | 212 KB |

主题分布：

| 主题         | 命中 |
| ------------ | ---: |
| control-flow |   43 |
| shaders      |   78 |
| materials    |   48 |
| models       |   44 |
| animations   |   49 |
| lighting     |  518 |
| ui           |  378 |

关键命中（人工核对为真实游戏代码）：

| 主题         | 证据                   | 说明                                   |
| ------------ | ---------------------- | -------------------------------------- |
| control-flow | `game.pretty.js:39175` | `nb` / `?char=old` / `URLSearchParams` |
| models       | `game.pretty.js:39186` | `s["kart_" + id + "_r13" + nb]`        |
| models       | `game.pretty.js:39519` | `s["driver_" + id]` fallback           |
| shaders      | `game.pretty.js:39253` | `uFace` / `uDecal`                     |
| shaders      | `game.pretty.js:39298` | `customProgramCacheKey = "r13face"`    |
| shaders      | `game.pretty.js:39345` | `uNeckM` / `uNeck`                     |
| animations   | `game.pretty.js:40101` | `wheelSpin += speed / 0.27`            |
| animations   | `game.pretty.js:40106` | 前轮 steer / drift                     |
| animations   | `game.pretty.js:39543` | `Wob_` 尾巴/耳朵弹簧                   |
| lighting     | `game.pretty.js:45463` | tone mapping                           |
| lighting     | `game.pretty.js:45522` | `shadow.bias = -2e-4`                  |
| lighting     | `game.pretty.js:45523` | `shadow.normalBias = 0.06`             |
| lighting     | `game.pretty.js:46569` | `shadow.camera`                        |
| lighting     | `game.pretty.js:46583` | `Ci.get("tsun")`                       |
| lighting     | `game.pretty.js:46596` | `shadowMap.autoUpdate`                 |

GLB 材质表样例（来自 `materials.md`）：

| 文件                       | 材质       |         baseColor | metallic | roughness | clearcoat | emissiveStrength | doubleSided |
| -------------------------- | ---------- | ----------------: | -------: | --------: | --------: | ---------------: | ----------- |
| `asset_kart.glb`           | Paint      | 0.013 0.147 1.000 |    0.300 |     0.300 | **1.000** |                — | false       |
| `asset_kart.glb`           | Accent     |                 — |    0.100 |     0.350 | **0.600** |                — | false       |
| `asset_kart.glb`           | Headlight  | 1.000 0.922 0.687 |    0.000 |     0.500 |         — |        **3.000** | false       |
| `asset_kart_frog_r13a.glb` | Sculpt_fox |           texture |    0.000 |     0.400 |         — |                — | **true**    |

**结论：审计能在 0.15 s 内给出可回源码核对的关键线索，GLB 材质表是本次最有价值的自动化产物。**

### 2.3 源码证据与视觉修复台账

回放填写了：

- `source/SOURCE_NOTES.md`：模型分支、角色语义、face/neck/ex shader、车辆动画、标题光照/阴影、材质特性、观众/场景。
- `source/audit/visual-fixes.md`：5 条视觉修复，每条带 `source_evidence`。
- `project-info.json`：`visual_fixes`、`gameplay_screenshot`、`compare_*`、`visual_review_mode=kayingcode-side-pane`。

**结论：证据模板可用；`source_evidence` 能直接指向 `game.pretty.js:行号` 和目标 Lua 文件。**

### 2.4 compare：真实旧截图

用原工程 2026-11-12 的双端 390×867 截图跑 `t3m compare`：

| 指标                |                                       结果 |
| ------------------- | -----------------------------------------: |
| changed pixel ratio |                                  **97.2%** |
| RGB MAE             |                                  **60.65** |
| RGB RMSE            |                                  **81.75** |
| SSIM                |                                  **0.151** |
| median luma         | source 86.25 → target 116.57（**+35.2%**） |
| verdict             |                                   **FAIL** |

**说明**：两端截图不在同一 9 秒轨道相位，且目标含中文 UI/不同 logo；这组数字不能直接当作构图结论。它验证的是 **compare gate 会拒绝当前状态**，而不是“转写质量 97% 不对”。

### 2.5 accept 门禁

| 场景                                   | 结果                                            |
| -------------------------------------- | ----------------------------------------------- |
| 真实 metrics（verdict=false）          | **拒绝**，退出码 2，提示重新发布/双截图/compare |
| `--force`                              | 通过，退出码 0                                  |
| 合成 passing metrics（仅验证通过路径） | 通过；仍提示 `pixel_stats` 未达标               |

**结论：硬门禁按设计工作；`--force` 逃生口有效。**

---

## 3. 审计线索 vs 目标实现

| 审计线索                                                                            | 目标工程现状                                                       | 判定                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `39175/39186/39519`：默认 r13a，generic 只是 fallback                               | `VisualsLib.lua:98-120` 比赛用 generic + driver                    | **不一致（已知）**           |
| `39253/39298/39345`：face/neck shader                                               | `kart_frog_r13a/Materials/Sculpt_fox.xml` 只有 PBRDiffNormal       | **缺失（已知）**             |
| GLB Paint clearcoat 1.0 / Accent 0.6                                                | `kart/Materials/Paint.xml` 无 clearcoat；`Accent.xml` 无 clearcoat | **缺失（已知）**             |
| GLB Accent 使用 COLOR_0                                                             | `Accent.xml` `MatDiffColor = 1 1 1 1`，未用顶点色                  | **缺失（已知）**             |
| GLB r13a `doubleSided=true`                                                         | `Sculpt_fox.xml` 无 `cull="none"`                                  | **缺失（已知）**             |
| GLB Headlight/Exhaust/Taillight emissiveStrength 3/2.5/3                            | 目标 `MatEmissiveColor` 已乘强度（3/2.5/3）                        | **看起来已烘焙，需逐项核对** |
| `40101-40144`：车轮/Wob\_/眨眼/头部                                                 | `Kart.lua:535-548` 每帧把 wheel rotation 归零                      | **缺失（已知）**             |
| `45463/45522/45523/46569/46571/46583/46596`：tone mapping、shadow bias/camera、tsun | `Build.lua:759-795` 固定太阳、`shadowResolution=0.65`、无 bias/CSM | **缺失（已知）**             |
| `33267-33308`：6×30 观众 + 跳动                                                     | `Build.lua:598-616` 3×18 静态                                      | **缺失（已知）**             |

**结论**：审计能覆盖本次复盘中除 `ab()` 提前返回之外的主要根因；目标实现是否对齐仍要主 agent 逐条读代码，门禁不会自动判断。

---

## 4. 评估

### 4.1 有效点

1. **审计速度快**：0.15 s 扫完 33 MB 源码，适合每个检查点重复跑。
2. **GLB 材质表**：281 个材质、clearcoat/emissiveStrength/doubleSided/COLOR_0 一次列出，直接对应本次最大的材质管线缺口。
3. **关键事实命中**：`?char=old`、`kart_*_r13a`、face/neck shader、wheelSpin/Wob\_/blink、title tsun/shadow 都能定位到行。
4. **门禁正确**：真实失败 metrics 被拒绝；`--force` 可用；合成通过 metrics 能走通。
5. **模板可用**：`SOURCE_NOTES.md`/`visual_fixes` 能承载 file:line 证据，accept 会检查。

### 4.2 回放中发现并修复的插件问题

| 问题               | 现象                                                     | 修复                                                 |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| 缺少光照/阴影主题  | 首轮 audit 完全没提 `tsun`/`shadow.camera`/`toneMapping` | 新增 `lighting` topic + checklist                    |
| 全局采样截断晚行   | `game.pretty.js:45522/46583` 等游戏代码在 80 行截断之外  | 改为**按文件**首 200 + 尾 200；本次 1,158 条全部保留 |
| `tsun` 模式过宽    | 命中 three.js `getSunLight` 噪声                         | 改为匹配字符串字面量 `"tsun"`                        |
| pretty/bundle 重复 | `game.bundle.js` 与 `game.pretty.js` 重复计数            | 有 `.pretty.js` 时跳过 `.bundle.js`                  |

### 4.3 仍然存在的缺口

1. **`ab()` 提前返回没有直接命中**：audit 命中 `driver_` fallback 行（39519），但没有命中 `39514` 的 `if (t) return t`；agent 仍需读函数上下文。
2. **JS 噪声仍在**：1,158 条中大量是 bundle 内联 three.js 库代码；`lighting` 518 条、`ui` 378 条。已加 per-file 计数和摘要提示，但没有自动过滤库代码。
3. **`gameplay_screenshot` 只查存在**：回放用了 2026-11-12 13:25 的旧比赛截图，仍被接受；没有 freshness/内容校验。
4. **`visual_fixes` 只查子串**：只检查文件里是否出现 `source_evidence`，不校验每行。
5. **硬门禁依赖 `visual_review_mode`**：原工程记录的是 `local-runtime-fallback`；如果不改成 `kayingcode-side-pane`，缺 compare 只会 warning。回放是手动设置 side-pane 才触发硬门禁。
6. **compare 截图不同相位**：本次 metrics 只能验证门禁，不能作为构图验收；需要冻结时间/暂停后再截。
7. **没有 subagent A/B**：本次未验证子 agent 的收益，仍是 Phase 0/4 的工作。
8. **native 二进制未重建**：回放用的是 `cargo build --release` 产物；发布用 `bin/` 还是旧版。

### 4.4 评分

| 维度            |  评分 | 说明                                                      |
| --------------- | ----: | --------------------------------------------------------- |
| 源码事实召回    | 4.5/5 | 主要根因全覆盖；`ab()` 提前返回需人工补读                 |
| GLB/材质审计    |   5/5 | 281 材质、clearcoat/emissive/doubleSided/COLOR_0 直接可见 |
| 动画/光照审计   | 4.5/5 | 修复后能命中 wheel/Wob/blink/tsun/shadow；库噪声仍在      |
| 信噪比          |   3/5 | 1,158 条，库代码占比高；per-file 采样有帮助               |
| compare 门禁    |   5/5 | 真实失败拒绝、force 可用、合成通过可走                    |
| 证据台账        |   4/5 | 模板可用；`visual_fixes` 校验偏弱                         |
| 文档/命令一致性 | 4.5/5 | 命令、技能、参考文档已同步；仍需回放校准阈值              |
| 回放范围        |   4/5 | 有界回放，未覆盖完整转写与 subagent A/B                   |

---

## 5. 建议

### P0（下一轮优先）

1. **补 `ab()`/`rb()` 控制流模式**：audit 增加 `function ab` / `return null` / `if (t) return t` 等线索，或输出“函数调用图”片段，减少人工补读。
2. **`gameplay_screenshot` 加 freshness 检查**：至少比较截图 mtime 与目标代码 mtime；能读图片时再检查是否为标题屏/比赛屏。
3. **`visual_fixes` 结构化校验**：按表格行检查 `source_evidence` 列非空，而不是只查文件里有没有这个词。
4. **`visual_review_mode` 缺失时的策略**：如果存在 `compare_*` artifact 或 KayingCode side-pane receipt，但没记录 `visual_review_mode`，应 warning/拒绝，避免绕过硬门禁。

### P1

5. **降低库噪声**：给 audit 加 `--exclude/--focus`，或标记“library hit”；至少把 `three.module`/`game.bundle` 的库段落单独计数。
6. **目标侧一致性审计**：`t3m audit --target dest` 对比源模型分支/材质/动画与目标实现，直接输出 missing 列表。
7. **compare 确定性检查**：profile 增加 `freeze`/`state` 字段，或要求截图前记录冻结方式；不同相位直接判“证据不足”。
8. **把 Turbo Tails 回放固化成 golden test**：当前是人工冒烟，后续改 audit 模式时容易回归。

### P2

9. subagent A/B（Phase 0/4）。
10. 三平台 native 二进制构建与发布。
11. compare profile 阈值校准（同相位、同状态后重新定标）。

---

## 6. 复现与产物

### 6.1 回放产物

- 回放工程：`/Users/feng/codes/games/opentaptap/1111/replay-validation-20261113/convert_game_20261113113752`
- 审计输出：`source/audit/`（`SUMMARY.md` + 7 个 topic + GLB 材质表）
- 源码台账：`source/SOURCE_NOTES.md`
- 视觉修复台账：`source/audit/visual-fixes.md`
- compare 证据：`verify/compare/source.png`、`target.png`、`out/diff.png`、`out/metrics.json`
- accept 证据：`project-info.json` 的 artifacts

### 6.2 复现命令

```bash
BIN=<plugin>/native/threejs-to-taptapmaker/target/release/t3m
REPLAY=<replay-dir>
SRC=/Users/feng/codes/games/opentaptap/1111/convert_game_20261111130547/source

"$BIN" audit "$SRC" --out "$REPLAY/source/audit"
"$BIN" compare "$REPLAY/verify/compare/source.png" "$REPLAY/verify/compare/target.png" \
  --profile "$REPLAY/verify/compare/profile.json" --out "$REPLAY/verify/compare/out"
"$BIN" mark "$REPLAY/project-info.json" accept
"$BIN" mark "$REPLAY/project-info.json" accept --force
```

---

## 7. 结论

- **插件已经能在真实项目上自动发现本次复盘的主要根因**：模型分支、face/neck shader、GLB 材质特性、车辆动画、标题光照/阴影。
- **compare 硬门禁按设计工作**：真实失败 metrics 被拒绝，`--force` 可用，合成通过路径能走通。
- **剩余问题主要是“证据强度”和“信噪比”**：`ab()` 提前返回、旧 `gameplay_screenshot`、`visual_fixes` 只查子串、`visual_review_mode` 依赖、库代码噪声。
- **本次回放还发现并修复了 4 个插件缺陷**：缺 lighting topic、全局采样截断、`tsun` 模式过宽、pretty/bundle 重复。
- 建议按 P0/P1 继续：补控制流线索、加强截图/台账校验、降低库噪声、做目标侧一致性审计，然后进入 Phase 0/4 的 subagent A/B。
