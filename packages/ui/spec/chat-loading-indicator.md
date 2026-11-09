# 对话轮尾「工作中」加载反馈

## 规则

运行中的最后一轮在消息流尾部显示同一条进度行：3×3 像素点轨道动画 + 「工作中」+ 本轮已运行时长（十分之一秒）。时长以本轮 `workStatus.durationMs` 为挂载起点，组件挂载后每 100ms 自刷新；时间线每秒的投影更新只刷新起点，不驱动整段对话按 100ms 重渲染。

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
        挂载起点 initialElapsedMs + 本地 100ms 时钟（仅显示）
                              │
                     轮次结束/交互 → 插槽卸载
```

## 视觉与降级

- 9 个像素按 `ORBIT_ORDER` 错峰点亮（单点 650ms、错峰 110ms），文案做 1.4s shimmer；像素与文案都属于装饰，计时文本保持可读。
- 暗色主题把像素峰值 opacity 提到 1，浅色保持 0.75。
- `prefers-reduced-motion: reduce` 下停止像素与 shimmer 动画，保留「工作中」与计时。
- 时长文本用 `tabular-nums` 等宽；中文单位前留空格，英文单位紧贴数字。

## 验收

- 新轮从 `0.0 秒` 开始；切回运行中的历史轮从本轮已运行时长继续，不回到 0。
- 轮次结束、等待交互或 active work 阻塞时加载行消失；重试状态优先，恢复后回到加载行。
- 375px、手机远控和桌面宽度不溢出；中英文文案与暗色主题可读。
- 更新 `modelRetryProgress.e2e.mjs`：使用生产组件与受控时钟验证计时从已运行时长起步、持续递增、恢复/结束后的显隐，不伪造模型结果。
