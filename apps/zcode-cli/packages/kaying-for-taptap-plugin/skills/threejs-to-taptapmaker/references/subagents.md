# 子 agent 契约：只读并行，写入串行

转写类项目的瓶颈通常不是“写代码速度”，而是**源码理解覆盖率**和**上下文压力**。子 agent 适合并行读大文件、做交叉审计；
不适合并发写共享工程。默认拓扑是：

```text
1 个主写手（主 agent）
  ├─ 只读子 agent：control-flow
  ├─ 只读子 agent：shaders
  ├─ 只读子 agent：materials
  ├─ 只读子 agent：models/animations/UI
  └─ 只读子 agent：独立复核
```

主 agent 独占：`dest/` 写入、`publish`、`prepare_visual_comparison`、双 guest 截图、`t3m compare`、最终验收。
子 agent 的输出是**假设**，不是事实；主 agent 必须回源码验证后才能改代码。

## 1. 什么时候用

| 条件                                                               | 建议                              |
| ------------------------------------------------------------------ | --------------------------------- |
| 源码 bundle > 5k 行，或单文件 > 1 MB                               | 启用只读子 agent                  |
| 资产 > 30 个 GLB/模型，或材质 > 100 个                             | 启用只读子 agent                  |
| 至少 3 个独立审计任务（control-flow/shader/material/animation/UI） | 启用只读子 agent                  |
| 源码 < 5k 行、资产 < 30、只有 1–2 个审计任务                       | 不用子 agent，协调成本大于收益    |
| 需要并发写共享 `dest/scripts`、场景、UI 根节点                     | **不要**用子 agent；主 agent 单写 |
| 需要 publish/prepare/截图/compare                                  | **不要**用子 agent；主 agent 独占 |

## 2. 任务分片

| 子 agent       | 只读范围                                                                             | 输出                           | 关键问题                                                                                       |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `control-flow` | `source/game/` 源码、`report.md`                                                     | `source/audit/control-flow.md` | URL 参数/feature flag、主路径 vs fallback、模型/资源选择、每角色/关卡覆盖                      |
| `shaders`      | 源码中的 `onBeforeCompile`/`ShaderMaterial`/`customProgramCacheKey`/`onBeforeRender` | `source/audit/shaders.md`      | 注入点、uniform、依赖几何/UV/法线、目标实现状态                                                |
| `materials`    | 源 GLB JSON + 目标 Material XML                                                      | `source/audit/materials.md`    | baseColor/metallic/roughness/clearcoat/emissiveStrength/doubleSided/COLOR_0/texture/UV/tangent |
| `models`       | GLB 节点、图集、运行时资源                                                           | `source/audit/models.md`       | id/显示名/模型/图集/颜色映射；有没有占位 id                                                    |
| `animations`   | 源码动画/程序化动画                                                                  | `source/audit/animations.md`   | 车轮/Wob\_/眨眼/头部 look/UI tween；目标实现位置与状态                                         |
| `ui`           | `source/UI_INVENTORY.md` + 目标 UI 代码                                              | `source/audit/ui.md`           | 控件 1:1、位置尺寸、显隐/点击、缺失骨架件                                                      |
| `verifier`     | 主 agent 的修复方案 + 源码                                                           | 复核结论                       | 是否有 `source_evidence`、是否按根因批量、是否有回归风险                                       |

多个子 agent 可以并行读同一份源码，但不要并行改同一份 `dest/` 文件。

## 3. 子 agent prompt 模板

每个子 agent 的 prompt 至少包含以下内容（可按任务裁剪）：

```text
你是 [control-flow / shaders / materials / models / animations / ui / verifier] 只读分析员。
你的任务：...（一句话）
只读范围：...（目录/文件）
禁止：编辑任何文件；publish；prepare_visual_comparison；删除/重置；读取凭据；从截图直接给修改值。
铁律：截图/对比图只用于发现差异；每个结论必须给出 source/...:行号 + 具体值/分支/资源 + 期望行为。
输出：按下面的 schema 返回；关键结论至少两处交叉证据（调用点 + 定义点 + 资源/运行时证据）。
找不到源码证据时标记 unverified，不要猜。
停止条件：结论无法从源码确认、或需要修改代码时停止，并报告需要主 agent 做什么。
```

输出 schema：

```json
{
  "findings": [
    {
      "topic": "kart model branch",
      "evidence": [
        "source/extracted/game.pretty.js:39186",
        "source/extracted/game.pretty.js:39514"
      ],
      "fact": "default path uses r13a; generic only when char=old",
      "confidence": "high",
      "proposed_fix": "switch race to r13a; keep generic fallback",
      "open_questions": []
    }
  ],
  "files_read": ["..."],
  "not_covered": ["..."]
}
```

## 4. 主 agent 集成规则

1. **验证**：逐条回源码核对 `file:line` 和事实；不能只信子 agent 的总结。
2. **去重/冲突**：同一结论多个来源时合并；冲突时以源码为准，记录取舍。
3. **落盘**：把已确认事实写入 `source/SOURCE_NOTES.md`，带 `file:line`。
4. **再修改**：先写 `visual_fixes` 台账（`source_evidence` + `root_cause`），再改代码。
5. **验收**：主 agent 独占 publish/prepare/compare/accept；子 agent 不得写验收字段。

## 5. 度量

| 指标                | 目的                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| 关键源码事实召回率  | 子 agent 是否覆盖了 `rb/ab/char=old`、face/neck/ex、clearcoat/emissive/doubleSided、wheel/wobble/blink |
| 分析阶段 wall-clock | 并行是否真的更快                                                                                       |
| 视觉修复轮次/检查点 | 是否减少“按截图微调”                                                                                   |
| 合并冲突/返工       | 并发写手是否值得                                                                                       |
| 上下文压缩次数      | 是否降低了上下文压力                                                                                   |
| token 成本          | 采纳门槛之一                                                                                           |

决策建议：

- 分析阶段 wall-clock 快 ≥ 20%、关键事实召回率不低于单 agent → 默认启用“1 主 + N 只读”；
- 实现阶段冲突/返工升高 → 不启用并发写手，只保留只读分析；
- 小项目默认不用子 agent。

## 6. 反模式

- 让子 agent 直接改 `dest/scripts/Game.lua`、`Visuals.lua`、`Menu.lua`、`HUD.lua`：共享状态强，容易覆盖。
- 让子 agent 调 `publish`/`prepare_visual_comparison`：有副作用，且会打乱主 agent 的 revision。
- 让子 agent 只返回“结论”不返回 `file:line`：无法验证，等于把幻觉带进实现。
- 子 agent 之间互相“对齐结论”而不回源码：会放大同一个误读。
- 子 agent 从截图直接给“应该改成 6.6 m / #ff8800”：违反铁律，禁止。
