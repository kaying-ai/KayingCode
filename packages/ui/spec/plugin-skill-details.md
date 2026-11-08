# 内置插件技能与子技能详情

## 产品规则

- 沿用 TapTap Maker 的「技能」分区与真实组件枚举；技能总数只统计已发现的 SKILL.md，不把工作流步骤或参考指南算成额外可调用技能。
- 为实际存在的内置技能补充中英文易读名称、完整说明与默认展开的子技能列表。子技能是主技能内支持的工作流，显示名称和说明，不新增执行、启停或安装入口。
- Blender 展示诊断、场景/建模、材质、拓扑/UV、绑定、动画、关卡、脚本以及预览导出能力，依据随包主技能和 vendor 固定指南；不改 vendor。
- 其他内置技能按随包 SKILL.md 支持范围补齐。仅提供 MCP、没有技能的插件不伪造技能；TapTap Maker 原有真实七技能继续显示。
- 描述自然换行，不再被单行截断。保留 canonical skill name 供识别和诊断；名称和正文使用现有 text-ui 与主题 token，兼顾窄屏。

## 单一所有者与接口

- 现有 Agent components 是技能存在性和数量的唯一事实来源。`config/official-plugins.json` 的可选 `listing.skillDetails` 仅拥有展示文案，内容由包内技能/指南人工核对，生成现有官方契约。
- shared 提供严格 `pluginSkillDetailsSchema` 和推导类型。条目按 canonical name 与当前插件的 skill components 精确 join；未发现的主技能不显示，不通过裸插件名跨来源匹配。
- 目录适配器复用同一 schema，畸形扩展字段独立丢弃，保留原 listing/插件。旧 listing 无字段时回退真实 name/description，保证本地插件与旧 payload 兼容。
- UI 从当前 item.listing 派生展示投影，不增加 store、缓存、请求或可变状态。安装/禁用时均复用原 components；未安装详情复用 describe 结果。
- 不修改运行时技能发现、工具权限、SKILL.md 提示词、seed 执行策略以及 Desktop/手机传输语义。

```mermaid
flowchart LR
  A[插件文件枚举 components] --> C[当前插件 name 精确 join]
  B[唯一发行清单 skillDetails] --> D[adapter 严格校验 / listing 协议]
  D --> C
  C --> E[技能分区：真实主技能数 + 子技能说明]
```

## 验收

1. Blender 仍显示一个主技能，子技能完整可见；TapTap Maker 仍显示真实七技能，不被元数据虚增或隐藏。
2. 每个有技能的官方发行插件均有对应展示文案；metadata 中主技能必须真实存在，且主/子项 ID 唯一。
3. 无 metadata、过期 metadata、不存在的技能、非法字段均有兼容测试；已安装与 describe 路径展示一致。
4. E2E 覆盖真实枚举的 Blender、TapTap Maker、办公类插件及无技能插件；中英文、明暗主题、390px 手机无横向溢出；长描述完整换行。
