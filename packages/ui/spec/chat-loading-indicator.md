# 对话轮尾「工作中」加载反馈

## 规则

运行中的最后一轮在消息流尾部显示同一条进度行：SVG 点阵球体动画 + 「工作中」+ 本轮已运行时长（整秒）。时长以本轮 `workStatus.durationMs` 为挂载起点，组件挂载后每秒自刷新；时间线每秒的投影更新只刷新起点，不驱动整段对话重渲染。

普通 loading 沿用既有 `shouldShowTurnChatLoading` 资格：轮次结束、等待用户回答/授权、或存在 active work 阻塞时隐藏。`apiRetry` 优先级高于普通 loading：重试期间显示 `ChatApiRetryStatus`，恢复后自动回到 loading 行；普通 loading 不叠加倒计时或虚构进度。

## 所有者与事件顺序

`snapshot` / runtime 的 running 事实经 render unit `workStatus.durationMs` 进入 UI；`ConversationTurnLoading` 是唯一插槽，`ChatLoading` 只派生显示，不持有会话状态、不发送命令、不写第二份运行态。

```text
runtime running ──► render unit.isRunning + workStatus.durationMs
                              │
                    shouldShowTurnChatLoading(阻塞/交互资格)
                              │
              apiRetry ? ChatApiRetryStatus : ChatLoading
                              │
        挂载起点 initialElapsedMs + 本地 1s 时钟（仅显示）
                              │
                     轮次结束/交互 → 插槽卸载
```

## 视觉与降级

- 图标是 105 个点的 SVG 球体（`ChatLoadingOrbs`）：球面持续旋转，每 8.24 秒做一次「球面 → KY 字」morph（5000–6296ms 变形、停留至 7160ms、7952ms 前变回），点的深度决定透明度，只有「KY」形点常亮。
- 字形由 35 个目标点构成，整体约 15×9 单位，比上游 Z 更宽、更矮，笔画也更粗；变形时目标点半径从 0.5 增到 0.7，字母接近连续实线。
- 文案使用 `animated-gradient-text animated-gradient-text-foreground` 做低对比流动；图标与文案都属于装饰，计时文本保持可读。
- `prefers-reduced-motion: reduce` 下不启动逐帧动画，直接显示静态「KY」点阵；文案停止流动，保留「工作中」与计时。
- 时长文本用 `tabular-nums` 等宽；按完整经过的秒显示，不显示小数；中文、俄语单位前留空格，英文/日/韩单位紧贴数字。
- 图标槽固定 16px，替换动效时不改变文字对齐；球体允许 overflow 但视觉尺寸不变。

## 验收

- 新轮从 `0 秒` 开始；切回运行中的历史轮从本轮已运行时长继续，不回到 0。
- 球体旋转与 KY 字 morph 连续，无跳帧或布局抖动；减少动效模式下显示静态 KY。
- 轮次结束、等待交互或 active work 阻塞时加载行消失；重试状态优先，恢复后回到加载行。
- 375px、手机远控和桌面宽度不溢出；中英文文案与暗色主题可读。
- 更新 `modelRetryProgress.e2e.mjs`：使用生产组件与受控时钟验证计时从已运行时长起步、持续递增、恢复/结束后的显隐，不伪造模型结果。
