# 插件技能展示扩展

`listing.skillDetails` 为可选展示字段，不参与发现或执行。每项包含 canonical `name`、本地化 `title`/`description`（en-US 与 zh-CN）以及可选 `subskills`。子项有稳定 id、本地化 title/description，仅表达主技能内部支持范围。

shared 统一导出严格 schema 与类型；主技能 name、子项 id 不得重复，字符串与列表有界。adapter 的非法扩展只丢弃该字段；旧 listing 和协议仍可解析。

存在性与数量由原 components 决定，UI 不根据此字段新增组件。产品规则见 `packages/ui/spec/plugin-skill-details.md`。
