---
name: taptap-daily
description: 生成指定日期的 TapTap 游戏日报（默认北京时间今天），包含新游发现、三榜与题材拥挤度。
argument-hint: "[YYYY-MM-DD]"
---

生成 TapTap 游戏日报。

1. 先加载 `dynamic-workflows` 技能。
2. 报告日期取本命令后的参数；没有参数时，运行 `date +%F` 并按 Asia/Shanghai 解释为今天。
3. 调用 `CreateWorkflow`，使用已保存工作流 `taptap-daily`，参数为 `{ "date": "<YYYY-MM-DD>" }`，`max_concurrency` 设为 5。
4. 等待 run 完成后，确认 `reports/<date>/report.md`、`report.html`、`report.json` 和 `reports/index.html` 存在。
5. 回报报告路径、首发/预约数量、数据质量，以及核验未通过（notCovered）的条目。

不要修改工作流脚本；不要发布到 TapTap 或任何外部平台。数据口径与证据规则见 `taptap-daily-report` Skill。
