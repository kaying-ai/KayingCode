# 从 ZCode 更新的可复用指导

本指南用于后续执行者。先读当前 [状态](status.md) 与对应轮次计划；用户只要求调查或制定计划时，到文档交付为止。收到实施指令后再按阶段推进。

## 1. 建立轮次与比较基线

1. 读取本地根 AGENTS、目标应用 AGENTS、`mise.toml`、当前 package.json；代码变更应用 architecture-governance 技能，先架构检查再读目标模块受控上下文。UI 变更读 DESIGN；插件商店变更另读 CONTEXT。
2. 在本地根运行 `node scripts/check-workspace-freshness.mjs` 与 `git status --short`，保存 HEAD、分支和本地改动摘要。上游副本同样读取 HEAD、版本、状态与适用指令。保留无关本地改动；不自动 reset 或恢复退役模块。
3. 上游仓库路径来自本次用户或已确认配置。不要假设上轮本机路径仍存在。未 fetch 的检出只能称“本地检出”，不能称“最新上游”；按任务需要获取目标 ref 并固定完整 SHA。
4. 从 status 取“已完成迁移上游版本”作为正式迁移比较基线。没有基线时先建立首次范围和历史比较点，不能把上次评估目标当成全部已集成。
5. 新增 `logs/YYYY-MM-DD.md`，同日多个轮次可加主题后缀。每轮保留固定源/目标 SHA、目标模块、决定和结果；旧日志只追加澄清，不覆写历史结论。

在上游目录执行的只读比较示例（先将变量替换为已核实的 ref）：

```sh
git rev-parse HEAD
git log -5 --format='%h %ad %s' --date=iso-strict
git diff --stat "$zcode_update_base" "$zcode_update_target" -- packages/web packages/ui packages/shared packages/client packages/desktop
git diff "$zcode_update_base" "$zcode_update_target" -- packages/web/src/web-remote-control
```

若下一轮上游重组目录，先用 `rg --files` 查实际入口，再调整比较路径。不要跨仓库直接执行同名 git cherry-pick；同步提交可能包含整仓变化。

## 2. 从行为追到状态所有者

- 用 feature-boundary-planner 查现有图中的相关节点和一跳关系，再核对当前源码。图是索引，不能证明功能已存在。
- 按入口→验证/能力→owner command→事件/持久化→投影追踪；分开检查 Flutter、Web、Desktop、Taro 以及两种 Relay 部署。
- 查看上游提交差异和调用方，区分首次新增、已有机制重构、独立 bugfix；Source Sync 日期只标为公开同步日期。
- 每个候选能力登记：上游文件/符号/提交、本地落点、必须适配的依赖、迁入/适配/暂缓/不迁移决定、原因、测试和未决项。创建轮次计划时复用本轮 U01–U08 表形状。
- 对状态/时序画图。固定唯一 owner、事件顺序、幂等键、取消和 stale 边界；用源码和运行证据分别标注已确认与假设。

## 3. 先定义规范，再改实现

在所属应用/包的 spec 中先写产品规则、状态归属、公开接口和验收用例。本目录保存计划、决策和进度，不另建平行业务契约。待实现规范必须显式标状态，不能覆盖仍生效的旧规范。

采用小阶段和可评审提交：服务准入验证→入口/容器→完整 UI→恢复/版本资源→平台验收→发布回退。不要把中间阶段描述为最终能力。每阶段更新计划和状态的对应编号。

保留的本地差异至少包括：

- KayingCode 无账号本地使用与现有配对授权；公共 client API 通过既有接口及 ApiMock 装配，不恢复官方登录/订阅依赖。
- 已有 Host attachment、window owner/lease、跨 Host 路由、远端 identity/remoteSessionId 与 stale run 防护。
- `desktop-continuous` 和 `web-remote-replayable` 的独立语义；已接受输入由 CommandInbox admission，页面只保存草稿和 pending 投影。
- UI 通过 hooks/平台接口访问服务，跨包用公开入口；不恢复旧 Computer Use 包、Helper/Broker 或其他退役内部依赖。
- Relay 修改同时验证 Docker/Cloudflare 的 API、适配器、控制消息与失败语义；复制前端不代表后端具备能力。
- 当前 Bun 工作区、锁文件、命令和路径；不能整份复制上游 pnpm 清单、生成 Contracts 或架构基线。

实施中发现设计缺陷或需要改变已确定产品语义，先给出具体证据和选择再与用户对齐。例行可逆实现及已有授权范围内的验证继续执行，不反复请求许可。

## 4. 验证顺序与证据记录

先确认目标包实际 scripts、测试文件和 runner，再选择验证。不存在的命令、历史 integration_test、仅含注释的覆盖都不算证据。

