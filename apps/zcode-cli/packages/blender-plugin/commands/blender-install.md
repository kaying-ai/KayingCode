---
description: 安装并启用随包 Blender add-on（先预览计划，用户确认后写入 Blender 用户配置）
---

调用独立 MCP `blender_setup` 的 `blender_install_addon` 工具。该工具不需要 Blender MCP 主服务，只处理当前执行主机。

1. 先以 `{"dryRun": true}` 调用，向用户说明将使用的 Blender 版本、可执行文件、目标 addons 目录、是否覆盖既有副本及是否需要重启。不要省略阻塞项。
2. 只有用户明确同意写入 Blender 用户配置后，才以 `{"confirm": true}` 再次调用。不要自行关闭 Blender、修改配置目录、运行上游 setup 或改写其他 MCP 客户端配置。
3. 返回 `blender-running` 时，请用户保存并退出 Blender 后重新执行；返回 `blender-first-launch` 时，请用户先打开一次 Blender 完成设置迁移；返回 `remote-host` 时说明本地安装器不处理远端，请在运行 Blender 的主机安装随包 add-on。
4. 安装成功后报告 `target.addonPath`、`enabled`、`savedPreferences`、`backupPath` 和 `nextAction`。不要把“文件已安装”表述为“服务已连接”。

完成后请用户打开或重启 Blender。add-on 默认会在加载场景时自动启动服务；只有用户曾停止服务或端口冲突时，才需要在 3D 视图 N 面板重新点击连接。随后运行 `/blender-doctor` 验证握手。
