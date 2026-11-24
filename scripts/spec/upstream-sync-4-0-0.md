# ZCode 4.0.0 采纳评估与升级方案

状态：实施中（2026-11-25）。分支 `feat/upstream-sync-4-0-0`：阶段 0 已完成；阶段 1 账号/OAuth/凭据机制与 CLI 入口完成，桌面登录 UI、真实端点联调与 staging 部署待后续；阶段 2 本轮完成（异步发现、workspace trust、Skill 实时目录、MCP 配置源）；阶段 3 本轮完成（工具快照、实时 reconcile、工具目录、WaitForMcpServers、HTTP 重试）；阶段 4 进行中（存储 0025/0026、ReadTopicResource、browser-state、InputPreemption、项目 Token 传输错误 -32033、`--total-tokens-reminder`、回复语言协议/core/Desktop 设置已落地；turn/loop 请求构建待做）；阶段 5 已开始游戏插件兼容验收，非游戏上游能力待补齐。
来源：官方 `zai-org/ZCode` 标签 `v4.0.0`，`upstream/main` 提交 `a4b44451`（Source-Commit `acfaa5b7a5d245d5b84fbe37ef2c0d0748f97cdf`），其父提交为当前采纳基线 `fec97590`（3.18.2）。
产品基线：`main` 提交 `a4efa81d`（kaying-code-v0.2.4）。

## 目标与原则（2026-11-24 修订）

1. **游戏场景增强是产品增量，其余尽量回到上游。** 游戏插件、游戏工具、游戏工作流是产品重点；协议、插件机制、MCP 机制、CLI 运行时、账号/API 等非游戏能力以上游 ZCode 为唯一基准，不再维护平行的核心实现。机制升级不得阻塞游戏迭代：阶段 2/3 期间游戏插件通过兼容适配保持可加载，阶段 5 再移除兼容层。
2. **账号与 API 保留完整上游机制，用网络 mock 支持本地运行。** 直连 ZCode 的账号、登录、官方 MCP 鉴权、模型/套餐与客户 API（配置下发、帮助/强更、灰度、市场、遥测）链路保留；通过端点解析 + `ApiMock` 在 localrun/离线环境返回本地结果，配置真实端点后走远端，方便未来扩展。
3. **现有产品机制优先向上游架构迁移。** 只要与上游冲突，优先采用上游结构，把产品差异收敛到扩展点：游戏插件/工具、网络 mock/端点适配、品牌与 i18n、产品渠道适配（Host/Relay/mobile）。
4. **不再复制上游核心文件。** 协议与共享契约改为“上游源文件 + 机械品牌映射 + 显式产品补丁”的生成/校验管线；插件 loader、MCP 配置、CLI 运行时不再保留第二套实现。
5. **产品显式例外要登记。** 对已退役或明确不做的上游能力（如 CUA Helper、design-runtime、Windows 全量签名补丁）在架构策略中记录原因与影响范围，不因“上游优先”未经评估恢复。

## 差异规模

- 上游：2209 个文件，+149,753 / −24,801；新增 251 个 CLI 文件，删除 11 个，修改 620 个，仅 3 个纯重命名。
- CLI 包：885 个文件，+62,602 / −10,614。热点为 `core`（297 文件）、`adapters`（152）、`bootstrap`（129）。
- 产品侧自 3.18.2 基线起改动 14,829 个文件（含生成物），其中 1,092 个与上游 4.0.0 改动重叠。
- 版本与工具链：`4.0.0`，Node `>=24`、pnpm `10.33.2` 与基线一致；无新增/删除 workspace 包。
- 上游新增 12 个带 `CONTRACT.md` + `contract.ts` + `module.ts` 的受管模块（见“机制变更总览”），并新增 preinstalled-tools 文档工具链与 `packages/desktop/native/windows-preinstalled-entry-shim`。

## 结论（先行）

1. **不能 fast-forward，也不能整包合并。** 4.0.0 是机制级升级，与产品本地适配在 1,092 个文件上重叠，其中插件/MCP/CLI 的重叠文件正是双方改动最大的文件。
2. **卡点确认集中在三块：MCP、插件体系、CLI 运行时。** 核心不是代码量，而是三套机制同时换轨：
   - MCP：配置源分层 + 动态配置 + 运行时 session + 工具目录缓存 + 重试/恢复。
   - 插件：异步 discovery/material cache + 工作区声明与信任 + 私密选项存储 + live inventory。
   - CLI：新模块契约（contract/module）、tool change chain、技能实时目录、cmd 只读策略。
3. **扩展宿主/会话控制已基本对齐。** 产品 P2–P4 的 `extension-host`、`extension-slots`、`app-control`、`plugin-api`、`session-control` 与 4.0.0 只差品牌命名；不需要重做。
4. **最大结构性问题不是 4.0.0，而是产品协议副本本身是分叉。** `kayingcode-protocol*` 缺少 3.18.2 基线已有的 `rewindFiles`、`deletionPreview`、`editLock`、`pluginDiscovery` 等字段；继续手工维护副本会让每次升级都返工。按新目标，应改为“上游源文件 + 品牌映射 + 产品补丁”的生成管线。
5. **共同前置是“动态配置原语”。** `adapters/src/watch`、`live-inventory`、`mcp/config-loader`、`skills/catalog` 是 MCP 与插件两条线的共同底座，必须整体引入。
6. **账号/API 不是本轮卡点，但决定架构方向。** 新目标要求保留上游账号、登录、官方 MCP 鉴权、市场、配置与遥测机制，并用端点解析 + `ApiMock` 支持 localrun/离线；这应先于 MCP/插件落地，因为官方鉴权与市场路径依赖它。
7. **建议分 6 个阶段 + 3 个独立工单。** 顺序为上游对齐基线 → 账号/API/mock 层 → 插件体系整体切换 → MCP 体系整体切换 → CLI/跨层 → 游戏插件迁移与上游能力补齐；每阶段独立分支与验收，全部通过后再更新 `UPSTREAM_BASE.json`。

## 机制变更总览（新增受管模块）

| 模块 | 位置 | 作用 |
| --- | --- | --- |
| `mcp-runtime` | `core/src/mcp/runtime`、`adapters/src/mcp/{config-loader,config-source,tool-catalog-cache,transport-errors,resource-subscriptions}.ts`、`bootstrap/src/app/dynamic-mcp-config.ts` | MCP 连接基础设施、配置桥接与会话消费 |
| `live-config-watch` | `adapters/src/watch`、`adapters/src/plugins/live-inventory.ts` | 打开的会话重读配置/插件清单的进程级原语、锚点监听、去抖 |
| `skill-live-catalog` | `core/src/skills`、`adapters/src/skills/catalog.ts`、`bootstrap/src/app/dynamic-skill-catalog.ts` | 进程级技能目录快照与增量公告 |
| `plugin-discovery` | `adapters/src/plugins/discovery` | 启动发现与 MCP 共用的 manifest 解析与材料缓存 |
| `workspace-plugin-declaration` | `adapters/src/plugins/workspace-plugin-declaration` | 项目 `plugins.dirs` 候选与声明摘要 |
| `workspace-plugin-trust` | `bootstrap/src/workspace-plugin-trust` | 项目插件的用户信任记录与 pending 判定 |
| `bash-cmd-readonly-policy` | `core/src/tool/cmd-readonly` | cmd/legacy-shell 的保守只读判定 |
| `preinstalled-tools` 系 | `shared/src/preinstalled-tools`、`desktop/src/preinstalled-tools`、`ui/src/preinstalled-tools`、`shared/src/node/windowsGitBashDiscovery`、`ui/src/shortcuts` | LibreOffice/Python/Pandoc/Poppler/QPDF 预装工具链及 Windows 入口 shim |

同时新增的设计文档：`docs/mcp-async-tool-catalog-cache.md`、`docs/skills-live-catalog.md`、`docs/plugins/workspace-plugin-dir-trust.md`、`docs/preinstalled-tools/*`、`apps/zcode-cli/docs/design/v2/tool/00-tool-change-chain.md`。

## 插件体系（4.0.0）

### 机制变化

1. **Manifest 解析统一**：启动发现与 MCP 加载共用 `parsePluginManifest`，校验 name 正则、version 缺省 `0.0.0`、`userConfig` 按已知字段 strip；目录顺序仍为 `.zcode-plugin` > `.claude-plugin` > `.codex-plugin`，第一个存在者生效，无效时不回退。
2. **异步 discovery + material cache**：`NodePluginAdapter` 改为材料缓存快照，材料中途变化最多整体重建 3 次；单插件准备失败只产生 `plugin_load_failed` 诊断，不再让整个会话创建失败。
3. **工作区声明与信任**：项目 `plugins.dirs` 只进入 `ProjectConfigFile.pluginDirCandidates` 与 `ConfigResult.sources.plugins.dirs.workspace`，永不进入可执行 config。声明摘要 v1（sha256，覆盖 manifest、hooks、`.mcp.json` 及 manifest 引用的 Hook/MCP 文件）记录在 `security/workspace-plugin-trust-v1.json`；未命中即 pending，强制停用且不解析任何组件；信任只对新会话生效。
4. **Live inventory**：打开的会话里统一读取配置、候选、启停判定与监听集合；MCP 配置加载与 Skill 实时目录共用。
5. **插件私密选项**：`plugin-secrets` 的 I/O、schema、分层合并下移到 adapters；workspace 选项只从用户私有文件读，仓库 `plugins.options` 完全忽略；user 旧明文只在用户下次保存时迁移。
6. **市场**：安装前确认目标条目在当前目录，缺失时按已登记来源补拉一次；新增 `PluginStoreRegion`（cn/global，未知值忽略）。
7. **原子目录**：`decideAtomicState` 统一同步恢复与异步只读，新增 `readAtomicTarget` 返回 `stable`；backup 仅作读视图，不可作为执行根。
8. **extension-host/session-control/extension-slots/plugin-api 无功能变更**，只有品牌差异。

### 破坏性变更

| 严重度 | 变更 | 影响 |
| --- | --- | --- |
| 严重 | 仓库 `plugins.options` 从“参与合并”变为“完全忽略” | 产品 `adapters/src/config/schema.ts:322` 仍允许项目选项并参与合并；升级后现有项目选项失效，需用户在设置页重新输入 |
| 严重 | 新增插件私密选项存储与 workspace secrets 语义 | 产品当前无 `plugin-secrets`（adapters/config 与 bootstrap 均缺）；`configureKayingCodePlugin` 直接写 config 文件。升级后敏感 `userConfig` 的保存位置、优先级、clear/reset/uninstall 行为全部改变 |
| 严重 | 项目目录插件从“直接丢弃”变为“候选 + 逐插件用户信任” | 产品 `normalizeProjectConfig` 直接剥离 `dirs`；需改成候选侧信道，并补齐信任协议/服务/UI |
| 严重 | discovery API 改为异步 material cache | 产品 `discoverPlugins` 虽返回 Promise，但内部仍调用 `discoverPluginsSync`；`resolveKayingCodePlugins`、`loadPluginMcpServerDefinitions`、`loadBundledOfficialPluginRoots`、`installMarketplacePlugin` 等同步调用点均需改造 |
| 高 | 单插件加载失败不再中断整次发现 | 新增诊断码 `plugin_load_failed`，产品 contracts 无此码，错误处理/遥测/UI 需同步 |
| 高 | `.kayingcode-plugin` 回退会丢失 | 上游新模块硬编码只认 `.zcode-plugin/.claude-plugin/.codex-plugin`；产品 loader 仍以 `.kayingcode-plugin` 作第二顺位（`adapters/src/plugins/index.ts:107-110`）。必须在新模块中保留回退，否则只在旧目录下的工作区插件无法算摘要/热更 |
| 高 | 市场安装/更新行为 | 新增“目标条目必须存在，否则补拉来源”；官方清单会按需拉 CDN，失败保留旧目录并传播来源错误。产品 `installMarketplacePlugin` 无 `pluginName` 校验 |
| 中 | 目录条目新增 `regions` | 产品 contracts 无 `PluginStoreRegion`，strict 协议下透传未知值有整页解析风险 |
| 中 | 内置插件版本/seed 路径三处一致约束 | manifest、package.json、`config/official-plugins.json` 及生成文件必须一起改；上游删除 `agents/visual-judge.md`，产品 catalog 仍将其列为 requiredSeedPaths |

### 产品 P0–P5 适配冲突