1. 运行受影响的语义测试与故障恢复场景；交互变更补可运行 E2E。真 Relay+假 Agent 的协议测试与真实浏览器/真机验收分别记录。
2. 运行 `bun run typecheck`、`bun run lint`。涉及架构执行 `bun run architecture:check --changed`，目录/元数据涉及项执行 `bun run source:check`；新增/移动包或插件元数据按仓库要求更新 source 生成物。文档单独格式检查。
3. Flutter 从根使用 `node apps/kayingcode-mobile-flutter/scripts/flutter-target.mjs <目标> check`，再通过同一入口检查/构建。Android/iOS/Windows 固定上游 SDK，鸿蒙使用独立 SDK 与暂存目录；每轮重新核对应用 AGENTS 和脚本支持动作。
4. 将共同会话 fixture、视口、主题、语言固定，保存两侧截图/操作记录。标出刻意产品差异，不宣称未经观察的“完全一致”。证据仅用虚构数据，不存 token、完整配对 URL、真实用户内容或内部服务地址。
5. 检查旧 Bot 档案、凭据轮换、跨 Bot/工作区隔离、后台恢复、版本缓存、两种 Relay、桌面 continuous 与共享 core 的其他消费端。
6. 测试通过后仅在新改动、失败或未解决风险需要时扩大/重复验证。环境缺失单列“未执行/待验收”；已有失败记真实退出码与范围。

本轮命令和验收矩阵见 [计划第 6、7 节](migration-plan.md#6-共同能力与代表性验收)。未来命令以当轮 package.json 为准。

### 本轮已验证的复用路径

- 共享 UI 入口为 Web `RelayConversationScreen`，组合本地共享 Timeline/PermissionDialog/QueuePanel/CodeViewer；不要在下轮为了接入新组件而开放完整 Root 服务面。先枚举方法与授权要求。
- 连接 owner 为 mobile-client-core `RelayConnectionController`；页面生命周期只发 suspend/resume。目标切换、迟到握手/订阅 ACK、上传取消都要验证旧代不写 UI；清理失败不能卡住用户取消。
- Flutter 配置来自两端 Relay `/v1/client-config`，与现有 `RELAY_WEB_CLIENT_URL` 共用；改配置、CORS、管理页逻辑同时核对两端。入口 fragment v1 和 Bot scoped storage 的解析在共享 core，网页立即清 fragment。
- 原生回退命令：先对应目标 `check`，再 `node apps/kayingcode-mobile-flutter/scripts/flutter-target.mjs android debug --native-kayingcode`；iOS/Windows 同入口同开关。Android native APK 带 `-native`，默认网页制品不要被回退构建覆盖。测试可用 `android test --native-kayingcode`。
- 依赖归属有意改变时，上游固定 SDK 用 `pub-get --update-lockfile`；OH 用独立 `refresh-lock --preserve-versions`，审查是否只有预期包变化。平台切换不刷新版本；遇到 Git 缓存缺 object 先查证并保留损坏缓存，再修复；不要误升级无关依赖。
- 浏览器 UI 命令为 `bun run --filter @kayingcode/web test:e2e`，需本机 Chrome（Windows 缺省 Edge；可用 `KAYINGCODE_E2E_BROWSER_CHANNEL` 指定 Playwright channel）。截图默认生成在忽略的 `.kayingcode-runtime/mobile-workbench/`；仅将无秘密的 fixture 证据复制进本轮目录。它不覆盖真实 RelayApp 配对和原生容器。
- Taro 真实包名为 `@kayingcode/mobile`；空 filter 匹配不是测试成功。新增 package scripts 后用 `bun run source:map` 更新生成清单；禁止手改 SOURCE_PACKAGES。

## 5. 写入完成状态与发布回退

日志每条至少包含：日期/轮次、任务编号、源目标 SHA、本地变更提交或未提交状态、实际执行命令/cwd/退出码、结果、证据位置、未验证范围、下一步。可以使用下列模板：

```text
日期 / 轮次：
任务编号 / 状态变化：
上游 base -> target：
本地 HEAD / 实现提交 / 工作区状态：
决定与实际变更：
验证（命令、cwd、退出码、结果、证据）：
未执行项 / 失败原因 / 待解决问题：
回退及数据兼容情况：
下一步：
```

“已完成迁移”须满足：本轮候选项均有处理决定；必需功能已实现；适用测试和平台验收已完成；产品差异与剩余范围有明确处理；发布资源及存储回退可行。部分模块完成只登记对应项的提交与证据，不推进整轮基线。

发布时保存旧网页/容器制品、资源版本与存储兼容说明；回滚不能重新启用旧协议或绕过授权。旧 native adapter 在引用和验收确认前保留；删除时检查导出引用，并同步清理测试、说明和技能引用，不恢复已移除依赖。

最后更新 status 的已评估/已迁移/已发布标记、本轮日志和 README 入口。将后续新增差异带入下一轮，不能因目标版本“调查过”而跳过未完成工作。
