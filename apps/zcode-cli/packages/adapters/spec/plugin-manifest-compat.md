# 插件清单与变量双兼容（上游 ZCode 对齐）

## 产品规则

- 插件发现以上游 `.zcode-plugin/plugin.json` 为第一优先；产品自有 `.kayingcode-plugin/plugin.json` 保留为第二优先，随后回退 `.claude-plugin`、`.codex-plugin`。
- 同一插件根目录存在多个清单时只读取优先级最高的一个，不合并字段。已安装插件与内置插件不需要迁移目录。
- 变量展开同时接受上游 `${ZCODE_*}` 与产品 `${KAYINGCODE_*}`；两者映射到同一事实值。`${user_config.*}` 与 Claude 变量保持原有语义。
- 插件身份由 resolver 权威写入 `ZCODE_PLUGIN_ID` 与 `KAYINGCODE_PLUGIN_ID` 两个环境变量，manifest/env 不能覆盖；身份值仍是 `<manifest.name>@<marketplace>`，官方市场 ID 继续使用 `kayingcode-plugins-official`。
- 扩展 API 的清单校验归 `@zcode/shared/extension-host`：`engines.zcode` 先判兼容，再严格校验 `extension`；插槽 `slots` 的未知 id 只记诊断。CLI loader 不因扩展清单问题拒绝插件，MCP/skills/commands 仍按各自组件加载。
- 上游插件只声明 MCP/skills/commands、没有 `extension` 时按普通插件加载；`extension` 缺失不等于失败。

## 状态所有者

- 清单路径发现、token 展开、插件身份 env：`@zcode/adapters` 的插件 loader。
- 扩展清单、授权档位、插槽静态表：`@zcode/shared/extension-host` 纯函数；后续由 Window Host 的 extensions service 持有运行状态。
- 插件启用态与安装记录：现有 plugin config/registry，未新增第二套状态。

## 接口

- manifest 候选：`.zcode-plugin` > `.kayingcode-plugin` > `.claude-plugin` > `.codex-plugin`。
- token：`ZCODE_PLUGIN_ROOT` / `ZCODE_PLUGIN_DATA` / `ZCODE_PROJECT_DIR` / `ZCODE_PLUGIN_ID` / `ZCODE_PLUGIN_NAME` / `ZCODE_SKILL_DIR`，与对应 `KAYINGCODE_*` 同值。
- 身份 env：`ZCODE_PLUGIN_ID` 与 `KAYINGCODE_PLUGIN_ID` 双写。
- 扩展校验：`validateExtensionManifest(raw)`、`parseManifestSlots(raw)`、`resolvePluginManifest(source, read)`。

## 验收

- `.zcode-plugin` 与 `.kayingcode-plugin` 同时存在时读取前者。
- 上游清单的 `${ZCODE_*}` 在 MCP args/env、命令 shell 块、hooks、skills 中解析为真实值；产品 `${KAYINGCODE_*}` 行为不变。
- `${user_config.*}` 默认值、敏感值 sink 限制与缺失变量诊断保持原行为。
- 非法插件名与非法扩展字段分别产生 loader 诊断与 extension manifest invalid，不产生静默回退。
- 打包 staging 同时识别两种清单目录和两种 `${*_PLUGIN_ROOT}/` 引用，缺失 MCP 入口仍 fail-closed。

## 非目标

- P0 不启动扩展进程、不接扩展网关、不改插件市场 ID。
- 不删除产品自有插件；上游插件替换与内置插件迁移在后续阶段执行。

## 回归

- `apps/zcode-cli/packages/adapters/tests/plugin-zcode-compat.test.ts`
- `apps/zcode-cli/packages/core/tests/plugin-variable-compat.test.ts`
- `packages/shared/src/extension-host/contract.test.ts`
- `packages/zcode-server-cli/test/packaging.test.ts` 的 `.zcode-plugin` fail-closed 用例