- **P0（plugin-api/session-control）**：两包与上游同为 1.4.0，且 4.0.0 无增量；按阶段 0 的“上游源 + 品牌映射”处理 import/schema 差异，不再维护分叉版本。
- **P2/P4（extension-host、extension-slots、app-control、services/extensions）**：仅品牌差异（`KAYINGCODE_PROCESS_LABEL`、`kayingcode-extension-host`、`IKayingCodeAgentService`、`kayingcode-protocol-v4`）；反向合并上游文件时保留品牌替换。
- **P3/P5（session-control 绑定、内置插件）**：产品内置清单是 `config/official-plugins.json` + `official-plugin-catalog.generated.ts`，上游是 `official-plugin-definitions.ts`；改为“上游 definition 生成 + 产品附加项”的清单适配，不再手工映射。产品另有 blender/taptap/game-playtest/computer-use 插件，作为附加项保留。
- **品牌/路径缺口**：产品的 `packages/shared/src/zcode-protocol/index.ts` 只是 `kayingcode-protocol` re-export；`plugins/workspaceTrust` 协议、`ZCodePluginInfo.workspaceTrust`、`IPluginManagementService.setWorkspacePluginTrust`、UI `PluginsSection`/`pluginManagementStore` 全部缺失，需要在 kayingcode 词表上重做。
- **基础设施缺口**：产品 adapters 缺 `mcp/config-loader.ts`、`skills/catalog.ts`、`watch/`，bootstrap 缺 `plugin-discovery/port.ts`、`plugin-secrets.ts`；工作区信任/live inventory 不是单文件改动。

## MCP 机制（4.0.0）

### 机制变化

1. **配置源分层与热加载**：新增 `adapters/src/mcp/config-source.ts`、`config-loader.ts` 与 `bootstrap/src/app/dynamic-mcp-config.ts`，MCP 配置从启动时快照改为“用户/项目/插件显式 map”的配置源，打开的会话可重读；`core/src/mcp/runtime/session.ts` 引入 McpSession 状态机。
2. **MCP 端口扩展**：`contracts/src/interfaces/mcp.port.ts` 新增 `McpConfigurationSource`、`McpToolCatalogPort`、`McpServerToolSnapshot`、`McpWaitForServerOptions`、`mcpConfigKey`。
3. **异步工具目录**：新增 `tool-catalog-cache.ts`、`McpServerToolSnapshot`、`resource-subscriptions.ts` 状态处理；MCP 启动支持 `blocking | background`，工具目录异步就绪；ToolSearch 关闭时通过新工具 `WaitForMcpServers` 等待指定 server。
4. **连接与恢复**：连接池支持按 server 等待、needs-auth 分类、builtin 重启上限；新增 `transport-errors.ts` 错误分类、调用重试与远端恢复测试。
5. **项目级 MCP 配置**：`mcp.md` 新增 Project-Level MCP Config Plan：项目 `mcp.servers` 配置、合并优先级（手动 user/project 覆盖插件同名 server）、信任与副作用边界、app-server 边界。
6. **stdio node fallback**：更新 `mcp-node-fallback.md` 的 Electron Node shim、shim 目录、环境契约、bundled npm 与 Windows npm 子进程窗口。
7. **MCP UI**：`zcode-protocol/mcp-ui` 协议调整，新增 open/reconnect 测试；资源订阅与遥测状态分类更新。
8. **CUA 边界**：上游把独立 CLI 的 CUA broker 凭据与 `zcode-cua` MCP 纳入启动链路（`mintStandaloneZCodeCuaBrokerCredentials`、`ZCODE_CUA_*`）。CUA 不属于游戏场景增量，但属于上游机制；本轮先做“是否恢复上游 CUA 机制”的对齐评估，主线批次不依赖它。

### 关键机制细节

- **配置优先级**：system 默认 → 项目配置文件 → 用户配置（同名 server 用户覆盖项目）→ 插件 server → 显式 map → 内建 server。某文件没有 `mcp.servers` 时回退同 scope 的 `.agents/mcp.json`，并为磁盘项附加 `source:{kind:"user"|"workspace"}`。
- **项目配置收权**：项目文件只按 project schema 解析，`features.mcp`、`plugins.enabled`、`suppressedBuiltins` 不再能关闭 MCP/隐藏官方插件；`plugins.options` 被忽略；`plugins.dirs` 只作待信任候选。
- **配置源与监听**：`config-source.ts` 以路径、插件根、显式 server、cwd、env hash 做 sha256 共享 key，进程级 refcount registry；监听锚点只取已存在目录，300ms 尾部去抖、1s 绑定超时、失败两次停听、不轮询；新会话 acquire 时强制读盘。
- **会话收敛**：`core/src/mcp/runtime/session.ts` 订阅配置源，按 `mcpConfigKey` 找出变化 server 并 `connectConfiguredServers`；统一分类 `not_configured/disabled/absent/pending/needs_auth/failed/connected`；ToolSearch 走实时读取/有限等待。
- **信任**：workspace MCP 仍默认拒绝，按 workspace + server + declarationDigest 记录；“准入判定”和“连接握手”分段，工具调用只等正在进行的判定，不等最慢 server；项目插件按插件根 + 声明摘要信任，未信任不加载 Hook/MCP/Skill。
- **连接池**：`pool.ts` 退化为纯租约管理，连接记录/generation/连接任务/恢复任务全部归 adapter；删除 pool 的 `connecting` 缓存与 `revalidateEntry`；资源退订按本租约登记的 `(uri, subscriberKey)`。
- **重试/恢复**：远程意外断连后台恢复 5 次（1/2/4/8s 退避）并保留工具；`source=builtin` 的 stdio 崩溃自动重启（10 分钟最多 5 次）；其他 stdio 失败清空目录；仅 Streamable HTTP 的“会话过期/连接关闭”自动重试一次；401/insufficient_scope 走 step-up OAuth 后重试一次。
- **工具目录缓存**：进程级 LRU（32 条 / 30 分钟 / 单条 2MiB / 总量 16MiB），仅 stdio 建 key；只补“启动中尚不知列表”的展示，投影标 `catalogOnly:true`，不可作为执行/权限事实；仅协议入口启用，TUI/headless/远程不启用。
- **MCP App 打开语义反转**：上游在已有连接不可用时主动重连一次（30s 预算），失败才报 -32001；产品 `mcp-ui/CONTRACT.md` 当前明确“不主动重连”。
- **structuredContent 投影**：改为“有 content 就只用 content；content 无模型块才序列化 structuredContent”，并支持 null/false/0；仅靠 structuredContent 提供详情的 server 在同时给摘要 content 时会丢详情。
- **协议投影**：`mcp/list` 的 strict schema 未变，但内部 `errorCode` 必须在协议投影时剥除；产品 `kayingcodeMcpListResultSchema` 目前 strict 且无 `errorCode`。

### 破坏性变更

| 严重度 | 变更 | 影响 |
| --- | --- | --- |
| 致命 | `McpPort` 与 `core/src/runtime/methods/mcp.ts` 重写 | 产品 `adapters/src/mcp/index.ts`、`core/src/mcp/index.ts`、`bootstrap/src/mcp-config.ts` 均有本地改写（localrun 鉴权、workspaceRoot/identity、CUA 清理），不能机械合并 |
| 致命 | 配置改为配置源 + 热加载 | 产品 `bootstrap/src/mcp-config.ts` 仍是启动时构建；`create-app.ts` 需提供 `McpConfigurationSource`，localrun/Host 两种装配都要补齐 |
| 高 | 项目级 `mcp.servers` + 信任 | 产品已有 `.agents/mcp.json` 与 `workspace-mcp-trust`，但上游扩展了信任来源与合并优先级；需确认现有 trust 记录可迁移，且未受信项目 server 不执行 |
| 高 | 工具目录异步就绪 | 首轮请求可能没有 MCP 工具；`WaitForMcpServers`、ToolSearch、公告与 UI 状态都要适配；产品 `toolSearchDelivery` 本地实现需重接 |
| 高 | 错误分类与 needs-auth | 新增/调整错误码与分类；按新目标恢复官方鉴权，localrun 由 `ApiMock` 返回，真实端点走远端，避免 UI 出现无效登录引导 |
| 中 | 调用重试与远端恢复 | 重试次数/退避/超时预算变化，可能改变工具调用延迟与失败文案 |
| 中 | node fallback 与 env 契约 | 上游环境键/路径与产品 `KAYINGCODE_NODE_FALLBACK_*` 可能分叉，需保留双兼容 |
| 中 | `clientInfo.version` 来源 | 必须取产品根 `package.json` 版本（0.2.x），不能回退 workspace 子包版本 |

### 产品冲突

1. `adapters/src/mcp/index.ts`：产品已把官方鉴权改为 KayingCode origin、移除 `workspaceKey`、增加 `KAYINGCODE_MCP_SERVER_REQUEST_ID_META_KEY`，并裁掉大量官方 MCP/OAuth 逻辑（`official-auth.ts` 仅剩 37 行新增/548 行删除）；上游重写同文件。
2. `bootstrap/src/mcp-config.ts`：产品保留独立的 CUA MCP 清理与 official plugin id 识别（`KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID`）；上游新配置源会重新引入 CUA server，需在新装配中过滤。
3. `core/src/mcp/index.ts`：产品把 MCP 工作区路径改为 `workspaceRoot`、身份 key 改为 `workspaceIdentity`，并把结果格式化拆到 `result-format.ts`（错误展示 meta 由 MCP result 显式声明）；上游重写工具结果与快照投影，需要重新落位。
4. `bootstrap/src/workspace-mcp-trust`：产品已有项目 `.agents/mcp.json` 信任实现；上游 4.0.0 对该模块有 61 行新增/30 行删除，需按新配置源扩展而不是替换。
5. 产品缺 `config-loader.ts`、`config-source.ts`、`tool-catalog-cache.ts`、`transport-errors.ts`、`dynamic-mcp-config.ts`，且 `core/src/mcp/runtime` 不存在；这批文件与 `watch`/`live-inventory` 必须一起落。
6. **官方鉴权从“裁掉”改为“保留机制 + mock”**：产品当前把官方 MCP 鉴权裁成 stub（`official-auth.ts` 仅剩透传）；按新目标应恢复上游鉴权链路，localrun/离线由端点解析 + `ApiMock` 承载，配置真实端点后走远端，不再删除分支。
7. **MCP App 契约相反**：产品合同是“首次 open 不主动重连”，上游改为失败后重连一次并可能启动/重启 server；产品 `session-facade.ts` 与 `app/types.ts` 尚无 `reconnectMcpAppConnection`，桌面插件 UI 与 E2E 需同步改。
8. **协议副本落后于 3.18.2**：产品 `kayingcode-protocol*` 缺少基线已有的 `rewindFiles`、`deletionPreview`、`editLock`、`pluginDiscovery` 等字段；4.0.0 增量建立在这些缺口之上，必须先决定“补齐基线”还是“显式裁剪并逐字段移植”。
9. **设置页/运行时不一致**：产品设置页已按 `.kayingcode` + `.agents` 双来源工作；动态配置把 `.agents` fallback 引入会话运行时后，设置页可见但过去不会加载的 server 会开始加载，需要定义优先级与提示。
10. **Kaying 插件链路**：`kaying-computer-use-plugin`、`kaying-for-taptap-plugin`、`kaying-game-playtest-plugin`、`blender-plugin` 都走插件 MCP；需验证 `pluginMcpSources` 声明顺序、命名空间 `plugin:<name>:<server>`、CUA 对象身份信任，以及 Blender 的 cwd/解释器路径在动态 loader 下不变。
11. **严格状态 schema**：只移植 adapter/loader 而不改协议投影，`mcp/list` 会因 `errorCode` 字段被 strict schema 拒绝，表现为整条列表不可用。

### 采纳建议

- **适配后采纳**：配置源/热加载、McpSession 状态机、工具目录缓存、`WaitForMcpServers`、连接池等待、needs-auth 分类、重试/恢复、node fallback、MCP UI 重连。
- **产品补丁**：`workspaceRoot`/`workspaceIdentity` 注入、错误展示 meta、`KAYINGCODE_*` 别名；localrun 鉴权改为上游机制 + mock；CUA MCP 由对齐评估决定是否启用。
- **保留上游机制 + 端点/mock 适配**：官方鉴权、OAuth、账号/套餐、官方 MCP 鉴权、远端市场与遥测。localrun 默认走 mock，不再删除上游分支。
- **单独评估**：上游 CUA broker 凭据与 `zcode-cua` 启动链（不属于游戏场景增量，但需决定是否恢复上游机制）。
- **验收**：配置优先级与信任、热加载、异步启动等待、重试/恢复、资源订阅、MCP UI 重连、localrun 与 Host/Relay 双栈、三平台 node fallback。

## CLI 运行时（4.0.0）

### 机制变化

