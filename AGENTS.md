## 项目定位与功能取舍

KayingCode 以 ZCode harness 为载体，全面接入游戏开发场景，面向多游戏引擎、多平台，打造从开发、运行预览到测试验证的游戏开发 harness。KayingCode 的核心增量是面向游戏开发的场景化改造，而非另建一套通用 Agent 底座。

- 默认保留和复用上游已有功能、交互、协议与运行逻辑；不能仅因某能力不是游戏专用而删减。
- 游戏场景优先通过插件、MCP、Skills、引擎适配与现有公开接口扩展，复用上游会话、工具、权限、工作区与远程连接机制，避免平行实现。
- 扩展与取舍优先判断：是否改善游戏开发闭环，是否适配多引擎与多平台，是否保持上游能力和接口的可持续兼容。将长期产品方向与当前已实现、已验收能力分别说明。
- 确需偏离或排除上游行为时，在所属 spec 记录具体原因、影响范围及验证依据；已明确的产品边界、安全约束和平台可用性仍须遵守，不因“保留上游”而未经评估恢复不适用模块。
- 对外介绍以当前首次发布形态组织，不以旧 KayingCode 实现的移除、替代或迁移作为产品说明。用户流程用游戏开发和连接操作表达，内部身份与凭据机制放在技术说明中。

## 核心原则

- 新增或修改行为前，先在所属应用或包内更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。根 `docs/` 仅存放部署文档。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 分支命名与流向

- `main` 只作为 ZCode 上游镜像，与 `upstream/main` 保持纯源码、只快进；禁止把产品提交合回 main。
- `kaying-code-dev` 是默认开发与集成主线；新任务从同步后的 dev 创建 `kaying-code-feature-<主题>`（主题使用小写英文与连字符），不再新增 `m3/*`、`migration/*` 或 `codex/*` 开发分支。
- `kaying-code-release` 是发布准备与稳定线；经过验收的提交才进入正常发布流程。首次初始化的快照仍待验收，分支名不等于发布证明。
- 紧急修复从 release 创建 `kaying-code-hotfix-<主题>`，修复后回合 release 与 dev，避免后续发布丢失修复。
- 上游更新先快进 main，再从 dev 建 `kaying-code-feature-upstream-<版本>` 分模块采纳；保留本地产品边界，验收后才更新 `UPSTREAM_BASE.json`。
- `origin` 为当前产品仓库，`upstream` 为 ZCode，`legacy` 为旧产品仓库。开工先运行新鲜度检查，开发基线为 `origin/kaying-code-dev`；不要再按 `origin/main` 判断产品开发是否过期。main/release 不追赶 dev。
- 合并后清理 feature；清理历史过程分支前，核对无独有提交并先推送归档 tag。禁止删除仍被其他 worktree 使用或含未合并提交的分支；不批量清理其他 remote 所属仓库。
- 产品版本标签用 `kaying-code-v<版本>`，根 `pnpm run release` 仅在 release 执行；CI edge 监听 dev，产品标签验证 release 祖先关系。

### 官方上游与更新

