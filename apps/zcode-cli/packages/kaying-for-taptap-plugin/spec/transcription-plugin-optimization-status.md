# 转写插件优化：当前状态与剩余工作

- 分支：`plugin/transcription-source-first`
- Phase 1 提交：`f5165b25` `docs(taptap): enforce source-first transcription workflow`
- Phase 2 提交：`892a0d96` `feat(taptap): warn on missing source evidence at accept`
- Phase 3 提交：`34cb98c5` `feat(taptap): add source audit and compare acceptance gate`
- 交接文档提交：`4fb50b0e` `docs(taptap): add transcription plugin optimization handoff`
- 分支基线：`codex/fix-transcription-compare` @ `564dbb9e`
  - 该基线比 `origin/main` @ `44bf9e86` 多一个已有提交：`fix(taptap): discover comparison guests through Browser Use`
  - 如果要只把本次优化合入 `main`，可从 `origin/main` 建分支后 cherry-pick `f5165b25`；如果对比 guest 修复也要一起合，则直接使用本分支
- 状态：**Phase 1 完成；Phase 2（warning 级）已实现；Phase 3（audit + compare hard gate）已实现；Phase 0/4 未开始**
- 注意：工作区里 `bin/darwin-arm64/kaying-for-taptap-core`、`bin/darwin-arm64/t3m` 是本次之前就存在的本地改动，**没有纳入提交**；Phase 2 改了 native Rust 源码，但**没有重建/提交发布用二进制**，发布前需要走 `build:native` 或 CI

---

## 1. 这次做了什么（Phase 1）

目标：把“源码是规格，截图是线索”从建议变成可执行约束，并明确 subagent 的使用边界。

### 1.1 核心规则

`skills/threejs-to-taptapmaker/SKILL.md` 新增：

> 截图/对比图只回答“哪里不一样”，不回答“应该改成什么”。任何视觉修改前，必须在 `source/` 找到并记录
> `文件:行号 + 值/分支/资源 + 期望行为`；找不到源码证据时禁止编辑；修复按根因批量进行；
> 同一检查点最多 2 轮。

同时新增：

- `0.0.2 子 agent：只读并行，写入串行`
- `0.0.3 视觉验收：同状态、同视口、有指标`
- `source/SOURCE_NOTES.md`、`source/audit/*.md`、`visual_fixes` 台账要求

### 1.2 子 agent 策略

新增 `references/subagents.md`：

- 推荐拓扑：**1 个主写手 + N 个只读分析员**
- 主 agent 独占：`dest/` 写入、publish、prepare、双 guest 截图、`t3m compare`、最终验收
- 子 agent 只读：control-flow / shaders / materials / models / animations / UI / verifier
- 子 agent 不写 `dest/`、不 publish/prepare、结论必须带 `file:line`
- 只有文件所有权完全不重叠时才允许模块写手
- 小项目（源码 < 5k 行、资产 < 30）默认不用子 agent
- 附 prompt 模板、输出 schema、度量指标、反模式

### 1.3 源码审计清单

`references/pipeline.md` step 0 新增：

- `source/audit/control-flow.md`：URL 参数/feature flag/主备分支/模型选择
- `source/audit/shaders.md`：`onBeforeCompile`/`ShaderMaterial`/`customProgramCacheKey`/`onBeforeRender`
- `source/audit/materials.md`：baseColor/metallic/roughness/clearcoat/emissiveStrength/doubleSided/COLOR_0/texture/UV/tangent
- `source/audit/models.md`：id/显示名/模型/图集/颜色
- `source/audit/animations.md`：车轮/Wob\_/眨眼/头部/UI tween
- `source/audit/ui.md`：控件与骨架件

`references/workspace.md` 新增 `SOURCE_NOTES.md` 和 `visual_fixes` 的模板。

### 1.4 确定性对比与验收

`references/visual-compare.md`：

- 新增“diff 是线索，不是规格”
- 有动画/计时的画面先冻结时间或暂停
- 两端同状态、同 viewport
- 必须跑 `t3m compare` 并记录 `compare_metrics`
- 不同相位截图只能做线索，不能做验收

`references/acceptance.md`：

- 同状态截图
- 最终 gameplay 截图（不只标题屏）
- `source/SOURCE_NOTES.md` + `visual_fixes` 的 `source_evidence`
- compare metrics 与最新 publication revision 对齐
- 视觉修改的准入规则：没有源码证据不算完成

### 1.5 复盘反例

`references/pitfalls.md` 新增 H 节：

- H1 按截图调相机：4.45 → 6.6 → 10.2 m，最后回到源码 6.3 m
- H2 误读 `ab()` fallback：把 generic + driver 当成主路径
- H3 只看大色块：漏掉 face/neck/ex shader、法线、双面、clearcoat

### 1.6 命令与技能路由

- `commands/transcribe-web-game.md`：重复铁律；step 3 加源码审计；step 6 加 root-cause note + 2 轮上限；约束改为 source-first
- `commands/maker-transcription-lint.md`：视觉类 finding 走 source-first；accept 前检查证据
- `skills/visual-repair-loop/SKILL.md`：转写场景不用该 skill 的 repair loop，走 source-first + 转写对比