1. **分层不变，模块新增**：`core/contracts/adapters/bootstrap/cli` 未改名；新增 `adapters/src/watch`（chokidar 文件监听）、`adapters/src/mcp/{config-loader,config-source,tool-catalog-cache,transport-errors}.ts`、`adapters/src/{skills/catalog.ts,browser/storage-state.ts}`、`core/src/mcp/runtime`（McpSession 状态机）、`core/src/skills`、`core/src/tool/cmd-readonly`、`core/src/tool/executor/live-entry-resolution.ts`、`bootstrap/src/app/{dynamic-mcp-config,dynamic-skill-catalog}.ts`。
2. **MCP 初始化策略**：`initializeMcp` 只在正常新输入时刷新，支持 `mcpStartupPolicy: blocking | background`；断流/准入重试沿用原工具列表；新增 `WaitForMcpServers` 工具与按 server 等待、needs-auth 分类、builtin 重启上限。
3. **工具调用循环**：输入附件状态改为 `normalInputPreparationPending`、新增 `pluginReferenceInput` 延迟解析、`toolSearchDelivery` 随请求持久化；模型非法 JSON 入参用 symbol 标记，不再静默 `{}`；PreToolUse 改写后单独校验；Read 的路径/页码预检移到 handler。
4. **流式/抢占/子代理**：立即发送的 abort 带结构化 reason，经 `InputPreemptionControl.register()` 把前台子代理转后台；子代理默认 `alwaysBackground`，新增同步子代理、冷恢复、借用父 MCP 端口、`transcriptAgentOutputFiles`。
5. **compact**：输出预留改为 `max(21K, 窗口×8%)`，摘要上限=预留；自动/超窗压缩不再初始化 MCP，仅手动压缩初始化；新增 `compact-task-status` 条目。
6. **模型适配**：重试等待叠加准入冷却与抖动；OpenAI Responses 加密推理回传（`store:false` + `include`）；provider 业务码形状过滤；空补全重试。
7. **存储**：新增迁移 `0026_dwf_run_parent_session_index`、`messages({contentProfile:"index"})`、删除预检批量与 `scanArtifactReferences`、永久删除增强。
8. **协议**：v4 网关新增 turn admission/plugin discovery 遥测、workflow activity history 种子；RPC 新增 `session/readReplyLanguage`、`plugins/workspaceTrust`；`session/requestRuntimePreferences` 增 `totalTokensReminderEnabled`（默认 false）与 `agentAlwaysBackgroundEnabled`（默认 true）；新错误码 `-32033`。
9. **CLI**：新增 `--browser-state/--no-browser-state`、`--total-tokens-reminder`、`--agent-always-background`；插件宿主进程名；独立 CLI 的 CUA broker 凭据铸造。
10. **依赖**：contracts 升 zod 4.6.5 并删除 `zod-to-json-schema`；adapters 新增 `chokidar 4.0.3`；根 package.json 新增 `#preinstalled-*`、`yauzl/tar-stream/unbzip2-stream/@zcode/shared/zod`。

### 破坏性变更

| 严重度 | 变更 | 影响 |
| --- | --- | --- |
| 致命 | contracts zod3 → zod4，JSON Schema 生成器重写 | 产品 `contracts` 仍为 zod `^3.24.0` + `zod-to-json-schema 3.25.2`（`src/tools/json-schema.ts`、`tool-search.ts`、`deferred-tool-call.ts` 直接使用）；`normalizeToolJsonSchema` 导出消失，defaulted 字段不再强制进 `required` |
| 致命 | MCP 端口/运行时重写 | `contracts/src/interfaces/mcp.port.ts`（+148）、`core/src/runtime/methods/mcp.ts`、`adapters/src/mcp/index.ts` 大幅重写；产品这三个文件均有本地改写 |
| 致命 | 协议目录改名 | 上游 `bootstrap/src/zcode-protocol*`；产品为 `kayingcode-protocol*`，20 个协议文件改动无法直接应用；产品 v4 冷恢复/回放/归属修复会丢 |
| 高 | turn 循环状态与请求构建破坏 | `turn.ts`、`turn-loop.ts`、`turn-loop-state.ts` 字段改名，`buildRuntimeProviderRequestMessages` 移除，MCP 初始化返回 `McpSessionView`；产品同文件已删 lifecycle hook 上下文、`pluginDiscoveryUi`、`inputOrigin` |
| 高 | executor 端口新增必填能力 | `describeUnavailableTool`、`resolveUnregisteredTool`、`mcpServerWaitPort`、`syncSubagent`、`inputPreemption`；`RuntimeInputValidationIssue` → `ToolInputValidationIssue` |
| 高 | 工具契约变化 | Read 语义校验位置、ToolSearch 公告/交付 schema、BashOutput 后台 cwd/同步子代理、新 `WaitForMcpServers`、`unparsed-tool-input` |
| 高 | 存储 API/迁移 | 上游 0025 永久删除 + 0026 dwf 索引；产品刻意移除 0025 与 purge 实现（迁移止于 0023），只能采 0026 与 `messages(index)` |
| 中 | 配置/信任 | 项目 `plugins.dirs` 只作候选、项目 options 剥离；`createConfigWithPluginMigrations` 变 async 并读 hook 脚本摘要；新增 `workspace_hook_script_unavailable` |
| 中 | Windows shell 语义 | `WINDOWS_CMD_SHELL_DISPLAY_NAME` 从 "CMD" 改为 "cmd.exe"，`exec/bash-shell-provider.ts` 变 async 并改用 `@zcode/shared/node` 的 git-bash 发现；环境公告字节变化影响 prompt 前缀 |
| 低 | CLI 登录相关 | 上游保留 `login/logout`；产品已删除 `login-command.ts`、`tui-auth.ts`。按新目标恢复上游登录链路；CUA 铸造随 CUA 对齐评估决定 |

### 产品冲突

1. **协议目录改名**：上游 20 个协议文件改动需人工映射到 `kayingcode-protocol*`；产品在 `kayingcode-protocol-v4/{v4-gateway,transcript-hydration,replay,topic-frame-reservation}.ts` 有冷恢复本地修复，不能覆盖。
2. **CUA 边界**：上游 `cli/src/{env,main}.ts`、`core/src/runtime/methods/mcp.ts`、`bootstrap/src/mcp-config.ts` 依赖 `@zcode/shared` 的 `mintStandaloneZCodeCuaBrokerCredentials`/`ZCODE_CUA_*`；产品只保留 `KAYINGCODE_CUA_OFFICIAL_PLUGIN_ID`，且 `official-auth.ts` 已从上游 585 行裁到 37 行新增/548 行删除。直接采纳会编译失败或复活已迁出的 CUA MCP。
3. **账号体系**：上游重写 `adapters/src/auth/shared-credentials.ts`（凭据代次屏障）；产品该文件有 329 行本地改动（enc:v2 keyring），且已删 login/TUI auth、改写 `bootstrap/src/auth-login.ts`。同一把锁/同一代次语义逐段对照，不能 cherry-pick。
4. **永久删除**：产品明确移除 `session_purge`、`session_runtime_presence` 与迁移 0025；整体采上游迁移列表会重建产品刻意删掉的表与触发器。
5. **`create-app.ts`**：上游改为 `createAppMcpConfigurationSource` + 实时 skill 目录，并把 MCP server 来源改为 `configurationSource.getSnapshot().servers`；产品移除 `createConfigWithPluginMigrations`、加入 review-budget 准入。同一函数同一装配顺序，无法机械合并；localrun/Host 场景需补齐新端口。
6. **turn/loop 本地删功能**：产品删掉了 SessionStart/UserPromptSubmit 上下文持久化、`pendingPreviousRuntimeAgentNotice`、compact SessionStart hooks；上游把 plugin reference、MCP 初始化、提醒计时挪到 `turn-loop`，冲突集中在这几段。
7. **上下文/prompt**：产品改 `core/src/context/{builder,dynamic-sections,sections/env-info,sections/desktop}.ts` 并接线 remote context-composition；上游改 context 组装与 compact 后重建。两侧都会改变 system/工具段字节，prompt 快照与缓存前缀验证需重做。
8. **工具搜索/审核策略**：产品 `core/src/tool/review-tool-policy.ts`、`handlers/read.ts` 的 `KAYINGCODE_REVIEW_WORKSPACE_ROOT` 守卫与内置工具裁剪，会和上游新增 `WaitForMcpServers`、未知工具提示、Read 预检迁移相互影响；allowlist/权限串需显式收口。
9. **zod 双实例**：产品其余包已大面积 zod4，但 CLI contracts 仍是 zod3；单一 zod 实例迁移要同步改 `json-schema.ts`、`tool-search.ts`、`deferred-tool-call.ts`，否则工具 schema golden 与 provider 缓存前缀会漂移。

### 采纳建议

- **直接采纳**：contracts zod4 + JSON Schema 生成器（附带改三处调用点）、模型重试冷却/加密推理/非法 JSON 标记、compact 策略、i18n 文案、Windows shell 显示名（需 prompt 回归）、迁移 0026 与 `messages(index)`。
- **适配后采纳**：MCP 重构 + `WaitForMcpServers` + 热加载/目录缓存（保留上游 OAuth/官方鉴权机制，localrun 用 mock；workspaceRoot/identity 作为显式补丁）；协议 v4 新 RPC（映射到 kayingcode 词表、保留冷恢复修复）；turn loop/抢占/子代理；插件 discovery/目录信任；配置 schema/hook 脚本信任；CLI 新 flag（恢复 login/logout，CUA 铸造待评估）。
- **暂缓**：preinstalled-tools 与 `#preinstalled-*` 依赖、上游 CUA broker 机制评估；永久删除增强仍不采纳（与产品删表决策冲突）；`login/logout` 按新目标恢复上游机制。

## 跨层协议、桌面端与架构策略

### 关键变化

1. **不是协议大改版**：4.0.0 对 `extension-host`、`app-control`、`session-control`、MCP Apps、`client-public-api`、`plugin-api`、UI extension slots 均无 diff；这些是 3.18.2 的成果，本轮不要重复改造。
2. **旧协议新增**：`session/readReplyLanguage`、`plugins/workspaceTrust`；`zcodePluginInfo` 增 `workspaceTrust`；商店 listing 增 `regions`；AppSettings 增预装工具两项、`totalTokensReminderEnabled`、`agentAlwaysBackgroundEnabled`、`replyLanguage`；runtime prefs 回包增两字段；Project Token 新错误码 `-32033`；Hook 新原因码 `workspace_hook_script_unavailable`；`turn.started` 为旧发送方兼容 `isFirstMessage`。
3. **v4 新增**：`v4/storage/sessionData/deletionPreviewBatch`、通知 `v4/telemetry/turn-admission`（`turn.admission`）、telemetry `plugin.discovery`、snapshot/delta 活动摘要（dismissed/completedActivityCount/resultSummary/ended subagent/goal summaryHidden）、sessions-index `hasCompactWork`。
4. **services**：新增回复语言、插件信任、批量删除预检、telemetry 分派；credential 统一锁内写入 + 恢复代次（`withCredentialGeneration`）+ 全平台私有文件回退/自动重置 + `ZCODE_CREDENTIALS_FILE`；clientConfig 过期快照降级与草稿模型迁移。
5. **desktop host**：回复语言注入、预装工具 bin/PATH、运行会话数合并、批量删除预检、项目排序、手机 attachment 放行 ClientConfig、插件沙箱首帧 `data-theme`、app-control 导航改用 `did-navigate`。
6. **UI**：商店按区域过滤、项目插件信任按钮、插件推荐埋点、预装工具对话框、shortcuts 模块化与 `toggleVoiceInput`；plugin-ui/扩展 slots 未变。
7. **preinstalled-tools**：shared contract/环境变量、desktop 安装器与 2636 行 catalog、UI 对话框、Platform 通道、AppSettings、spawn PATH、根 imports map、lint 新脚本——是一整组独立能力，不随机制升级顺手接。
8. **依赖**：根新增 tar-stream/unbzip2-stream/yauzl/zod 4.6.5；desktop 增 tar 7.5.13；CLI contracts 由 zod 3.24 迁 4.6.5；pnpm 10.33.2；Node 仍 `>=24`。
9. **架构策略**：新增 11 个模块（mcp-runtime、live-config-watch、skill-live-catalog、plugin-discovery、workspace-plugin-trust、workspace-plugin-declaration、bash-cmd-readonly-policy、preinstalled-tools 系、shortcuts、windows-git-bash-discovery），并为既有模块补 `requires`；规则集未变，主要是模块登记与 exceptions。

### 产品冲突

