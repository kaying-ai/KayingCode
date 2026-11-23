# 本地目录与远端游戏关联

## 标识来源

- 远端游戏 ID 只认工程根目录下 `.maker-mcp/config.json` 的 `project_id`；它与 `maker apps --json` 返回的项目 ID 同源，可直接用于关联和恢复。
- `.project/project.json` 的 `project_id` 是 Maker 引擎侧项目 ID（例如 `m_jarj`、`p_nfyc`），与远端游戏 ID 不是同一命名空间，不得用于远端关联。
- 读取顺序固定为 `.maker-mcp/config.json` → `.project/project.json`：前者权威，后者仅作为没有 Maker 配置的本地目录的兼容回退。
- 文件不存在或 JSON 语法错误视为“无标识”，继续尝试下一个来源；其它文件系统错误向上抛出，由调用方记录为操作失败。
- 该读取只用于列表关联，不写文件、不修改工程、不改变恢复目标判定。

## 验收

- 两个文件同时存在且 `project_id` 不同：返回 `.maker-mcp/config.json` 的值。
- 只有 `.project/project.json` 且含有效 `project_id`：返回该值。
- `.maker-mcp/config.json` 损坏、`.project/project.json` 有效：回退返回后者。
- 两个文件都缺失或都无效：返回 `null`，列表仍正常返回，卡片显示“尚未加载到本地”。
