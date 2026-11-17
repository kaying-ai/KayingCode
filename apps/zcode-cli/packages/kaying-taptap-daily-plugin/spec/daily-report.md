# TapTap 游戏日报产品规范

## 1. 目标

每天 09:00（Asia/Shanghai）生成一份可追溯的 TapTap 游戏日报，固定覆盖：

1. 新游发现：最近 7 日首发与新开预约的游戏。
2. 热门游戏：下载/热门榜、预约榜、热玩榜 Top50 及排名变化。
3. 题材赛道：各赛道最近 7/30 日发布数量、榜单占比与拥挤度。

日报是决策支持材料，不构成投资建议；推断必须标注，缺失数据必须显式说明。

## 2. 所有者与边界

- **数据所有者**：collector 产出的 `snapshot.json` 是唯一事实来源。
- **指标所有者**：metrics 从 snapshot 与上一份 snapshot 计算 `metrics.json`；任何报告数字不得绕过 metrics。
- **文案所有者**：动态工作流的 subagents 只产出解读、判断与摘要，必须引用 `evidenceId`。
- **渲染所有者**：renderer 按固定模板生成 Markdown/HTML/JSON；布局和数字不依赖 LLM。
- **服务所有者**：Linux wrapper 负责调度、超时、校验、发布与告警；不把 workflow 终态当作唯一成功判据。

## 3. 固定报告结构

```text
01 今日速览        3-5 条，带证据 ID
02 新游发现        总量、Top 20 表格、Top 6 深度解读
03 热门游戏        三榜 Top50、排名变化、交叉上榜
04 题材赛道        全赛道指标表 + Top 8 赛道解读
05 机会与风险      事实/推断分列，逐条 evidenceId
06 数据说明        口径、窗口、缺失、异常、方法、证据索引
07 附录            完整榜单、标签映射、历史日报链接
```

HTML 内联 CSS、无外部 JS；核心内容不依赖远程资源。游戏表格首列为 28×28 图标，引用 `snapshot` 中的 `iconUrl`（TapTap 图标 CDN），使用 `loading="lazy"` 与 `referrerpolicy="no-referrer"`；图标缺失或加载失败时显示 `—`，不影响报告可读性。Hero 右侧固定展示“加群交流”客服二维码卡片（内嵌 data URL），不依赖外部图片。页脚为三段信息条：更多报告联系 service@kayingai.com、由 KayingCode kaying-taptap-daily 生成、开源一站式游戏开发Harness https://kayingai.com。支持移动端与打印。Markdown 与 `report.json` 同步生成。

## 4. 指标定义

### 4.1 新游

- `release`：最近 7 日 `首发/公测/上线` 事件。
- `reservation`：最近 7 日 `新游预约` 事件。
- 同一游戏同一窗口只计一次；优先 release。
- 热度排序：`reserve_count`、评分、是否进入任三榜；不使用模型编造热度。

### 4.2 榜单

- 三榜：`hot`（下载/热门）、`reserve`（预约）、`pop`（热玩），各 Top50。
- `rankChange = 上一份快照名次 - 当前名次`；正数上升，负数下降；无上一份时为 null。
- 交叉上榜：同一 appId 出现在两个及以上榜单。

### 4.3 赛道供给

- `newGames7d`：最近 7 日该赛道 release 的唯一游戏数。
- `newGames30d`：最近 30 日该赛道 release 的唯一游戏数。
- `newReservations7d`：最近 7 日该赛道 reservation 的唯一游戏数。
- `boardShare`：三榜 Top50 去重集合中，该赛道游戏占比（多标签可重复计入）。
- 标签多标签归并，允许各赛道计数之和大于总游戏数；报告中注明。

### 4.4 拥挤度

相对指数，0–100，按当日全部赛道做百分位排名：

```text
供给分 S = percentile_rank(newGames30d)
榜单分 L = percentile_rank(boardShare)
预约分 R = percentile_rank(newReservations7d)
crowding = round(0.45*S + 0.30*L + 0.25*R)
等级：<40 低；40–69 中；>=70 高
```

- 数据缺失的赛道返回 `score=null`、`level=unknown`，不能按 0 分处理。
- 报告必须同时展示原始分量，避免只给一个不可解释的分数。
- 这是赛道之间的相对拥挤度，不代表绝对市场规模。

## 5. Subagent 契约

- 新游深度解读：`NewGameInsight`，每款游戏一句话定位、目标用户、可比产品、信号、风险、confidence。
- 榜单摘要：`BoardInsight`，只描述排名/交叉/变化，数字由 metrics 提供。
- 赛道解读：`TrackInsight`，拥挤度解释、代表新游、机会、风险、evidenceIds。
- 交叉核验：未参与研究的 verifier 按 section 批量核验；数字不一致、evidenceId 不存在、推断未标注的内容必须删除或降级。
- 写作：writer 只使用核验后的材料，输出 `Insights`；不得新增数字。

成本边界：

- 新游深度解读最多 6 个（Linux 服务默认 4 个）。
- 赛道深度解读最多 8 个（Linux 服务默认 5 个）。
- 并发默认 5。
- 主代理与所有子代理统一使用 `deepseek-v4.1-flash`；服务通过 `TAPTAP_DAILY_SUBAGENT_MODEL=opencode-go-chat/deepseek-v4.1-flash` 显式固定，避免模型漂移。
- 超过边界的游戏/赛道只进入确定性表格，不调用模型。

## 6. 失败与幂等

- 采集部分失败：生成 degraded 报告，明确缺失榜单/日期。
- 采集全部失败、日历不足 7 天、workflow 异常或产物校验失败：本轮失败，不覆盖上一份成功日报。
- 同一 `reportDate` 默认跳过；`--force` 才覆盖。
- `reportDate` 取 Asia/Shanghai 的运行日期；补跑通过 `REPORT_DATE` 指定。
- 报告头部展示实际 `capturedAt`，避免把补跑数据当成 09:00 实时数据。

## 7. 非目标

- 不采集 TapTap 登录态、私有数据、收入/DAU 估算。
- 不自动发布到 TapTap 或第三方平台。
- 不做实时监控、多租户和 Desktop UI。
- 不在 v1 引入服务端 cron 调度器。
