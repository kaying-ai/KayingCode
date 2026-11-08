---
name: workflow
description: 编写、调试或续跑 dynamic-workflow 脚本（CreateWorkflow）：选择子代理拓扑、类型化中间结果、fan-out、门控循环与验收报告。传入要办的事情即可，未加载编写契约时先读 dynamic-workflows 技能。
argument-hint: "[要编排的任务描述]"
---

按用户传入的任务描述，用 **CreateWorkflow** 工具编排一次多子代理工作流。在调用 CreateWorkflow 之前：

1. 先加载 `dynamic-workflows` 技能（SKILL.md 是 CreateWorkflow 的完整编写契约：facade、脚本规则、字段与门控）。技能未加载时 CreateWorkflow 会拒绝执行。
2. 判断这个任务是否值得 workflow：单一委托或少量独立查询直接用 Agent 工具，不要开工作流。
3. 写 TypeScript 脚本（agent()/report() 编排、loops/conditionals/fan-out），提交前自查 §16 的规则清单。
4. 提交后后台运行；完成通知携带最终结果，向用户转述关键结论与产物。

用户描述里已经给出目标；若缺少必要输入（如目标目录、验收标准），先追问再编排，不要臆测。
