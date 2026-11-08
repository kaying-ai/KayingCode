# 内置插件发行边界

`config/official-plugins.json` 是内置插件的唯一发行登记源；Contracts、默认开关、源码地图以及 filesystem/SEA 资源均从此登记派生。

Scene Studio 转为外部独立插件后，从内置登记移除其源码、资源、技能和专属集成测试。当前发行目录、构建 staging 和新播种目录不得包含该插件。通用 MCP 插件宿主与 Browser viewport API 继续由原模块维护，外部插件仍通过既有安装入口接入。

状态与顺序：发行登记 → 生成 Contracts / 资源清单 → bootstrap seed → 官方市场的 bundled 分区。市场目录由既有 seed 写入路径维护；移除发行项不主动删除用户工作区检查点、外部安装或用户配置，也不引入专属缓存迁移。

验收：官方目录测试确认 Scene Studio 不在发行定义中；生成输出与源码地图检查通过，且内置源码和配套资源目录已移除。filesystem/SEA 沿用同一份发行定义，不增加独立插件白名单。