- 官方更新源为 [zai-org/ZCode](https://github.com/zai-org/ZCode)，`upstream` 应配置为 `https://github.com/zai-org/ZCode.git`；`kayingai/ZCode` 等派生仓库不作为官方更新源。远端配置只存在于本地 clone，具体设置与同步命令见 [README 的上游同步说明](README.md#上游连接与更新)。
- 镜像更新与产品采纳分开执行：先 fetch 官方更新，检查提交关系，只快进 main 并显式推送 `origin/main`；不能快进时先调查，不使用强推、reset 或无关历史合并绕过检查。不得向 upstream 推送产品提交或发布标签。
- 从同步后的 dev 创建 `kaying-code-feature-upstream-<版本>`，比较 `UPSTREAM_BASE.json.commit` 到 `upstream/main` 的变化，先更新所属模块 spec，再按模块适配，记录采纳、保留的产品差异与未完成项，运行对应验证后合入 dev。避免未经评估整体合并上游或覆盖品牌、配置和平台边界。
- `UPSTREAM_BASE.json` 表示已审阅并验收的采纳基线；仅 fetch 或更新 main 不改它。部分采纳保留旧基线并记录进度；本轮差异全部完成审阅、采纳或明确排除并验收后，再将 repo、commit、version 与 syncedAt 更新为对应官方基线。历史记录不因修改 remote 地址而改写；KayingCode 产品版本仍独立管理。

## 命令与仓库结构

开工前运行 `node scripts/check-workspace-freshness.mjs` 检查基线。Node 版本以 `mise.toml` 为准。

以下命令从仓库根目录执行：

| 用途             | 命令                                                |
| ---------------- | --------------------------------------------------- |
| 类型检查         | `pnpm run typecheck`                                |
| Lint             | `pnpm run lint` / `pnpm run lint:fix`               |
| 格式检查         | `pnpm run fmt:check`                                |
| 桌面开发         | `pnpm run dev:desktop`                              |
| Web 开发         | `pnpm run dev:web`                                  |
| 目录结构检查     | `pnpm run source:check`                             |
| 提交前检查       | `pnpm run verify:pre-push`（目录、Lint 与架构检查） |
| 架构检查         | `pnpm run architecture:check --changed`             |
| 模块阅读包       | `pnpm run architecture:context <module-id>`         |
| 未使用依赖与导出 | `pnpm run knip`                                     |
| 导出引用查询     | `pnpm run dep:refs --list-exports <file>`           |

测试入口以目标包当前的 `package.json` 和实际测试文件为准，不假定存在统一的单测或 E2E 命令。

源码应用定位见 [apps/README.md](apps/README.md)；完整包名、公开入口和内部依赖见根目录自动生成的 [SOURCE_PACKAGES.md](SOURCE_PACKAGES.md)。新增/移动包或修改插件元数据后执行 `pnpm run source:plugins`、`pnpm run source:map`，再以 `pnpm run source:check` 验证。官方插件发行只在 `config/official-plugins.json` 登记，禁止维护平行版本清单或手改生成的 Contracts。新增文件先判断是可交付应用、共享包、可启停插件还是开发工具；pnpm-workspace.yaml 是 TS 工作区的登记来源（包管理器为 pnpm，锁文件 `pnpm-lock.yaml`）。

仓库文档落点：根 `docs/` 仅保留部署指南；其他行为规范在所属应用或包内维护。`scripts/generate-source-map.mjs` 独占根 `SOURCE_PACKAGES.md` 的生成，`source:map:check` 必须在输出缺失或过期时失败。图标母版位于 `assets/brand/kayingcode.png`，`scripts/generate-kayingcode-icons.py` 从该文件生成各平台资产；移动母版后，原有图标验收必须保持通过。

- `packages/desktop`：Electron main、host、renderer。
- `packages/web`、`packages/server`：Web 客户端与服务端。
- `apps/kayingcode-site`：独立静态产品站；包名 `kayingcode-product-site`，不复用工作台业务运行时。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/services`：业务服务；`packages/rpc`：RPC 框架。
- `packages/shared`：共享协议与类型；`packages/client`：Agent 客户端 SDK。
- `apps/zcode-cli/packages/cli`：Agent CLI/TUI 入口与 SEA 构建；Agent 共用运行时、契约、adapter、bootstrap 位于 `apps/zcode-cli/packages/*`。
- `packages/zcode-server-cli`：上游常驻服务 CLI、远程 staging 与代理；保留 Desktop SSH/WSL/Docker 开发容器支持。
- `apps/kayingcode-relay-cloudflare`：V2 Relay、设备身份与授权及上游 Web 同源托管。协议来自 `packages/shared/src/web-remote-relay`；账号、设备与 socket lease 属于 WebRemoteRelayObject，任务和快照属于已有 Host。旧 Docker Relay、relay-core、agent-relay、Node control、审核与 admin 已退役，不得恢复其依赖或部署指令。历史 RelayObject 仅为不绑定的迁移占位，不得通过删除类迁移擅自销毁生产数据。
- `apps/kayingcode-mobile-taro`、`apps/kayingcode-mobile-flutter`：移动接入渠道，分别使用 TS 与 Dart 工具链。
- **Flutter 多端发布前必须阅读 [`apps/kayingcode-mobile-flutter/AGENTS.md`](apps/kayingcode-mobile-flutter/AGENTS.md) 的 SDK 切换规则**：Agent 先运行 `node scripts/flutter-target.mjs <android|ios|ohos> check`，再由同一入口构建。Android/iOS 使用项目 `.fvm/flutter_sdk` 固定的上游 Flutter 3.35.5；鸿蒙使用独立 CPF-Flutter `3.35.8-ohos-1.0.4` 与受支持的 DevEco/HarmonyOS 编译 SDK。不得为切换平台修改 `.fvmrc`、根 `pubspec.lock` 或全局 PATH。
- `plugins/`：内置与本地能力插件；`tools/`：开发、校验和研究工具。
- Computer Use 运行实现只在 `apps/zcode-cli/packages/kaying-computer-use-plugin`；旧 `@kayingcode/cua`、Helper/Broker、权限面板和 PiP 已退役，不得重新依赖或恢复。`apps/zcode-cli/packages/node-repl-host` 只承载 JS 与 Browser Use。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- 有行为改动时先补充对应测试；交互改动需要 E2E 场景。检查测试与实现是否一致，并实际执行可用的验证。未执行或环境受限时如实说明。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- 涉及状态、时序、远端或异步同步的方案，用图展示所有者及事件顺序。
- 必须执行 `pnpm run typecheck` 和 `pnpm run lint`，报告真实结果，不将已有失败写成通过。
- 使用异步文件和网络 IO；跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用 Runtime 具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾桌面与手机 Web 的布局、交互、主题和国际化。
- 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），不直接调用 `window.kayingcode`。
- 通过依赖注入处理 Desktop、Web、本地和远程环境的差异，并兼顾 Windows、macOS 和 Linux。
- Zustand 状态位于 `packages/ui/src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 进程、协议与远程控制

- Desktop app 通过 stdio 与 Agent 通信。协议改动同步更新 `packages/shared/src/kayingcode-protocol/index.ts`，提供严格类型与运行时校验。
- Main 负责窗口、原生操作、进程调度和消息转发，不承载 task/session 业务状态。
- 每个窗口使用一个 window-scoped Local Host；本地 workspace 共享该 Host。远程 workspace 由窗口内的连接注册表管理，不另建 Desktop Remote Host。
- 手机远控连接桌面已有 Host attachment，复用会话运行时；不为手机另起 Agent、Local Host 或远程会话。
- Desktop 的 `desktop-continuous` 实时链路与手机的 `web-remote-replayable` 恢复链路必须明确区分。修改 stream、snapshot、queue 或重连时，同时验证两种语义。
- 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，不保存任务队列、快照等业务状态。
- 已接受的 busy/running 输入由 CLI/runtime `CommandInbox` 串行 admission；Renderer 只保留未提交草稿与 pending optimistic overlay，Host owner/lease 负责路由。
- 保留 owner/lease、跨 Host 路由和 stale run 防护，不能仅根据单一路径删除边界判断。

## 公开 Client API 与本地 ApiMock

公开客户端接口（`/api/v1/client/*`）统一走 `packages/shared/src/client-public-api/`，禁止在业务代码里手写 URL 或各自 `new URL`。

- `contracts.ts`：请求/响应数据结构与解析；`endpoints.ts`：路径常量与 URL 构造。
- `types.ts`：`IClientPublicApi` 端口；`mock.ts`：本地 ApiMock；`remote.ts`：远端实现；`factory.ts`：按 endpointOrigin 选实现。
- **KayingCode.localrun（无官方端点）走 ApiMock 本地返回，不发网络请求**；有官方端点走远端。空 origin 不得进入 `new URL`，会抛 `Invalid URL`。
- 新增或扩展公开 API 时按此顺序：在 `contracts.ts` 落数据结构与解析 → 在 `types.ts` 的 `IClientPublicApi` 加方法 → `mock.ts` 补本地缺省 → `remote.ts` 补远端请求 → 消费方只依赖接口。
- 装配用 `createClientPublicApi({ resolveEndpointOrigin, request, local? })`；请求细节经注入的 `request` 端口，便于 Desktop/Host/Node 各自适配。
- 帮助/强更/灰度等同源 `/api/v1/client/configs` 的消费方，复用 `endpoints.ts` 与 `contracts.ts`，不要复制 envelope 解析。

## Workspace Identity

- `workspaceIdentity` 用于身份隔离，`workspacePath` 用于文件操作、命令 cwd、Git 和路径展示。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`，适用于去重、绑定、缓存、队列、持久化和请求关联。
- 远程链路贯穿传递 `workspaceIdentity` 与 `remoteSessionId`，不得仅按路径匹配。
- 新接口保留本地路径 fallback；远程 identity 复用现有构造和解析工具，不在业务代码中手写格式。

## 日志

- UI 使用 `packages/ui/src/logger.ts`，不直接使用 `console.log` 或 `window.kayingcode?.log`。
- Agent/session/runtime 相关服务日志使用 `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`）。
- `debug` 用于协议原始数据、流式 chunk 和逐条工具更新等高频诊断，生产环境不落盘。
- `info` 用于进程和会话生命周期、权限结果、一次性初始化等生产可用事件。
- `warn` 用于可恢复异常；`error` 用于崩溃、握手失败、鉴权丢失等不可恢复错误。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
