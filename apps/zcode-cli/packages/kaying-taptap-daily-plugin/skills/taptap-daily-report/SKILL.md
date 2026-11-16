---
name: taptap-daily-report
description: 生成 TapTap 游戏日报，包含新游发现、下载/预约/热玩三榜、各题材赛道发布数量与拥挤度。当用户要求“TapTap 日报/游戏日报/每日新游/榜单分析/赛道拥挤度/补跑某日日报”时使用。
---

# TapTap 游戏日报

本 Skill 驱动已保存的动态工作流 `taptap-daily`，生成一份可追溯的 TapTap 市场日报。

## 何时使用

- 每天定时生成 TapTap 游戏日报。
- 手动补跑某一天（`/taptap-daily 2026-11-16`）。
- 需要新游发现、三榜变化、题材赛道供给/拥挤度分析。

不适用于：TapTap Maker 游戏开发/转写（用 `kaying-for-taptap`）、单个游戏试玩（用 `kaying-game-playtest`）。

## 运行

1. 先加载 `dynamic-workflows` 技能。
2. 报告日期取命令参数；没有参数时用北京时间当天。
3. 调用 `CreateWorkflow`，使用已保存工作流：

```json
{
  "saved": {
    "name": "taptap-daily",
    "args": { "date": "2026-11-16" }
  },
  "max_concurrency": 5
}
```

4. 等待 run 完成，确认以下文件存在：

```text
reports/<date>/report.md
reports/<date>/report.html
reports/<date>/report.json
reports/<date>/index.html
reports/index.html
```

5. 向用户回报：报告路径、首发/预约数量、数据质量、被核验拒绝的条目。

不要修改工作流脚本，不要把报告发布到 TapTap 或其他外部平台。

## 口径

- 榜单：下载/热门榜、预约榜、热玩榜 Top50。
- 新游：最近 7 日 `首发` 与 `新游预约` 事件。
- 赛道供给：最近 30 日 `首发` 事件，按标签多标签归并到 12 个固定赛道。
- 拥挤度：供给分 45% + 三榜占比 30% + 近 7 日预约分 25%，按当日赛道做百分位排名；只用于横向比较。
- 排名变化：与上一份快照对比；没有基线时显示为空。

## 证据规则

- 所有数字来自 `snapshot.json` / `metrics.json`，模型不得新增数字。
- 每条解读必须引用 `evidenceId`；渲染器会移除不存在的 evidenceId。
- 新游解读和赛道解读分别由独立核验员复核；核验不通过的内容不会进入报告，并记录在 `notCovered`。
- `comparables` 允许使用模型知识，但不得伪造证据，报告会把它视为定性参考。

## 人工兜底

当 TapTap 公开接口不可用时：

1. 在 `data/daily/<date>/import/` 放 `boards.json`/`boards.csv` 与 `calendar.json`/`calendar.csv`。
2. 用 `--source import` 重新运行 collector（或部署脚本的 `--source import`）。
3. 报告头部会标记 `来源：人工导入`，不得伪装成网页采集。

## 失败处理

- 采集全部失败、日历不足 7 天、工作流异常、产物校验失败：本轮失败，不覆盖上一份成功日报。
- 部分榜单/日历缺失：生成降级报告，并在“质量警告”中列出。
- 同一日期默认幂等跳过；需要覆盖时使用部署脚本的 `--force`。

详细规则见 `spec/daily-report.md`、`spec/data-sources.md`、`spec/deployment.md` 和 `references/report-structure.md`。