1. **协议分叉**：产品协议复制到 `kayingcode-protocol`/`kayingcode-protocol-v4`，zcode 文件只是 shim，且副本缺少基线字段（见 MCP 冲突 8）；4.0.0 增量不能机械合入。
2. **凭据写入语义**：新 `writeCredentialRecordLocked` 要求持锁且代次匹配，产品 `credentialService` 已大改（enc:v2 keyring）；旧 Host 写路径与自动重置混用会丢登录，需单独安全工单。
3. **Host 新方法兼容**：回复语言、插件信任、批量删除、插件埋点都要求旧 Host 返回 null/false/method-not-found；产品 Host/Relay/手机链路需逐条保留降级。
4. **Windows**：上游 `integratedTerminalShells.ts` 改 async 并依赖 shared `windowsGitBashDiscovery`；产品已删除 windows-runtime-host 且保留旧同步实现，直接引入会类型/行为冲突。
5. **lint**：上游 lint 串联 document/libreoffice/python 检查；产品 lint 仅 oxlint，整包拷贝根 `package.json` 会失败。
6. **品牌/通道**：4.0.0 新增 `zcode:*` 通道与 `ZCODE_*` 环境变量；产品已有 `kayingcode:*`/`KAYINGCODE_*`，需复制或改名，避免双前缀。
7. **MCP Apps**：产品已扩展 `PluginSandboxRegisterRequestPayload`（extension 视图、kayingcode/* meta key）；上游该文件未变，保留产品版本，不要反向覆盖。
8. **已退役层**：产品删除 windows-runtime-host、managed-worktree、desktop app-control-navigation、CUA 桌面主进程集成、web web-remote-control；上游对应改进需按产品语义重做。
9. **localrun/Host/Relay/移动端**：上游 `remoteWorkspaceTrustIdentity` 修复只覆盖 `remote:` identity；产品 remote-agent identity、relay-cloudflare 与手机链路需等价实现。
10. **Hook 信任**：产品实现与上游 `resolveWorkspaceHookTrustIdentity` 不同；上游“入口脚本内容进 digest、不可读不可信”需在产品实现中重做，不能只挑 shared 文件。
11. **架构检查**：产品策略仅 32 个模块、`managedOnly`、exceptions 为空，并删除 report/resolver/session-control-boundary/upstream-admission 等脚本；上游策略引用大量产品已删路径，整份拷贝必红。
12. **UI 商店/Web auth**：产品 PluginStorePage/Card/Detail/List/store 已重写；上游商店区域与信任改动会冲突。产品已移除 webRegionalOAuth/web-remote-control；按新目标区域 OAuth 与远端市场机制应恢复，纳入阶段 1 的账号/API 层。

### 采纳建议

- **先做协议基线盘点**：逐文件 diff `kayingcode-protocol*` 与上游 3.18.2/4.0.0，形成“接受/拒绝”清单，并为 zcode shim 增加导出齐平测试；再移植 4.0.0 新方法/字段。
- **按垂直切片推进跨层**：回复语言 → 插件 workspaceTrust + 商店区域 → 批量删除 → telemetry；每片都保留旧 Host fallback。
- **凭据单独作为安全工单**：先 shared 代次/锁，再 services 写入，最后 Host 桥接；覆盖“旧 Host + 新 CLI”和“自动重置中途加密”。
- **架构策略选择性登记**：只登记产品实际采纳的模块，新增模块用产品 kayingcode-* 实际路径，不合并上游 260+ 模块全量 policy。
- **预装工具最后做**：shared contract、desktop 模块、UI 对话框、scripts、lint、根依赖必须整组引入。

## 产品扩展边界（其余以上游为准）

产品差异只保留在以下扩展点；核心协议、插件 loader、MCP 配置、CLI 运行时不再维护平行实现。

- **游戏插件与工具**：`blender-plugin`、`kaying-for-taptap-plugin`、`kaying-game-playtest-plugin` 等游戏能力，以及 `kaying-computer-use-plugin`（是否恢复上游 CUA 机制单独评估）。
- **网络 mock 与端点适配**：localrun 默认用 `ApiMock` 返回本地结果；配置真实端点后走远端。覆盖登录/账号、官方 MCP 鉴权、市场、配置、遥测、更新检查。
- **品牌与 i18n**：`zcode` → `kayingcode`、`ZCODE_*` → `KAYINGCODE_*` 的机械映射集中到一处；新代码默认使用上游命名，品牌映射在构建/边界层完成。
- **产品渠道**：Host/Relay/mobile 作为上游端口上的适配器；`workspaceIdentity` 语义保留，但协议字段与生命周期以上游为准。
- **插件兼容扩展**：`.kayingcode-plugin` 作为上游 discovery 的额外 manifest 路径候选，不再维护第二个 loader；`config/official-plugins.json` 作为产品打包/清单适配层，内容映射到上游 plugin definition。
- **MCP 产品补丁**：`workspaceRoot`/`workspaceIdentity` 注入、错误展示 meta 等，优先确认上游 4.0.0 是否已有等价机制；没有则以显式补丁 + 测试承载，不再改动整份实现。
- **显式例外**：CUA Helper/Broker（如最终决定不恢复）、`design-runtime`、`windows-runtime-host`、`data-sync`、`gen-ui`、Windows 全量签名/NSIS 补丁等，在架构策略中登记原因与影响范围。
- **非游戏上游能力默认随上游**：voice-input、selection-comment、composer-edit-mode、managed-worktrees、settings-search、remote context-composition 等不再默认排除，按依赖排期在机制批次之后补齐；只有明确产品拒绝时才登记例外。

## 完整开发计划

### 计划假设与资源

- **团队**：平台/CLI 1 人、桌面/UI 1 人、服务/Relay 1 人、QA 0.5 人；游戏插件迁移由游戏方向负责人配合，不占主线全职。
- **周期**：约 16–20 周；核心工程约 100–120 人日，另加三平台回归与发布 3–4 周。
- **工作方式**：短分支 + PR + 特性开关；每阶段独立验收，不采用一次性大合并。
- **兼容承诺**：阶段 2/3 期间游戏插件保持可加载；旧 Host 在新 CLI 下保留降级路径。
- **前置已完成**：v4.0.0 差异分析、四路源码评估、协议/插件/MCP/CLI 冲突清单（见上文）。

### 里程碑

| 里程碑 | 范围 | 退出标准 | 目标周 |
| --- | --- | --- | --- |
| M0 基线 | 阶段 0 | 协议/共享层生成管线可用，架构策略合并，contracts zod4 通过 | 第 2 周 |
| M1 账号/API | 阶段 1 | localrun mock 全流程、staging 端点与 Relay mock 可用，真实端点联调通过 | 第 5–6 周 |
| M2 机制对齐 | 阶段 2–3 | 插件与 MCP 只有一套上游实现，游戏插件冒烟通过 | 第 11–13 周 |
| M3 CLI/跨层 | 阶段 4 | CLI 运行时/协议 v4/跨层切片完成，新旧 Host 兼容 | 第 16–17 周 |
| M4 收尾 | 阶段 5 | 游戏插件迁移完成，兼容层移除，`UPSTREAM_BASE` 更新 | 第 18–20 周 |

### 阶段 0：上游对齐基线（1–2 周）

目标：把“产品分叉”改成“上游源 + 生成 + 补丁”，让后续阶段都能直接采用上游文件。

- **协议/共享契约生成管线**：以 `packages/shared/src/zcode-protocol*` 为源，集中品牌映射，生成 `kayingcode-protocol*`；产品补丁（冷恢复、queue editLock、回放、归属等）落为显式 patch 文件并配测试；加导出齐平检查，缺字段即失败。
- **架构策略合并**：以上游 `architecture-policy.yaml` 为基础，叠加产品模块（游戏插件、Host/Relay、mobile、relay-cloudflare 等）与显式例外；恢复上游 `architecture-check`/admission 能力，产品或注册新模块，不再把 CLI 全部标 unmanaged。
- **contracts 契约升级**：zod 4.6.5、删除 `zod-to-json-schema`、`z.toJSONSchema`、`unparsed-tool-input`、`WaitForMcpServers` 契约；同步改 `json-schema.ts`、`tool-search.ts`、`deferred-tool-call.ts`。
- **品牌映射集中化**：`zcode` → `kayingcode`、`ZCODE_*` → `KAYINGCODE_*` 只保留一份映射表；新代码默认上游命名，品牌在边界完成。
- 验收：协议/共享层与上游 4.0.0 逐字段齐平或显式 patch；架构检查在合并后的策略上通过；工具 JSON Schema golden 对比；`pnpm run typecheck`/`lint` 通过。

### 阶段 1：账号 / API / 网络 mock 层（2–3 周）

目标：保留上游账号/API 机制，同时让 localrun 与离线环境可用。

- **恢复上游账号链路**：`login/logout`、account/凭据、`shared-credentials` 代次锁、`client-public-api`、官方 MCP 鉴权、市场、配置、模型/套餐信息与遥测代码路径；不再把官方鉴权裁成 stub。
- **端点解析与 ApiMock**：新增统一的 endpoint resolver；localrun 默认 `ApiMock`，覆盖登录、账号信息、配置下发/帮助/强更/灰度、模型与套餐信息、官方 MCP 鉴权、市场清单/图标/下载、遥测与更新检查；配置真实端点后走远端。
- **凭据加固**：`writeCredentialRecordLocked` + `withCredentialGeneration` + 私有文件回退/自动重置 + `ZCODE_CREDENTIALS_FILE`；保留产品 enc:v2 keyring 适配，统一到上游锁语义。
- **品牌与环境**：新代码使用上游 `ZCODE_*`，产品 `KAYINGCODE_*` 作为别名；凭据/端点不出现在日志。
- 验收：无网络 localrun 全流程可用（登录 mock、官方 MCP 鉴权 mock、市场 mock）；配置 staging 端点可完成真实登录与配置拉取；旧 Host + 新 CLI、新 Host + 旧 CLI 均可用；mock 契约测试覆盖所有新增 API；三平台凭据写入/重置测试。

#### 账号/API 统一入口与对等 mock（建议采用 Cloudflare Relay）

可以统一，但不要让 Relay 变成第二个账号系统或生产流量的默认中间人。建议把 Relay 定位为**同源网关 + staging/e2e mock 宿主**，生产敏感链路仍直连官方。

- **路由所有权**：`/api/v1/remote/*`、`/api/v1/account/*` 继续归 `WebRemoteRelayObject` 的设备身份；新增 `/api/v1/oauth/*`、`/api/v1/client/*`、`/api/v1/mcp/*`、`/api/v1/sites/*` 的 `mock | proxy` 路由。`/api/v1/ultra*` 模型推理不经过 Relay。
- **对等 mock 模块**：`apps/kayingcode-relay-cloudflare/src/apiMock/`，与客户端 `ApiMock` 共用 `packages/shared` 里的 contracts 与 fixtures；Relay 只换传输层，不复制 schema。支持场景切换（登录态、过期、配额、灰度、强更、区域、错误码、延迟），默认关闭，生产环境强制拒绝 `mock` 模式。
- **单一 fixture 源**：新增 `client-public-api` 与官方 API 的 fixture/contract 目录；本地 `ApiMock`、Relay mock、E2E 共用，契约测试校验两边响应都能被同一 schema 解析。
- **Relay 边界**：不持久化 ZCode 账号密码/token/业务数据；`proxy` 只做精确 origin/path allowlist 转发，不缓存凭据；OAuth token/profile 默认直连官方，Relay 仅在 staging 提供模拟；模型推理与流式响应不经过 Relay。
- **Staging**：当前无 staging 端点，`DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN` 为空。建议增加 `local | staging | production` 端点预设与 Cloudflare `env.staging` 独立 DO/密钥；staging 默认 `mock`，可切 `proxy` 到官方测试 origin；客户端通过配置/环境选择，不硬编码。

| 能力 | localrun 默认 | Relay staging | 生产 |
| --- | --- | --- | --- |
| 登录 / OAuth | 本地 mock | 模拟授权/过期/错误 | 直连官方 authorize/token/profile，不走 Relay |
| 账号 / 套餐 / 配额 | 本地 mock | mock | 直连官方 |
| 配置 / 帮助 / 强更 / 灰度 | 本地 mock | mock 或 proxy | Relay proxy 或直连 |
| 官方 MCP 鉴权 / 用量 | 本地 mock | mock | 直连官方（Relay 可选 allowlist proxy） |
| 市场清单 / 图标 / 下载 | 本地 mock | mock 或 proxy | 官方/CDN 直连，Relay 可做元数据缓存 |
| 模型推理 / 流式 | scripted mock（仅测试） | mock | 直连 provider，不走 Relay |
| 遥测 | no-op | mock sink | 直连或 Relay 接收 |
| 远程设备身份 / 连接 | 不适用 | 真实 Relay | 真实 Relay |

待定：生产环境哪些非敏感端点允许走 Relay proxy（建议只限配置、市场元数据、MCP 用量；OAuth 与推理保持直连）。

### 阶段 2：插件体系整体切换（3–4 周）

目标：上游插件机制成为唯一实现，产品插件作为消费者。

- 采用上游 `discovery`、material cache、`workspace-plugin-declaration`、`workspace-plugin-trust`、`live-inventory`、`plugin-secrets`、`marketplace`/`official-marketplace`、`atomic-directory`。
- 产品扩展只保留三处：`.kayingcode-plugin` 作为 discovery 的额外 manifest 路径候选；`config/official-plugins.json` 作为打包清单适配；游戏插件转换为上游 manifest/目录结构。
- 删除产品 loader、`configureKayingCodePlugin` 直写 config、项目 `plugins.options` 分支；workspace 选项迁到私有存储并提示用户重新输入。
- 补齐 kayingcode 协议 `plugins/workspaceTrust`、services、桌面/手机设置页与远程 Host 路由；市场 `regions` 与远程来源走阶段 1 的端点/mock。
- 验收：上游插件测试全绿；游戏插件（blender/taptap/game-playtest/computer-use）全部可安装、发现、加载；工作区信任 pending→trusted→新会话生效；私密选项读写/迁移；市场本地 mock 与远端往返；26 插件规模 watcher 不泄漏。

### 阶段 3：MCP 体系整体切换（3–4 周）

目标：采用上游 MCP 运行时，官方鉴权由阶段 1 的端点/mock 承载。

- 采用 `config-loader`/`config-source`/`dynamic-mcp-config`/`core/src/mcp/runtime`、`tool-catalog-cache`、`WaitForMcpServers`、`pool` 租约化、`transport-errors`、重试/恢复、MCP App open 重连、structuredContent 新投影。
- 恢复上游官方鉴权与 `workspaceKey` 语义；localrun 由 `ApiMock` 返回，真实端点走远端；官方 CUA MCP 是否启用由 CUA 对齐评估决定。
- 产品补丁收敛为显式 patch：`workspaceRoot`/`workspaceIdentity` 注入、错误展示 meta；若上游已有等价机制则删除补丁。
- 协议 `mcp/list` 的 `errorCode` 在投影层剥除；产品 shared schema 与上游齐平。
- 验收：上游 MCP 测试全绿；本地/远端配置优先级与信任；热加载增删改；异步启动与 `WaitForMcpServers`；HTTP 重试/401 step-up；MCP App 重连；游戏插件 MCP server（Blender/TapTap/Playtest）行为不变；三平台。

### 阶段 4：CLI 运行时与跨层（3–4 周）

目标：CLI 运行时回到上游，产品不再裁剪生命周期。

- turn/loop 状态与请求构建、executor 新端口、`InputPreemptionControl`、子代理 always-background/同步子代理/冷恢复、compact 策略、存储 `0026` + `messages(index)`。
- 恢复上游 lifecycle hooks 上下文、`pluginDiscoveryUi`、`inputOrigin`、`createConfigWithPluginMigrations`，不再继续删除；产品 review-budget 准入改为上游扩展点。
- 协议 v4：`readReplyLanguage`、`plugins/workspaceTrust`、`-32033`、runtime prefs 默认值、turn-admission/plugin.discovery telemetry、批量删除预检、活动摘要。
- CLI 新 flag、插件宿主进程名、`--browser-state` 等全部采用上游；`login/logout` 随阶段 1 恢复。
- 验收：prompt/工具 schema 字节 diff；冷恢复/回放/queue editLock；旧 Host fallback；desktop continuous 与 mobile replayable 双链路；三平台。

### 阶段 5：游戏插件迁移与上游能力补齐（2–3 周 + 持续）

目标：把游戏增强落到新架构上，同时补齐非游戏上游能力。

- 游戏插件迁移：blender/taptap/game-playtest/computer-use 改用上游 plugin manifest、MCP runtime、workspace trust、plugin-secrets；删除游戏侧对旧 loader/旧 MCP 配置的兼容分支；补游戏 E2E。
- 非游戏上游能力按清单补齐：preinstalled-tools（机制先行，bundle 可选）、managed-worktree、voice-input、selection-comment、composer-edit-mode、settings-search、remote context-composition；每项独立验收，不阻塞主线。
- CUA 对齐评估：决定恢复上游 in-process broker，还是保留产品 CUA 插件并登记例外。
- 验收：游戏插件全链路 E2E；非游戏能力按上游测试通过；架构策略无未登记例外；产品核心目录不再出现上游文件副本。

### 独立工单（不阻塞主线）

- **preinstalled-tools bundle**：安装体积、签名、Windows shim 与产品文档工具边界；机制随阶段 5，bundle 单独决策。
- **CUA 机制对齐**：上游 in-process broker vs 产品 `kaying-computer-use-plugin`，产出安全边界与迁移结论。
- **Windows npm `windowsHide` 补丁**：随桌面打包 npm 版本维护，Windows 真机验证。

### 工作分解（WBS）

估算单位：人日（pd），不含三平台回归与发布。

| ID | 阶段 | 任务 | 产出 | 依赖 | 估算 |
| --- | --- | --- | --- | --- | --- |
| P0-1 | 0 | 协议/共享层差异盘点与补丁清单 | accept/reject 清单、产品补丁列表 | 无 | 2 |
| P0-2 | 0 | 上游源 + 品牌映射 + patch 生成管线 POC | 生成脚本、导出齐平检查 | P0-1 | 3 |
| P0-3 | 0 | 架构策略合并与检查恢复 | 合并后的 policy、overlay 规则 | P0-1 | 2 |
| P0-4 | 0 | contracts zod4 + JSON Schema 生成器 | 迁移后的 contracts、工具 schema | P0-2 | 3 |
| P0-5 | 0 | CI 门禁：schema golden、协议 parity | CI job、失败样例 | P0-2/4 | 2 |
| P1-1 | 1 | 端点模型与环境预设 `local/staging/production` | endpoint resolver、配置项 | P0 | 2 |
| P1-2 | 1 | 共享 contracts/fixtures 目录 | mock/real 共用契约与 fixture | P0 | 2 |
| P1-3 | 1 | 扩展本地 `ApiMock` 覆盖账号/配置/市场/MCP/遥测 | 本地 mock 实现 | P1-1/2 | 3 |
| P1-4 | 1 | Relay `apiMock` 路由、模式门禁、场景控制 | `mock/proxy` 模块、场景 header | P1-2 | 4 |
| P1-5 | 1 | 恢复上游登录/账号/OAuth/官方 MCP 鉴权/市场路径 | 恢复后的服务与 CLI/桌面接线 | P1-1 | 5 |
| P1-6 | 1 | 凭据锁 + 代次 + 私有文件/自动重置 + keyring 适配 | 统一凭据写入与恢复 | P1-5 | 4 |
| P1-7 | 1 | Cloudflare staging 环境（独立 DO/密钥/域名） | `env.staging`、部署脚本 | 外部权限 | 2 |
| P1-8 | 1 | 离线/真实端点/旧 Host 兼容测试 | 测试套件、联调记录 | P1-3/4/5/6 | 3 |
| P2-1 | 2 | discovery/material cache/加载隔离 | 上游 discovery 模块接入 | P0 | 4 |
| P2-2 | 2 | plugin-secrets + 项目 options 收敛 + 迁移提示 | 私密选项存储、迁移逻辑 | P1-6 | 4 |
| P2-3 | 2 | workspace declaration/trust + 协议/services/UI | 信任全链路 | P2-1/2 | 5 |
| P2-4 | 2 | live inventory/watch/marketplace/regions | 热更新与市场来源 | P2-1/3 | 4 |
| P2-5 | 2 | 产品扩展：`.kayingcode-plugin` 候选、官方清单适配、游戏插件转换 | 薄适配层、插件清单 | P2-1/3 | 4 |
| P2-6 | 2 | 插件测试与桌面/手机 E2E | 上游测试 + 产品 E2E | P2-1–5 | 4 |
| P3-1 | 3 | MCP port/adapter/pool/retry/recovery | 新 Port 与 Adapter 内核 | P0 | 5 |
| P3-2 | 3 | config-loader/config-source/dynamic config/create-app | 配置源与热加载 | P2-4, P3-1 | 4 |
| P3-3 | 3 | runtime session/tool catalog/WaitForMcpServers | 异步目录与会话状态机 | P3-2 | 4 |
| P3-4 | 3 | 官方鉴权/workspaceKey 恢复 + mock 接线 | 鉴权路径、mock 适配 | P1-5, P3-2 | 3 |
| P3-5 | 3 | MCP App 重连/设置页/协议投影 | UI 与协议适配 | P3-3 | 3 |
| P3-6 | 3 | 游戏插件 MCP server 验证 | Blender/TapTap/Playtest 冒烟 | P3-1–5 | 3 |
| P3-7 | 3 | MCP 上游测试 + 三平台联调 | 测试套件与记录 | P3-1–6 | 4 |
| P4-1 | 4 | turn-loop/executor/抢占/子代理 | 上游运行时接入 | P3 | 5 |
| P4-2 | 4 | compact/存储 0026/messages index | 迁移与查询 API | P0 | 3 |
| P4-3 | 4 | 协议 v4 新 RPC/telemetry/批量删除预检 | 协议与服务接线 | P1, P4-1 | 4 |
| P4-4 | 4 | 恢复 lifecycle hooks/pluginDiscoveryUi/inputOrigin/createConfigWithPluginMigrations | 上游语义恢复 | P2/P3 | 4 |
| P4-5 | 4 | 跨层切片：回复语言/商店区域/活动摘要 | 桌面/UI/服务改动 | P4-3 | 3 |
| P4-6 | 4 | Host/Relay/mobile 兼容与旧 Host 降级 | 兼容矩阵与测试 | P4-3/5 | 3 |
| P4-7 | 4 | CLI/跨层测试与 prompt/schema golden | 测试套件 | P4-1–6 | 3 |
| P5-1 | 5 | 游戏插件迁移到新插件 API/MCP runtime | 迁移后的游戏插件 | M2 | 4 |
| P5-2 | 5 | 游戏插件 E2E/性能回归 | E2E 报告 | P5-1 | 3 |
| P5-3 | 5 | 上游能力清单（preinstalled/managed-worktree/voice 等） | 逐项评估与排期 | M3 | 3 起 |
| P5-4 | 5 | CUA 机制对齐评估 | 结论与安全边界 | M3 | 2 |
| P5-5 | 5 | 兼容层清理、文档、`UPSTREAM_BASE` 更新 | 发布说明与基线 | P5-1–4 | 3 |

合计约 116 人日；按 3 名工程师并行约 16–20 周（含评审、联调与缓冲）。

### 并行工作流与发布策略

- **游戏工作流**：每个阶段结束跑 blender/taptap/game-playtest/computer-use 冒烟；阶段 2/3 保留兼容适配，游戏功能不为升级让路。
- **分支**：每阶段从最新 `origin/main` 开 `feat/upstream-4-0-0-p<阶段>-<主题>`，PR 合入；不直接推 `main`。
- **特性开关**：`protocolPipeline`、`apiMode`、`pluginV2`、`mcpV2`、`cliRuntimeV2`、`gamePluginV2`；默认关闭，逐阶段打开并保留回滚路径。
- **回滚**：每阶段保留旧路径直到下一个里程碑退出；开关关闭即可回到旧行为，不做一次性删除。
- **发布**：阶段期间照常发 patch；M1/M2/M3 各出候选版本；正式标签仍走 `kaying-code-preflight-v<版本>` 三套签名构建。
- **基线**：M4 全部验收后才更新 `UPSTREAM_BASE.json` 到 `a4b44451`；中途记录剩余范围。
- **PR 门禁**：typecheck、lint、source:check、architecture:check、协议 parity、schema golden、mock contract、游戏冒烟。

### DoD（每阶段完成定义）

- 代码合入并默认关闭特性开关；开关打开路径有测试；关闭路径行为不变。
- 上游对应测试通过；产品新增测试覆盖失败/降级/旧 Host 场景。
- 文档与 spec 更新；显式 patch/例外有记录。
- 游戏插件冒烟通过；无新增核心文件副本；无凭据/端点进入日志。
- 回滚演练一次，确认开关关闭可恢复旧行为。

## 显式例外与暂缓项

- **CUA**：不作为主线前提；阶段 5 做机制对齐评估，决定恢复上游 in-process broker 还是保留 `kaying-computer-use-plugin` 并登记例外。
- **preinstalled-tools**：机制随阶段 5 上游化；LibreOffice/Python/Pandoc/Poppler/QPDF 的 bundle、签名、安装体积与 Windows shim 单独决策。
- **Windows 全量签名/NSIS 补丁**：产品发布流水线不同，继续显式例外。
- **design-runtime / browser-use 设计模式 / windows-runtime-host**：当前登记例外；若上游能力成为依赖再单独评估，不默认恢复。
- **永久删除增强（0025/purge）**：与产品删表决策冲突，不采纳；只采 `0026` 与 `messages(index)`。
- **上游文档/测试整批回流**：不整批；但被采纳机制的对应上游测试必须移植。

## 验收

- 根 `pnpm run typecheck`、`pnpm run lint`、`pnpm run source:check`、`pnpm run architecture:check --changed` 全部通过；CLI 变更额外跑 CLI 包内 typecheck/lint。
- **上游一致性**：协议/共享层生成物与上游 4.0.0 逐字段齐平或命中显式 patch；架构策略中产品模块与例外均有登记；核心机制不再出现第二套实现。
- 受影响模块执行现有测试；新增机制必须带上游同名测试（plugin-discovery、live-inventory、workspace-trust、mcp config/runtime、skill catalog、credential generation）。
- **网络层**：localrun 离线全流程（mock 登录/官方 MCP 鉴权/市场/配置/遥测）；配置 staging 端点后真实登录与拉取；mock 契约测试与失败降级。
- **游戏回归**：每个阶段结束跑 blender/taptap/game-playtest/computer-use 插件冒烟；阶段 5 跑完整 E2E。
- 交互改动验证桌面与手机 Web；协议改动同时验证 desktop continuous 与 mobile replayable 两条链路。
- 三平台验证：macOS/Windows/Linux 的插件发现、工作区信任、MCP 连接与市场安装；Windows 额外验证路径与 shim 相关用例。
- 发布前按 `kaying-code-preflight-v<版本>` 流程预验收；三套签名构建全部通过后再打正式标签。
- 全部阶段验收通过后才更新 `UPSTREAM_BASE.json` 到 `a4b44451`；中途保持 `fec97590` 基线并在提交说明记录剩余范围。

## 风险与工作量

- 机制风险：插件与 MCP 两条线共享 `live-config-watch`、`config-loader`、`skills/catalog`；阶段 2/3 必须按整体切换，不接受“先接一半”。
- 回归风险：产品专有 MCP/插件修复在上游重写文件中没有对应位置；按新原则应以显式 patch 承载，不再改整份实现。
- 兼容风险：`.kayingcode-plugin`、`KAYINGCODE_*` 别名、项目 `plugins.options` 失效、workspace 选项私有化、localrun 从“禁止远端”改为“默认 mock、可配远端”，都会影响现有用户配置与行为，需要迁移提示。
- 协议风险：产品协议副本缺少基线字段；阶段 0 未收口前不应开始阶段 2/3，否则会出现“新字段依赖旧字段缺失”的连锁失败。
- 范围风险：上游优先会扩大非游戏能力范围（voice-input、managed-worktree 等）；必须用阶段 5 的清单排期，不能阻塞游戏增强主线。
- 工作量：WBS 合计约 116 人日；3 名工程师并行约 16–20 周，另加三平台回归与发布 3–4 周。

## 外部依赖与断点

**硬断点：无。** 阶段 0、2、3 可以在外部依赖未确认时开工；以下依赖会影响阶段 1 的“真实端点”验收或后续范围。

| 类型 | 事项 | 影响 | 未确认时的默认处理 |
| --- | --- | --- | --- |
| 外部 | ZCode 官方账号/API 的访问许可、客户端配置与测试端点（staging） | 阶段 1 真实登录/配置拉取验收 | 先完成 mock + 契约测试；真实联调标记为待验收，不阻塞阶段 2/3 |
| 外部 | Cloudflare staging 账号、域名、DO 命名空间与部署权限 | Relay staging 环境 | 先用 `wrangler dev`/本地集成测试；staging 部署延后 |
| 产品 | 生产环境 Relay proxy 范围（默认只代理配置、市场元数据、MCP 用量；OAuth 与模型推理直连） | 阶段 1 路由实现 | 按建议默认执行，后续可放宽 |
| 产品 | 桌面/手机登录入口与账号 UI 的范围 | 阶段 1/4 前端工作量 | 先恢复上游 TUI/CLI 登录；桌面 UI 用最小入口，后续补齐 |
| 产品 | 游戏插件迁移节奏（默认：阶段 2 兼容、阶段 5 迁移） | 阶段 2/5 排期 | 按默认执行，游戏功能不为升级让路 |
| 产品 | Host/Relay/mobile 是否严格改为上游端口适配（默认：适配但保留现有行为） | 阶段 4 范围 | 先做兼容适配，不改用户可见行为 |
| 技术 | P0-2 生成管线 POC 是否可控 | 阶段 0 方案 | 3 天 go/no-go；失败则退回“受控 vendoring + 手工 patch”，仍以 parity 检查兜底 |
| 技术 | Relay mock 与本地 mock 的 fixture 是否完全同源 | 阶段 1 验收 | 共享 contracts/fixtures 目录 + 契约测试强制同源 |

## 待确认项

1. **协议/共享层管线**：是否采用“上游源文件 + 品牌映射 + 显式 patch”的生成方式（推荐），替代当前手工分叉副本。
2. **账号/API 直连范围**：官方端点/测试环境是否可申请；哪些能力必须真实直连。
3. **登录入口范围**：桌面/手机是否需要完整账号中心，还是先恢复 CLI/TUI 登录与设置页最小入口。
4. **上游非游戏能力清单**：preinstalled-tools、CUA、managed-worktree、voice-input、selection-comment、remote context-composition 的优先级与产品拒绝项。
5. **产品渠道范围**：Host/Relay/mobile 是否严格改为上游端口适配；若是，阶段 4 需要同步改造协议与重连语义。
6. **架构策略启用节奏**：候选已按“新增模块先 `managed: false`”生成并通过检查；是否按阶段逐模块启用，还是等 P2/P3 代码迁移完成后统一启用。

## 阶段 0 执行记录（2026-11-24）

分支：`feat/upstream-sync-4-0-0`（从 `origin/main` `a4efa81d` 创建）。

| 任务 | 状态 | 产出与结果 |
| --- | --- | --- |
| P0-1 协议/共享层盘点 | 完成 | `scripts/upstream-protocol-inventory.mjs` + [盘点报告](upstream-protocol-4-0-0-inventory.md)。242 个上游文件：132 parity、84 产品本地改动、26 缺失、3 产品独有；上游相对基线修改 30 个。 |
| P0-2 三方合并 POC | 完成（仅 POC） | `scripts/upstream-protocol-merge.mjs` + [合并报告](upstream-protocol-4-0-0-merge-report.md)、[决策清单](upstream-protocol-4-0-0-decisions.md)。245 个结果：132 parity、26 上游有产品缺失（需确认，含 CUA/permanent-deletion/plugin-host-queries 等边界项）、2 直接采用上游、70 自动合并、12 冲突、3 产品独有、0 无共同基线。输出仅写临时目录，未改运行时文件。 |
| P0-3 架构策略合并 | 完成（POC） | 上游策略盘点 + 合并脚本；候选 99 个模块（产品 32 + 新增 67），68 个上游模块 roots 缺失延后，14 个同 ID 产品优先；新增模块默认 `managed: false`，候选策略 `architecture-check` 0 violations；`--manage-added` 可生成启用版。 |
| P0-4 contracts zod4 | 完成 | `@zcode/contracts` 升 zod `4.6.5`，删除 `zod-to-json-schema`；`toToolJsonSchema` 改用 `z.toJSONSchema`；修 10 处 `z.record` 双参签名与 `ZodEffects` → `ZodPreprocess`；`ToolSearch`/`DeferredToolCall` 统一走新生成器。 |
| P0-5 CI parity 门禁 | 完成 | `scripts/check-upstream-parity.mjs` + expected 基线（242/132/84/26/3）；PR source checks 增加 contracts schema test；新增每周 `Upstream parity` workflow，fetch upstream main 与 3.18.2 base 后检查。 |

12 个冲突文件（需人工决策，全部有共同基线；逐文件决策见[决策清单](upstream-protocol-4-0-0-decisions.md)）：

- `kayingcode-protocol-v4/conversation-telemetry-facts.ts`（defer-P4）
- `kayingcode-protocol-v4/product-projection.ts`（defer-P4）
- `kayingcode-protocol-v4/v4-gateway.ts`（defer-P4）
- `kayingcode-protocol/plugins.ts`（merge-now，依赖 P2 trust）
- `kayingcode-protocol/server-operations.ts`（部分 merge-now）
- `kayingcode-protocol/server.ts`（部分 merge-now）
- `kayingcode-protocol/session-data/index.ts`（override-product）
- `kayingcode-protocol/subagent-session-query.ts`（defer-P4）
- `kayingcode-protocol/v4-bridge.ts`（defer-P4）
- `kayingcode-protocol-v4/session-data/contract.ts`（override-product）
- `kayingcode-protocol-v4/transport.ts`（defer-P4）
- `kayingcode-protocol/index.ts`（merge-now）

P0-2 期间修正了品牌映射：产品保留上游 `@zcode/*` workspace 作用域，映射现在对包说明符整体占位，避免把 `@zcode/shared`、`@zcode/zcode-cua` 误改成 `@kayingcode/*`；修正后 parity 从 68 提升到 132，冲突从 13 降到 12。

验证：

- `node --test scripts/upstream-protocol-inventory.test.mjs scripts/upstream-protocol-merge.test.mjs`：8/8 通过。
- `node --test scripts/upstream-architecture-policy-merge.test.mjs`：3/3 通过。
- 候选架构策略 `architecture-check --policy scripts/spec/upstream-architecture-policy-4-0-0.candidate.yaml`：0 violations。
- `node scripts/check-upstream-parity.mjs`：通过（242/132/84/26/3）。
- `pnpm --filter @zcode/contracts test`：3/3 通过（新增包内 vitest 配置）。
- `.github/workflows/source-checks.yml` 增加 contracts schema 门禁；新增 `.github/workflows/upstream-parity.yml` 周检；两个 workflow YAML 解析通过。
- contracts 定向测试：`tool-json-schema.test.ts` 3/3 通过；zod4 语义变化已确认（带 default 且非 optional 的字段进入 `required`；`Edit.replace_all` 调整为上游 `.default().optional()` 顺序）。
- `pnpm --filter @zcode/contracts run typecheck`：通过。
- CLI 依赖包 typecheck：`@zcode/adapters`、`@zcode/core`、`@zcode/bootstrap`、`@zcode/cli` 全部通过。
- `pnpm install --frozen-lockfile --lockfile-only`：通过；锁文件仅 contracts importer 变动。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：0 errors / 133 既有 warnings；contracts 包内 `oxlint src` 当前基线报 “No files found”（非本次改动引入）。
- `pnpm run source:check`：通过（64 packages）。
- `pnpm run architecture:check --changed`：0 violations。
- 未执行：运行时协议切换、桌面/CLI 启动、真实上游端点联调。

## 阶段 1 执行记录（2026-11-24）

阶段 1 的账号/API 机制与 CLI 入口已完成；桌面登录 UI 与真实端点联调单独排期。

### 1a API / mock / Relay

- `apps/kayingcode-relay-cloudflare/src/clientApi.ts`：`/api/v1/client/configs`、`/scenes` 支持 `KAYINGCODE_API_MODE=mock|proxy`，未配置模式 404，不写 Durable Object、不转发凭据头。
- `apps/kayingcode-relay-cloudflare/src/oauthApi.ts`：`/api/v1/oauth/cli/init`、`/api/v1/oauth/cli/poll/:flowId`、`/api/v1/oauth/profile` 的 mock 模式；OAuth 不允许 proxy，避免 Relay 看到真实授权码/token。
- `KAYINGCODE_API_UPSTREAM_ORIGIN` 只接受无路径/query 的 https origin；proxy 只转发两个固定 client 路径。

### 1b 账号 / OAuth / 凭据

- shared：补齐 upstream OAuth 类型（`ZAI_CN_PROVIDER_ID`、`OAuthAccountAvailability`、`OAuthWebsiteSession`、session revision、linked BigModel）、credential generation/file-guard 原语、`writeCredentialRecordLocked`、`readAssignedCredentialsFile`。
- services：`oauthService` 从 localrun stub 替换为上游真实实现（providers、repo、callback attribution、profile schema、unauthorized request、runtime config）；`credentialService` 对齐上游锁内代次、批量读取/写入、损坏恢复与自动重置。
- adapters：补齐 `cli-oauth`、`coding-plan-api-key`、`shared-credentials` 及 CLI OAuth 导出。
- bootstrap：恢复 `auth-login*`（登录/登出、CLI OAuth polling、编码计划材料解析），并从公共入口导出 `loginKayingCodeCli` / `logoutKayingCodeCli` / `loginBigmodelCodingPlan`。
- CLI：恢复 `login` / `logout` 命令与 `tui-auth`；`RunDependencies` 增加登录注入点；`login` 不再输出“无账号系统”。

### 验证

- `pnpm run typecheck`：通过。
- `@zcode/services`、`@zcode/bootstrap`、`@zcode/cli`、`@zcode/adapters` 定向 typecheck：全部通过。
- shared credential generation 测试 **5/5**；services credential v2 测试 **2/2**；relay 测试 **18 passed / 2 skipped**（含 client mock/proxy 与 OAuth mock）。
- `pnpm run lint`：0 errors / 133 既有 warnings。
- `pnpm run architecture:check --changed`：0 violations。
- `upstream:parity`：OK（242/132/84/26/3）。

### 未纳入本轮

- 桌面/UI 登录入口：上游 `WelcomeScreen` 730 行 + `useOAuth`/credential recovery 组件，产品当前 WelcomeScreen 仅 162 行且为 API Key 登录；需要单独 UI 批次，不在本轮强行替换。
- 真实端点登录、token 刷新与 staging 部署：需要官方测试端点与 Cloudflare staging 权限；代码与 mock 已就绪，联调标记为待外部条件。
- TUI `/login` 交互接线：CLI `login/logout` 已可用，TUI 面板入口留到 UI 批次。

## 阶段 2 执行记录（2026-11-24，进行中）

已完成插件体系第一批：manifest 统一解析 + 单插件加载隔离。

- 新增 `apps/zcode-cli/packages/adapters/src/plugins/discovery/`（上游 CONTRACT/contract/index/module），统一 `parsePluginManifest` 与 `userConfig` 已知字段 strip。
- 产品 loader 的 `readManifest` 改用统一解析；保留 `.zcode-plugin` → `.kayingcode-plugin` → `.claude-plugin` → `.codex-plugin` 回退顺序。
- 单插件组件准备改为 try/catch：失败只产生 `plugin_load_failed` 诊断并跳过该插件，已准备的 MCP/hook/skill/command 不再泄漏进会话。
- 新增 `plugin-load-isolation.test.ts`：坏插件的 MCP server 不进入结果，good 插件仍加载。
- 补齐共享/适配层基础设施：`shared/plugin-discovery`、`plugin-store-visibility`、protocol v4 `pluginInstall`、`adapters/watch`、`plugins/live-inventory`、`plugins/workspace-plugin-declaration`、`config/plugin-secrets.adapter`、`bootstrap/plugin-secrets`、`bootstrap/workspace-plugin-trust`。
- plugin-secrets 已接入 configure/reset/uninstall：敏感/workspace 选项写私有文件；项目 `plugins.options` 不再参与合并；reset/uninstall 清理私密值。
- 验证：adapters/contracts/bootstrap typecheck 通过；plugin load isolation **1/1**；根 typecheck、lint、architecture 通过。

### 阶段 2 第二批：异步发现与 workspace trust（2026-11-24）

目标：把插件发现切到上游 4.0.0 的异步 material-cache 唯一路径，并让项目 `plugins.dirs` 的声明摘要与用户域信任记录在启动/会话入口生效。

状态所有者与事件顺序：

```text
createConfig
  → withPluginSecrets(私有文件只读叠加)
  → resolveWorkspacePluginDiscovery(候选 + 声明摘要 + 信任记录)
  → discoverNodePlugins(material cache 读取清单/组件)
      ├─ pending: 只投影 metadata + workspaceTrust，enabled=false，不解析 Hook/MCP/Skill/Command
      └─ trusted: 按 config enabled 解析组件
  → material.validate() 失败 → 按 scope 重建，最多 3 次
  → 协议投影 / 启动会话
```

- **信任 owner**：`bootstrap/src/workspace-plugin-trust/index.ts` 的用户域存储是唯一写入方；adapter 只读 `PluginDiscoverRequest.workspacePlugins`，不写信任记录。
- **material scope**：`resolve(workingDirectory)` + `workspaceIdentity || workingDirectory` + `remoteSessionId` + `storageRoot`；作用于同一批材料上计算声明摘要，指纹变化整批重建，避免半更新状态。
- **待信任停用**：pending 插件不产出 MCP/Hook/Skill/Command；信任或声明变化后由下一次发现重新投影。
- **私密选项**：发现前叠加私有文件；项目 `plugins.options` 不参与合并；写入只走 `savePluginOptions`/`removeStoredPluginSecrets`。
- **协议/UI**：新增 `plugins/workspaceTrust` 操作，插件列表投影 `workspaceTrust`；桌面/手机仅在 workspace scope 展示 pending 标记与“信任”按钮。
- **产品边界保留**：localrun 仍只接受本地 marketplace 源；`.zcode-plugin` 优先、`.kayingcode-plugin` 回退；游戏插件 listing、UI contributions、`kayingcode-plugins-official` 磁盘 id 与 KAYINGCODE_* 运行时 env 不变。

验收：pending 目录插件启动时强制停用、信任后恢复组件；声明摘要变化重新 pending；私密选项参与发现且不落入项目配置；非本地 marketplace 源仍被拒绝；`pnpm run typecheck`、`lint`、定向测试与 `architecture:check --changed` 通过。规格见 [workspace-plugin-dir-trust.md](../../apps/zcode-cli/packages/adapters/docs/workspace-plugin-dir-trust.md)。

执行结果（2026-11-24）：

- 适配层：`plugins/helpers.ts`、`plugin-components.ts`、`hook-sources.ts`、`types.ts`、`atomic-directory.ts`、`markdown-frontmatter.ts`、`skills/scan.ts` 采用上游异步实现；`mcp.ts`、`official-marketplace.ts`、`marketplace.ts`、`plugins/index.ts` 保留产品补丁（双品牌 env、`kayingcode_official`、localrun 本地源、游戏 listing、UI contributions、`.kayingcode-plugin` 回退）。
- bootstrap：`resolveKayingCodePlugins`/`getKayingCodePluginsOverview`/`listKayingCodePlugins` 异步化并接入 `withPluginSecrets` + `resolveWorkspacePluginDiscovery`；`startup-marks`、`plugin-facade` 与协议调用方传递 workspace identity/remote session。
- 配置：项目 `plugins.dirs` 改为 `ProjectConfigFile.pluginDirCandidates`，只进 `sources.plugins.dirs.workspace`，不进入可执行 config；私密选项按 `optionLayers` 叠加。
- 协议/UI：新增 `plugins/workspaceTrust` 协议、`KayingCodePluginInfo.workspaceTrust`、服务方法 `setWorkspacePluginTrust`；插件商店卡片/详情页展示待信任标记与信任按钮，pending 时锁定启停与试用入口。
- 验证：`pnpm --filter @zcode/adapters typecheck`、`pnpm --filter @zcode/bootstrap typecheck`、根 `pnpm run typecheck`、`pnpm run lint`（0 errors / 133 既有 warnings）、`pnpm run source:check`、`pnpm run architecture:check --changed`（0 violations）通过；adapters 插件测试 9/9（含新增 trust 用例），bootstrap 新增 trust/私密选项用例 1/1。
- 已知基线失败：`bootstrap/tests/workspace-mcp-trust.test.ts` 3 项与产品「workspace MCP 开箱即用」边界冲突，测试文件本轮未修改；剩余 28 项通过。未执行桌面/CLI 真实启动与远程 Host 联调。

待完成（阶段 2 未完成）：
- live inventory 尚未接入 MCP/Skill 配置加载；marketplace `regions` 与商店 UI 未迁移。
- 内置插件清单/版本与 `config/official-plugins.json` 尚未按上游 definition 重新生成。

### 阶段 2 第三批：Skill 实时目录（2026-11-24）

目标：启用上游 `skills/catalog` 的进程级实时目录，让已打开会话在项目/用户配置、启用插件与 skill 文件变化后读到同一份快照，不再依赖会话启动时的一次性扫描。

- **所有权**：`adapters/src/skills/catalog.ts` 持有进程级共享条目与 watcher；`SkillCatalogSourceRegistry` 由宿主按需注入，未注入时每个 App 建私有目录。App 只持有 view，`closeSkillCatalog` 释放引用。
- **读取路径**：`createAppSkillPort` 用 `discoverWorkspaceHookConfigPathsAsync` 收集项目/用户配置路径，和 MCP 配置源同一组提交点；`live-inventory` 每次重读配置与已启用插件，`watched-source` 去抖后整批重建快照。
- **插件边界**：只使用官方插件根与 `workspaceTrust === "trusted"` 的项目插件；插件 skill 根按上游扫描规则不跟随符号链接。`visualize` 等未提供内联宿主的插件通过 `excludedPluginIds` 排除。
- **产品保留**：`.zcode-plugin` 优先、`.kayingcode-plugin` 回退；产品 home 目录为 `~/.kayingcode`；动态工作流关闭时继续禁用内置 dynamic-workflows 技能。
- **验收**：项目/用户配置新增或修改 skill 根后，已打开会话的 `discoverSkills` 快照更新；禁用 skill 路径立即消失；插件启停后其 skill 出现/消失；`loadSkill` 未命中时 flush 后重读；App 关闭释放 watcher。

执行结果（2026-11-24）：

- 适配层：`skills/index.ts`、`roots.ts`、`skills/catalog.ts` 采用上游实现，`findWorktreeRoot`/`scanSkillRoot`/`readSkillContent`/`matchesSkillRequest` 随之上移；保留 `.zcode-plugin` 优先、`.kayingcode-plugin` 回退与 `~/.kayingcode` home。
- 公共契约：`packages/shared` 导出 `discoverWorkspaceHookConfigPathsAsync`（支持 `includeMissing`），`@zcode/contracts` 新增 `SkillNotFoundError`；adapters 新增 `./skills/catalog` 包入口。
- bootstrap：新增 `app/dynamic-skill-catalog.ts`，`create-app` 在注入 `skillPort` 之外构建实时目录并把 `closeSkillCatalog` 交给 session facade 释放；`KayingCodeAppOptions` 支持宿主注入 `skillCatalogSourceRegistry`。
- 测试：新增 `adapters/tests/skill-catalog.test.ts`，覆盖初始快照、项目 skill 禁用、插件启停、`loadSkill` 与 unknown skill、bundled 根；adapters 插件/实时目录测试合计 11/11。
- 验证：根 `pnpm run typecheck`、`pnpm run lint`（0 errors / 133 既有 warnings）、`pnpm run architecture:check --changed`（0 violations）、`pnpm run source:check` 通过；`SOURCE_PACKAGES.md` 已重新生成。
- 未执行：真实 CLI/TUI 文件监听冒烟与远程 Host 联调。

待完成（阶段 2 未完成，更新）：
- MCP 配置源已落地启动快照；打开会话的实时 reconcile 仍待阶段 3 接入 core `mcp/runtime`。
- marketplace `regions` 与商店 UI 未迁移。
- 内置插件清单/版本与 `config/official-plugins.json` 尚未按上游 definition 重新生成。

### 阶段 3 前置：MCP 配置源（2026-11-24）

目标：先落地上游 MCP 配置加载/监听层，让启动快照与后续实时 reconcile 共用同一份配置事实，不再维护启动期的临时合并逻辑。

- **适配层**：新增 `adapters/mcp/config-loader.ts`、`config-source.ts`。加载器每次重读项目/用户配置、启用插件、插件私有选项与 `.agents/mcp.json` 回退；配置源用 `watched-source` 去抖、引用计数 view 与 `prepare` 按会话整形。
- **契约**：`@zcode/contracts` 新增 `mcpConfigKey`、`McpConfigurationSnapshot`、`McpConfigurationSource`；adapters `./mcp` 入口导出 loader/source/registry。
- **Bootstrap**：新增 `app/dynamic-mcp-config.ts`，`create-app` 在构造 MCP port 前获取配置源快照，覆盖原 `pluginMcpServers + config + builtIn` 合并；`session-facade` 新增 `closeMcpConfigSource` 释放 watcher。宿主可通过 `mcpConfigSourceRegistry` 注入进程级共享源。
- **保留产品边界**：项目配置仍经 `normalizeProjectMcpServer`；CUA 退役 server 清理、built-in node_repl 与 broker 注入保持原行为；`.kayingcode/config.json` 与 `.agents/mcp.json` 作为产品 fallback 路径。
- **未完成**：core `AgentRuntime` 尚未消费 `McpConfigurationSource.subscribe`；打开会话在配置变化后仍不会自动 reconcile，属于阶段 3。

验收：MCP 配置源在配置/插件/私有选项变化时发布新快照；启动快照与用户/项目/插件来源标记正确；`pnpm run typecheck`、`lint`、定向测试与 `architecture:check --changed` 通过。

执行结果（2026-11-24）：

- `adapters/mcp/config-loader.ts`、`config-source.ts` 采用上游实现；`config/project-config.adapter.ts` 导出 `normalizeProjectMcpServer` 供加载器复用。
- `bootstrap/src/mcp-config.ts` 新增 `resolveEffectiveMcpConfiguration`；`app/dynamic-mcp-config.ts` 按项目/用户配置、插件根、显式 servers、built-in servers 与 broker 构造 `prepare`。
- `create-app` 在 MCP port 创建前获取快照并覆盖 `configuredMcpServers`/`runtimeConfig.mcp`；启动失败与 session 关闭都会释放配置源。
- 测试：新增 `adapters/tests/mcp-config-source.test.ts`（用户/项目/插件来源标记、配置变化发布新快照）；adapters 定向套件 13/13。
- 验证：adapters/bootstrap/根 `typecheck`、`pnpm run lint`（0 errors / 133 既有 warnings）、`architecture:check --changed`（0 violations）、`source:check` 通过。
- 已知基线：`bootstrap/tests/workspace-mcp-trust.test.ts` 仍为 27 通过 / 3 失败（上游测试与产品「workspace MCP 开箱即用」边界冲突，测试文件未修改）。

### 阶段 3 第一批：MCP 工具内存快照（2026-11-24）

- 契约：新增 `McpServerToolSnapshot`（status + 可选 tools/toolsVersion），`McpPort.getToolSnapshot?()` 为可选方法，兼容现有 mock port。
- 适配器：`NodeMcpAdapter` 在首次 `tools/list` 与 list_changed 刷新成功后生成版本号；快照只读内存、不等待连接、不触发列表。连接恢复期间沿用旧 descriptor 与版本。
- 连接池：按 leased server 聚合各 adapter 快照，版本号拼上 `mcpConnectionId`，避免同名 server 换代后版本撞号。
- 测试：新增 `adapters/tests/mcp-tool-snapshot.test.ts`（连接后快照、确认空列表与未列出的区分）。
- 未完成：core `AgentRuntime` 尚未调用 `getToolSnapshot` / 订阅配置源；阶段 3 的 session reconcile 仍待实现。

### 阶段 3 第二批：AgentRuntime 实时 MCP reconcile（2026-11-24）

- `AgentRuntimeDeps` 新增 `mcpConfigurationSource`；构造时订阅，`beginShutdown` 退订并递增 generation。
- 配置变化时 `reconcileMcpConfiguration`：更新 `config.mcp` → `connectConfiguredServers` 重连/断开 → 强制刷新并重注册工具（签名不变则不重注册）；迟到结果按 generation 丢弃。
- 前置修复 core 既有 zod4 迁移遗留：`ZodError.errors` → `issues`，`Edit.replace_all` 可选按 `false` 处理，core 恢复可构建。
- 测试：新增 `core/tests/mcp-configuration-reconcile.test.ts`（配置源发布后按新 server map 重连）。
- 仍待完成：上游 `mcp/runtime/session` 的可用性分类与执行准入、`McpToolCatalogPort`、`WaitForMcpServers`、pool 租约化与 transport 错误收敛。

### 阶段 3 第三批：MCP 工具目录与 WaitForMcpServers（2026-11-24）

- 契约：新增 `McpToolCatalogPort/Publication/Scope/LookupResult`、`McpToolDefinition`、`McpWaitForServerOptions`、`WaitForMcpServers` 输入/输出 schema；`McpPort.getToolSnapshot()` 转为必需，`waitForServer?` / `onSnapshotChanged?` 可选。
- 适配器：新增 `tool-catalog-cache.ts`（LRU + TTL + 字节上限 + 配置 key）与 `transport-errors.ts`；`callTool` 的重连条件扩展为 Streamable HTTP 会话过期/连接关闭 + 既有 `Not connected`；adapter 在连接/断开/列表刷新时通知快照监听，`waitForServer` 复用已有启动 Promise；pool 透传快照、监听与等待，并在版本号上拼连接 id。
- Core：新增 `core/src/mcp/runtime`（contract/session/CONTRACT）提供可用性分类、不可用原因与 session view；`WaitForMcpServers` 工具按 MCP 端口门注册，端口只等 pending、不发起连接/授权。
- Runtime：`mcpToolCatalogPort` 接入构造；初始化时合并 catalog-only 工具，配置 reconcile 时按新 server 集合重新 prepare 并发布快照。
- Bootstrap：缺省创建进程内 `createInMemoryMcpToolCatalog`，宿主可注入共享目录。
- 测试：`mcp-tool-catalog.test.ts`、`mcp-server-wait.test.ts`、`mcp-wait-tool-registration.test.ts`、`mcp-configuration-reconcile.test.ts`、`mcp-tool-snapshot.test.ts`。
- 验证：core/adapters/bootstrap typecheck、根 `typecheck`、`lint`（0 errors / 133 既有 warnings）、`architecture:check --changed`（0 violations）、`source:check` 通过；bootstrap `workspace-mcp-trust` 仍为 27 通过 / 3 既有失败。

### 阶段 4 第一批：存储迁移、ReadTopicResource、browser-state（2026-11-24）

- 存储：补齐 `0025_session_permanent_deletion`（session_purge/session_runtime_presence、删除期触发器，artifacts 使用 `kayingcode-artifact://`）与 `0026_dwf_run_parent_session_index`。
- Core：新增 `ReadTopicResource` 工具与 `tool/topic-resource` 契约/reader；仅在注入 `topicResourcePort` 时注册，授权从当前会话可信输入意图读取。
- Browser：恢复 Playwright storage state（`adapters/browser/storage-state.ts`、browser runtime `storageStatePath`），CLI 新增 `--browser-state` / `--no-browser-state`，默认路径为 `~/.kayingcode/cli/browser-state.json`。
- CLI：修复插件命令对异步 bootstrap API 的缺失 `await`（list/overview/install/disable-all）。
- 测试：`session-migrations.test.ts`、`browser-storage-state.test.ts`、`topic-resource-tool-registration.test.ts`。
- 验证：adapters/core/cli/bootstrap/根 typecheck、`lint`、`architecture:check --changed`、`source:check` 通过。

### 阶段 4 第二批：输入抢占与 Agent always-background（2026-11-24）

- 契约：新增 `InputPreemptionAbortReason`/`createInputPreemptionAbortReason`/`isInputPreemptionAbortReason`、`InputPreemptionControl`/`InputPreemptionHandling`；`SubagentRunOptions.inputPreemption` 与 `SubagentLaunchRequest.alwaysBackground`。
- Executor：每次工具调用创建 `InputPreemptionSlot`；立即发送抢占到达时，工具注册的判断为 wait 则不取消，等 handler 返回。
- Subagent：前台等待期间可被认领转后台；task abort 控制器在抢占 + wait 时不取消 child；Agent 工具透传 `inputPreemption`。
- Agent 工具：支持 `alwaysBackground`（缺省 true）；描述、handler 与 `subagents.alwaysBackground` 配置一致；runtime 统一经 `resolveRuntimeAgentAlwaysBackground` 取值。
- 测试：`input-preemption-slot.test.ts`（默认 cancel、wait 等待、无接管取消、abort reason 判别）。
- Windows `cmd.exe` 只读判定：恢复 `tool/cmd-readonly` 契约与 `bash-cmd-readonly-policy`；前台 Bash 在 `cmd`/Windows `legacy-shell` 下改按 CMD 语法判定；Memory executor 同样按实际 shell 选择分流。
- CLI `--agent-always-background <on|off>`：仅 `--prompt`/`--target`/TUI 可用（默认 off）；透传到 App runtimeConfig `subagents.alwaysBackground`，与 Agent 工具描述/handler 门一致。
- 测试：移植上游 `bash-cmd-readonly-policy.test.ts`（126 例）与 `cmd-readonly/contract.test.ts`。

### 阶段 4 第三批：项目 Token 传输错误与额度提醒开关（2026-11-25）

- `packages/shared/src/project-access-token.ts`：恢复 `PROJECT_TOKEN_NETWORK_ERROR_CODE`/`PROJECT_TOKEN_TIMEOUT_CODE` 与 `isProjectTokenTransportFailureCode`；`ProjectAccessTokenCache.resolve` 的 `issue` 回调新增 `hasValidFallback()`，由缓存 owner 按当前有效期实时判断，不冻结请求开始时的布尔值。
- `project-access-token-client.ts`：首签临时失败（network/timeout/429/5xx）在同一 pending 内重试一次；429 按 `Retry-After`（上限 1s）退避；已有可用 PAT 时直接降级，不多等一轮超时。品牌字段保持 `kayingcode`/`KAYINGCODE_VERSION`。
- 协议：新增 `KAYINGCODE_PROVIDER_PROJECT_TOKEN_NETWORK_ERROR = -32033`；Host 账号鉴权路径把两个传输故障码改用该 RPC 错误应答，Agent 才能并入 `network_error` 重试预算。
- 适配层：`RuntimeHeadersRefreshError` 区分 `configNetwork` 与项目 Token 传输失败，两者都可重试；失败分类只在配置读取失败时使用 `ModelRequestVerificationConfigNetwork`，项目 Token 传输失败按普通网络错误展示。旧 `headersApplied:false` 形态与其它失败码仍不可重试。
- `totalTokensReminder` 开关：`AgentRuntimeConfig.totalTokensReminder`、`ContextBuilderConfig`/子代理 builder 同一来源；关闭时主/子代理 system 不再追加固定预算行，工具批次/用户输入的倒数附件也不产生。
- CLI：新增 `--total-tokens-reminder <on|off>`（默认 off，仅 `--prompt`/`--target`/TUI），透传 runtimeConfig；帮助文案同步 en-US/zh-CN。
- 测试：`packages/shared/test/projectAccessTokenCache.test.ts`、`adapters/tests/runtime-headers-retry.test.ts`、`core/tests/total-tokens-budget.test.ts` 开关用例；既有上下文顺序/工具批次用例显式开启提醒。
- 验证：shared/adapters/core/cli typecheck、上述定向测试、根 `pnpm run typecheck`、`pnpm run lint`、`pnpm run architecture:check --changed`、`pnpm run source:check`。

### 阶段 4 第四批：回复语言（session/readReplyLanguage）（2026-11-25）

- 协议：新增 `session/readReplyLanguage` 方法、`kayingcodeSessionReadReplyLanguageParamsSchema` 与 result schema（`language: replyLanguageSchema.nullable()`），超时 2s；`replyLanguageSchema` 复用 `validationAppSettings`（trim、1–256 字符）。
- Core：`AgentRuntimeDeps.readReplyLanguage` 只给主线程注入；输入附件收集时与当前环境并行读取，值变化才追加 `language` 公告，`null` 在已有公告后发一次清除公告，读取失败只记 debug 并跳过本次（不当作清除）。`language` 进入 persisting system reminder source，compaction 后按最近一次公告重述，最近一次是清除公告时不重述。语言正文对 `& < >`、控制字符与 U+2028/2029 转义，避免破坏 `<system-reminder>`。
- Bootstrap：`KayingCodeAppOptions.readReplyLanguage` 贯穿主 runtime 与嵌套 app；`createWorkspaceKayingCodeApp` 缺省创建反向 RPC reader，Host 未实现该方法时按读取失败处理，本轮不影响既有会话。
- Host/services：`CreateKayingCodeAgentServiceOptions.resolveReplyLanguage` 同步只读应答；`createLocalServices` 透传到 Agent service。
- Desktop：`AppSettings.replyLanguage`（空串哨兵，`normalizeSettingsPatch` 归一成删除）；Main 在 bootstrap 读入内存，设置 patch 后向所有窗口 Host 推送 `reply-language-changed`，InitLocal 携带初值；Host 同步持有并注入 `resolveReplyLanguage`；设置页“界面语言”卡片新增回复语言输入（保存/清空、Enter 提交，en-US/zh-CN 文案）。
- 测试：`core/tests/runtime-context-announcements.test.ts` 新增 6 例（变更公告/顺序、转义、失败跳过、清除一次、子代理不读、compact 重述）；`services/test/normalizeSettingsPatch.test.ts` 覆盖空串删除与 trim。
- 验证：core/bootstrap/根 typecheck、core 定向测试 53 例、services 定向测试、lint（0 errors）、architecture/source 检查通过。

待完成（阶段 4 未完成，更新）：
- turn/loop 状态与请求构建（`normalInputPreparationPending`、`pluginReferenceInput`、`McpSessionView` 回合准备、执行期 `resolveLiveDescriptor`）、executor 剩余新端口、子代理冷恢复/compact 策略。
- lifecycle hooks 上下文、`createConfigWithPluginMigrations`、`pluginDiscoveryUi` 增量公告、批量删除预检、活动摘要。
- Runtime prefs 的 `totalTokensReminderEnabled`/`agentAlwaysBackgroundEnabled` 回包与设置页；plugin host 进程名；回复语言设置仅 Desktop 本机 Host 生效，远端/Web Host 仍回答 null。
- marketplace `regions`/商店 UI；官方插件清单重生成。

待完成（阶段 3 未完成）：
- 完整 `McpSessionView` 接入：执行期按 `classifyServer` 做工具准入/撤销、`resolve` 等待与 MCP App 打开语义仍沿用产品现有路径。
- `WaitForMcpServers` 之外的 `ToolSearch` 关闭时连接中公告与 `runModelTextRequest` 集成。
- HTTP transport 重试/401 step-up：会话过期与连接关闭已接入 `isRetryableCallError`，401 step-up 仍沿用既有授权恢复路径。
- pool 租约化与 transport 错误收敛的上游完整形态；marketplace `regions`/商店 UI；官方插件清单重生成。

### 阶段 5 第一批：游戏插件兼容验收（2026-11-24）

- 新增 `adapters/tests/game-plugins-upstream-loader.test.ts`：用上游 loader 发现 blender、kaying-for-taptap、kaying-game-playtest、computer-use 四个内置游戏插件，验证 `source=official`、启用、skill 根与 MCP servers 均正常。
- 游戏插件仍使用 `.zcode-plugin` manifest；新 loader 的 `.zcode-plugin` 优先/`.kayingcode-plugin` 回退、workspace trust、plugin-secrets 与 MCP 解析均已覆盖。
- 未执行：游戏插件全链路 E2E（真实 Blender/TapTap/Playtest 运行时）、CUA 对齐评估、非游戏上游能力（preinstalled-tools/managed-worktree/voice-input/selection-comment/composer-edit-mode/settings-search/remote context-composition）。
- 旧 loader 兼容分支仍保留在游戏插件/产品装配中；确认新路径稳定后再删除。

## 验证记录

- 2026-11-24：完成 4.0.0 差异评估与目标修订。基于 `upstream/main a4b44451` 与产品 `main a4efa81d` 的源码 diff、协议/插件/MCP/CLI 四路分析；未执行编译、测试或运行时验证。
- 2026-11-24：按“游戏场景优先、其余上游优先、账号/API 保留机制 + 网络 mock、现有机制向新架构迁移”的目标重写升级路径；尚未开始实施。
- 各阶段完成后在此追加实际执行结果、失败项与环境限制。