### 1.7 测试

`test/transcription-skill-policy.test.ts` 新增 5 个 policy tests：

1. 源码优先铁律
2. 只读子 agent 策略
3. 源码审计 + 确定性对比
4. Turbo Tails 反例
5. visual-repair 让位给 source-first

---

## 2. 验证结果

| 检查                           | 结果                           |
| ------------------------------ | ------------------------------ |
| 插件 `pnpm test`               | 40 pass / 0 fail               |
| 插件 `pnpm typecheck`          | 通过                           |
| 插件 `pnpm lint`               | 0 warnings / 0 errors          |
| 根 `pnpm run typecheck`        | 通过                           |
| 根 `pnpm run lint`             | 0 errors（127 个既有 warning） |
| `oxfmt --check`（改动文件）    | 通过                           |
| `architecture:check --changed` | 0 violations                   |

---

## 3. Phase 2 已实现与剩余工作

### Phase 2：已实现（warning 级）

目标：让 `SOURCE_NOTES.md` / `visual_fixes` / `gameplay_screenshot` 从“文档要求”变成 `mark accept` 能检查的产物。

**已实现**（`native/threejs-to-taptapmaker`）：

1. `t3m init` 自动生成：
   - `source/SOURCE_NOTES.md` 模板（含 `（待填）` 占位）
   - `source/audit/README.md`（control-flow/shaders/materials/models/animations/lighting/ui 清单）
2. `mark accept` 新增 warning（不阻断 accept）：
   - 缺 `source/SOURCE_NOTES.md` / 空文件 / 仍是模板 / 没有 `file:line` 证据
   - 缺 `artifacts.visual_fixes` / 文件不存在 / 没有 `source_evidence`
   - 缺 `artifacts.gameplay_screenshot` / 文件不存在
3. `--force` 行为不变；`runtime_log` / `maker_url` 仍是硬门禁。
4. 原有 compare 警告继续生效：缺 `compare_*`、文件不存在、metrics 比代码/publication 旧、verdict 未通过。

**改动文件**：

- `native/threejs-to-taptapmaker/src/workspace.rs`：模板、`source_evidence_warnings`、accept 调用、单元测试
- `native/threejs-to-taptapmaker/src/main.rs`：`init`/`mark`/`note` 帮助文案
- `skills/threejs-to-taptapmaker/references/acceptance.md`：`gameplay_screenshot` / `visual_fixes` 证据
- `skills/threejs-to-taptapmaker/references/workspace.md`：init 自动生成与记录点
- `commands/transcribe-web-game.md` / `commands/maker-transcription-lint.md`：accept 前记录 `visual_fixes` / `gameplay_screenshot`
- `test/transcription-skill-policy.test.ts`：断言 `gameplay_screenshot`

**验证**：

- `cargo test`：7 passed / 0 failed
- `cargo build --release`：通过
- 冒烟：`t3m init` 生成 `SOURCE_NOTES.md` + `source/audit/README.md`；`mark accept` 在缺证据时输出上述 warning，仍成功标记 done
- 插件 `pnpm test`：40 passed / 0 failed
- 插件 `pnpm typecheck` / `pnpm lint`：通过

**未做 / 注意**：

- 没有把 warning 升级为 hard fail；Phase 3 再按回放校准。
- 没有重建/提交发布用二进制；发布前走 `build:native` 或 CI，三平台一起更新。
- compare 的 revision 一致性仍用 mtime 代理（现有逻辑），没有做 receipt/revision 的精确比对。
- `visual_fixes` 只检查是否包含 `source_evidence` 字样，不校验每行；Phase 3 可做结构化校验。

### Phase 3：已实现（audit + compare hard gate）

**已实现**：

1. `t3m audit <source-dir> [--out <audit-dir>] [--json]`
   - 扫描 `js/mjs/html/css`（跳过 vendor/minified）
   - 输出 `SUMMARY.md` + `control-flow.md` / `shaders.md` / `materials.md` / `models.md` / `animations.md` / `ui.md`
   - 每个 topic 带 `file:line` + 片段 + 命中词 + “需要回答”清单
   - 自动把 `audit` 记录到 `project-info.json` 的 artifacts（能找到 project-info 时）
2. `t3m mark accept` 的 compare 硬门禁：
   - `visual_review_mode=kayingcode-side-pane` 但没有 `compare_metrics` → 拒绝
   - `compare_metrics` 文件不存在 / 非法 JSON / 缺 `verdict.passed` → 拒绝
   - `verdict.passed=false` → 拒绝
   - metrics 比目标代码或最新 publication 旧 → 拒绝
   - `--force` 仍可绕过
3. 非 side-pane 模式下缺 compare 证据仍只 warning，避免破坏 remote/local fallback。
4. 文档与命令更新：`pipeline.md` step 0 加 `t3m audit`、`transcribe-web-game.md` step 3 加 `t3m audit`、`acceptance.md` 加硬门禁说明。
5. `src/tools/transcription-cli.ts` 白名单加入 `audit`，TS 测试覆盖。

