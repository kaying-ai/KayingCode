# 部署级审核 Token 预算

面向应用商店审核、内部演示等受控部署。审核主机通过环境变量给 Agent 设置累计 token 上限，达到上限后不再发起新的模型请求，避免审核过程无限消耗额度。

## 配置

| 变量                                  | 必填 | 含义                                                       |
| ------------------------------------- | ---- | ---------------------------------------------------------- |
| `KAYINGCODE_REVIEW_TOKEN_BUDGET`      | 是   | 正整数，累计 token 上限；未设置时不启用预算                |
| `KAYINGCODE_REVIEW_BUDGET_DIR`        | 是   | 预算账本目录，必须是绝对路径；停止主机后可删除以重置       |
| `KAYINGCODE_REVIEW_BUDGET_SCOPE`      | 否   | `environment`（默认，跨会话共享）或 `session`（每个任务独立） |
| `KAYINGCODE_REVIEW_CODE_ID`           | 否   | 账本身份，默认 `app-review`                                |
| `KAYINGCODE_REVIEW_DEVICE_ID`         | 否   | `environment` 范围的账本键，默认 `app-review`              |

`session` 范围使用当前 session ID 作为账本键；新建任务会得到新的账本。`environment` 范围固定复用同一份账本，所有任务共享同一上限。

## 计数与拦截

- 每次 provider attempt 发出前先读取账本；`usedTokens >= tokenLimit` 时拒绝请求。
- 用量优先取 provider 的 `totalTokens`；缺失时按 input（为 0 时改用 cache read/write）加 output 计算。
- 每个 `requestId + attempt` 只入账一次；重试的 attempt 分别计数。
- `model_request_completed` 和携带 `usage` 的 `model_request_failed` 都会入账。成功但没有 usage 视为不确定并失败关闭；审核模式下失败且没有 usage 按 0 结算，避免单次网络错误卡死审核。
- 主代理和 subagent 的模型请求都经过同一预算端口；主代理被拦住后子代理不能继续消耗额度。
- 账本写入使用进程间目录锁和原子替换；崩溃等没有终态事件的路径会留下 pending 并阻断后续请求，需要维护人重置预算目录。
- 额度耗尽或用量不确定时返回用户可见文案，提示联系维护人。

## 边界

- 预算属于 Agent/runtime 的模型请求准入，不是 Relay 或客户端设置；必须在审核主机的 Desktop/CLI 进程环境设置。
- 与只读代码审核模式 `KAYINGCODE_REVIEW_WORKSPACE_ROOT` 互斥；同时设置会在启动时失败，避免两套绑定来源混用。
- 预算目录含设备账本，不进入仓库、日志或客户端；生产部署不要使用审核预算变量。
- 需要重置额度时停止审核主机并删除预算目录；运行中删除会造成账本不一致。

## 验收

`review-budget.test.ts` 覆盖：默认绑定、跨会话共享、session 独立、总 token（含缓存输入）计数、失败请求用量入账、无用量失败关闭和非法环境变量启动失败。部署验收还需在审核主机确认达到上限后模型请求被拒绝并显示提示。
