---
description: 自主试玩 APK 或 H5 游戏，留存证据并生成离线试玩报告
---

使用本插件 game-playtest 技能处理：$ARGUMENTS

根据用户提供的 APK/游戏 URL/构建产物，确认实际工作区、设备与目标，执行视觉试玩闭环，
记录玩法发现和问题，生成带证据的十二章 HTML、Markdown、JSON 报告。
默认报告应让没亲自玩过的人看懂游戏：突出风格、玩法、亮点、成长和适合人群，
配图解释规则与反馈；工具运行记录、设备、覆盖率与计时放到附录。
缺省 standard / explore；遵守时间和动作预算，未覆盖内容明确标注。
Android 优先复用设备；需要启动已有 AVD 时优先 host GPU、禁用快照加载/保存，保留游戏数据，
并核对 bootCompleted/GLES。性能验证选 diagnostic 报告；游戏评价使用验收目标推进。
结束前检查 qualityWarnings，报告应呈现已验证事实、缺项原因和证据，不以空章节代替分析。
