# 可安装游戏插件占位清单（game plugin installers）

插件市场「游戏开发」专区中的**可安装占位**数据源。占位不是内置插件：它只描述一个由 Agent 从社区目录安装的插件，不参与插件 inventory、安装态或启停判断。

## 数据源与生成

- 唯一登记源：`config/game-plugin-installers.json`（`schemaVersion: 1`）。禁止在 UI、服务或协议里手写第二份清单。
- `scripts/generate-game-plugin-installers.mjs` 读取配置并生成 `packages/shared/src/game-plugin-installers.generated.ts`；`pnpm run source:plugins` 与 `source:plugins:check` 同时覆盖官方插件契约与本清单，生成物过期必须失败。
- `packages/shared/src/game-plugin-installers.ts` 提供 zod 运行时校验、严格类型与查询辅助；UI 只消费生成后的只读数组，不访问仓库配置。
- KayingCode.localrun 不联网刷新本清单：新增或升级占位随应用版本发布，运行时零网络请求。安装时由 Agent 读取 `catalog.url` 的在线目录，以目录中的最新条目为准。

## 配置结构

```json
{
  "schemaVersion": 1,
  "catalog": {
    "name": "open-zcode-game-plugins",
    "url": "https://raw.githubusercontent.com/kaying-ai/open-zcode-game-plugins/main/catalog.json",
    "repositoryUrl": "https://github.com/kaying-ai/open-zcode-game-plugins"
  },
  "installers": [
    {
      "name": "kaying-for-ui",
      "version": "0.2.0",
      "host": "kayingcode",
      "displayName": { "zh-CN": "游戏界面设计UI设计-咖影", "en": "Game UI Design & Handoff" },
      "description": { "zh-CN": "……", "en": "……" },
      "engines": [],
      "stages": ["development", "assets"],
      "source": {
        "kind": "open-source",
        "tier": "official",
        "repositoryUrl": "https://gitee.com/citiao/kaying-for-ui"
      },
      "addedAt": "2026-11-26"
    }
  ]
}
```

### 字段规则

- `catalog.url`、`catalog.repositoryUrl`：必须是无凭据、无端口、无 query/hash 的 HTTPS URL；`url` 必须以 `.json` 结尾。
- `catalog.name`：`^[a-z0-9][a-z0-9-]*$`，用于展示与日志，不参与安装身份。
- `name`：插件标识，`^[a-z0-9][a-z0-9-]*$`，与目录条目的 `name` 一致；清单内唯一。
- `version`：占位展示的版本（随应用发布固定）；实际安装版本以在线目录为准。格式为 SemVer 主版本.次版本.修订号。
- `host`：一期只接受 `"kayingcode"`；ZCode 宿主不在本产品入口内提供。
- `displayName` / `description`：必须同时提供 `zh-CN` 与 `en`，非空；未知语言键拒绝。
- `engines`：`GAME_DEVELOPMENT_ENGINES` 的子集；空数组表示跨引擎通用能力，语义与内置插件 `listing.gameDevelopment.engines` 完全一致。
- `stages`：`GAME_DEVELOPMENT_STAGES` 的非空子集。
- `source`：严格联合。`open-source` 必须带 `tier`（`official`：官方团队维护或官方仓库发布；`community`：社区作者维护）与安全 HTTPS `repositoryUrl`（允许 GitHub、Gitee 等公开代码托管，禁止凭据、端口、query/hash、非仓库路径）；`closed-source` 不带 URL。角标由 `tier` 决定，不由仓库域名推断。
- `addedAt`：`YYYY-MM-DD`，仅展示与排序参考，不参与安装判断。
- 对象拒绝未知字段；生成器遇到非法条目直接失败，不静默丢弃。

## 与插件 inventory 的边界

- 占位不写入 `pluginManagementStore`，不创建 `StorePluginItem`，不占安装 ID，不产生启停/更新/卸载动作。
- 运行时若 inventory 中已存在同名且已安装的插件（任意 marketplace），占位保持可见并复用内置卡片的已启用开关、更新与菜单；安装事实仍只来自 Host/CLI，不由占位推断。
- 占位卡片的安装动作不是安装 API：只生成安装指令、复制到剪贴板并把指令预填到对话草稿，由用户提交后交给 Agent 执行。

## 验收

1. 配置非法（缺语言、空阶段、非法引擎、非 HTTPS、带 query、未知字段、重名）时生成器与测试失败。
2. 生成物缺失或过期时 `pnpm run source:plugins:check` 失败。
3. 生成契约只包含白名单字段，UI 不需要也不允许读取 `config/`。
4. 清单新增条目不需要改 UI 代码；引擎/阶段筛选与内置插件规则一致。