**验证**：

- `cargo test`：12 passed / 0 failed
- `cargo build --release`：通过
- 冒烟：`t3m audit` 生成 7 个 topic 文件 + SUMMARY + GLB 材质表；`mark accept` 在
  `visual_review_mode=kayingcode-side-pane` + `verdict.passed=false` 时退出码 2
- 真实 Turbo Tails 源码回放：扫描 3 个文件、640 处证据、**281 个 GLB 材质、97 个带 COLOR_0 的网格**；
  命中 `39175`（`?char=old`）、`39186`（`kart_*_r13a`）、`39253`（uFace/uDecal）、
  `40101`（wheelSpin）、`39543`（Wob\_）等关键行
- 当 `game.pretty.js` 存在时自动跳过 `game.bundle.js`，避免重复命中
- 插件 `pnpm test`：40 passed / 0 failed

**真实项目回放**：已用 Turbo Tails 做有界回放，报告见
[transcription-plugin-replay-evaluation.md](transcription-plugin-replay-evaluation.md)。

- `t3m audit`：0.15 s、1,158 处命中、281 个 GLB 材质、97 个 COLOR_0 网格
- `t3m compare`：真实旧截图 verdict FAIL，`accept` 拒绝、`--force` 通过
- 回放中发现并修复：缺 lighting topic、全局采样截断晚行、`tsun` 模式过宽、pretty/bundle 重复

**未做**：

- 子 agent prompt 生成器（可选，未实现）
- 把 Turbo Tails 回放固化成自动化 golden test（当前是人工冒烟）
- `t3m audit` 噪声调优：bundle 内联的 three.js 库代码仍会产生通用命中
- 目标侧一致性审计（`t3m audit --target dest`）
- `visual_fixes` 的结构化逐行校验（仍只检查 `source_evidence` 字样）
- `gameplay_screenshot` 的 freshness/内容检查
- `visual_review_mode` 缺失时的硬门禁策略

### Phase 0/4：回放与 A/B（约 1 周）

1. 用 Turbo Tails 回放一次“只读审计”阶段：
   - 单 agent vs 1 主 + 3 只读
   - 记录 wall-clock、关键事实召回、压缩次数、token
2. 用一个小模块比较“单写手” vs “互斥文件写手”。
3. 决策：
   - 分析阶段收益 ≥20% → 默认启用只读子 agent
   - 实现阶段冲突/返工升高 → 只保留只读分析
4. 更新 `SKILL.md` 的 subagent 阈值和 `references/subagents.md` 的度量。

**验收**：

- 子 agent 没有 publish/prepare/写 `dest/` 的记录。
- 关键事实召回不低于单 agent。
- 视觉修复轮次不增加。

---

## 4. 继续方式

### 4.1 拉分支、跑基线

```bash
cd /Users/feng/codes/kaying-office/kaying-code-v2
git switch plugin/transcription-source-first
cd apps/zcode-cli/packages/kaying-for-taptap-plugin
pnpm test
pnpm typecheck
pnpm lint
```

### 4.2 先读这三个文件

1. `spec/transcription-plugin-optimization-plan.md` — 完整体检方案与 Phase 1 实施记录
2. `skills/threejs-to-taptapmaker/SKILL.md` — 新的铁律、子 agent、确定性对比
3. `skills/threejs-to-taptapmaker/references/subagents.md` — 子 agent 契约

### 4.3 推荐下一轮

先做 Phase 2 的 **文档级 + warning 级**部分，不急着改 native hard fail：

- 若暂不改 native：把 `SOURCE_NOTES.md` / `visual_fixes` 作为流程要求，先靠 policy tests 和 code review 约束。
- 若要改 native：先做 `mark accept` warning，不直接 fail；跑一轮现有项目确认不误伤，再升级为 hard fail。

### 4.4 需要确认的决策

- `SOURCE_NOTES.md` 由 `t3m init` 自动生成，还是由 agent 在 step 0 创建？
- `visual_fixes` 存成 Markdown artifact，还是 `project-info.json` 的结构化 JSON？
- `mark accept` 先 warning 还是直接 fail？
- 子 agent 是否默认启用，还是只在源码 > 5k 行/资产 > 30 时提示？
- native 二进制由谁构建、三平台怎么同步？

---

## 5. 注意事项

- **不要提交** `bin/darwin-arm64/kaying-for-taptap-core`、`bin/darwin-arm64/t3m` 的既有本地改动；它们不属于本次优化。
- 本次只改文档/技能/命令/测试，没有改运行时代码；如果后续改 native，必须重新构建并验证三平台制品。
- 规则不要过度拟合 Turbo Tails：control-flow/shader/material/animation/UI 清单是通用项，案例只做反例。
- 发现规则阻碍小项目时，用“阈值/轻量清单”解决，不要删掉铁律。
- 如果后续把“截图优先”重新引入，policy tests 会失败；这是有意的回归保护。
