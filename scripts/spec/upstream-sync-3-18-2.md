# ZCode 3.18.2 采纳计划与验收

## 范围与来源

- 产品起点：`6418edc4`（0.1.5 后的 main），上游基线 `a9fe401e`（3.17.2）。
- 官方目标：`https://github.com/zai-org/ZCode` 的 `fec97590`（3.18.2），对应同步提交 `b95ebaff`（3.18.0）、`c5904686`（3.18.1）、`fec97590`（3.18.2）。
- 镜像：`zcode-main` 已从 `a9fe401e` 快进至 `fec97590`，`origin/zcode-main` 与 `upstream/main` SHA 一致。
- 适配分支：`upstream/3.18.2`，从产品 `main` 开出。
- 仓库历史为独立树，产品 `main` 与 `upstream/main` 没有共同祖先，**不得以 git merge 或整树覆盖完成采纳**；以三方文件比较（基线 `a9fe401e` / 产品 `HEAD` / 目标 `upstream/main`）逐模块适配。

## 差异规模

| 类别                       | 文件数 | 说明                                                        |
| -------------------------- | ------ | ----------------------------------------------------------- |
| 纯新增（产品无同名文件）   | 1527   | 其中 918 个为上游 desktop 测试、375 个为 design-plugin 资源 |
| 上游新增但产品已有同名文件 | —      | 见各模块审阅；不得覆盖产品实现                              |
| 上游修改、产品未改         | 432    | 可机械取用，但需检查跨模块引用                              |
| 双方都改（源码类）         | 657    | UI 293、CLI 146、services 65、desktop 44、shared 31         |
| 上游修改、产品已删除       | 1738   | 多为已退役测试/文档/账号链路；不恢复                        |
| 上游删除                   | 31     | 逐项判断是否已由产品删除                                    |

3.18.0 是功能主体；3.18.1 主要是语音输入与内存诊断；3.18.2 集中在凭据安全（`enc:v2` 系统密钥）、OAuth 凭据与模型提供方族。

## 规则与所有者

- 协议唯一入口是 `packages/shared/src/kayingcode-protocol(-v4)`；上游 `zcode-protocol*` 增量必须手工迁入，不恢复上游原树。
- Host/session/Controller、owner/lease、SSH/Relay、桌面 continuous 与手机 replayable 链路保持现状；P1–P4 已对齐的 app-control、extension-host、session-control 必须复用这些入口，不得另建平行会话路径。
- KayingCode.localrun 的 ApiMock、模型配置、鉴权与本地默认路径保持唯一写入路径；上游账号/OAuth/套餐/云目录/官方 MCP 不接入。
- 已退役模块（旧 `@kayingcode/cua`/Helper/Broker、relay-core、data-sync、highspeed、gen-ui、settings-scope、conversation-share-interaction、App 业务单测）不随上游文件回流。P4 恢复的 plugin-ui/MCP App 页面层与 P5 的 `.zcode-plugin` 清单不再是退役项。
- 新协议字段必须在接收侧按 capability 位门控；发送侧未装配的能力不宣告。
- 品牌、版本与发布 CI 保留本地约定；内置插件清单自 P5 起统一使用上游 `.zcode-plugin`，`.kayingcode-plugin` 仅作旧缓存与第三方插件回退，`${ZCODE_*}` 优先、`${KAYINGCODE_*}` 兼容。

## 本轮采纳（第一批：安全与稳定性）

本轮为**部分采纳**。第一批只收自包含、可独立验证的修复；能力模块（prompt snapshot、context composition、扩展宿主等）留待后续批次，未完成全部范围前不更新采纳基线。

### A. Agent / runtime 自包含修复

| 状态           | 范围                    | 内容                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已采纳         | dynamic-workflow        | `child-source.ts` 的 vm realm 逃逸修复：沙箱改 null 原型、传输函数收进闭包并从全局删除、入口函数预取、收尾改由 cell 主动通知；保留 `.kayingcode/workflow-runs` 与 `__kayingcode-dwf-child` 品牌命名                                                                                                                                                                     |
| 已采纳         | adapters                | `network/proxy-fetch.ts`：取消信号不再取自可被 GC 的临时 Request，代理连接错误监听随请求对象回收，CONNECT 阶段可取消                                                                                                                                                                                                                                                    |
| 已采纳         | node-repl-host          | 工具契约如实声明 `js` 非沙箱执行且不经过 Bash 危险命令确认；保留产品“仅 Browser Use”边界，不恢复 Computer Use 文案                                                                                                                                                                                                                                                      |
| 延后           | adapters                | 推理历史/runner 归一化依赖 `blockIndex`、`signedReasoningReset` 协议批次，与 blockIndex 改造同批                                                                                                                                                                                                                                                                        |
| 已采纳         | adapters                | session-data：新增 `listSessionFiles` 与 `SessionDataFile`；存储类别父目录被换成符号链接时拒绝删除；保留式删除只保留被引用的 artifact，其余正文/日志/独占附件照常清理；`removeSession` 返回删除前字节数，重复删除幂等                                                                                                                                                   |
| 已采纳（部分） | adapters                | 插件文件写读可靠性：新增 `writePluginTextIfChanged`（同内容跳过、临时文件 + 原子 rename、Windows 占用有界重试）；`atomic-directory` 采用上游事务解析与 `readStandaloneAtomicFile`/`resolveAtomicReadPath`；marketplace 的 JSON 写入改用 write-if-changed，新增 `listInstalledPluginRecordsAsync` 与 `resolveInstalledPluginRootAsync`，已安装插件根读取改走事务安全路径 |
| 延后           | adapters                | 插件 discovery/query 的异步化、material-change 中断与并发限制，以及 zip source、安装流程整体重写                                                                                                                                                                                                                                                                        |
| 已采纳         | memory-diagnostics      | 3.18.1 内存分配诊断：新增 `adapters/src/memory-diagnostics`（recorder/storage/contract）；资源采样器以 15s 节拍采集 inspector 分配样本，落盘到 `~/.kayingcode/cli/memory-diagnostics`；协议 server 的 `collectMemoryDiagnostics` 支持跳过事件统计扫描；v4 gateway 补充 hydration/history/binary cache 计数                                                              |
| 延后           | android-emulator-plugin | 产品已删除该包，不恢复                                                                                                                                                                                                                                                                                                                                                  |

### B. 上下文与会话能力

| 状态   | 范围             | 内容                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 已采纳 | core / contracts | prompt snapshot：新增 `SESSION_ENTRY_PROMPT_SNAPSHOT`（`runtime/prompt_snapshot`）；主会话首次请求记录 system 字节，恢复时读取，compaction 成功后清除并按当前代码重建前缀，legacy fork 复制父会话快照；模型 identity 只比较 provider 与 model id，写入失败只记 warning                                       |
| 已采纳 | core / contracts | 后台 Agent 无进展提醒：新增 `background-stall.ts` 与 `subagent-stall-reminder.ts`；registry 增加 activity 快照；子代理执行引入 `executionId` fencing 与终止/停止校验；无进展提醒不计入后台结果消费与 `message_source`；通知合批把标准 `<task-notification>` 排在提醒之前；出队时已失效的提醒结算为 discarded |
| 延后   | core             | `context-composition` 组成分类依赖新的 session row/协议字段与 UI 展示，随 blockIndex/session row 批次                                                                                                                                                                                                        |
| 延后   | core             | 编辑锁协议依赖队列编辑命令与 UI，随后台输入批次                                                                                                                                                                                                                                                              |

### C. Shared / Services 小范围修复

| 状态   | 范围             | 内容                                                                                                                                                                                                                                       |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 已采纳 | web-remote-relay | `domain/retry.ts` 连接建立后首次重连在 1.5 秒窗口内打散，`acknowledged()` 设置打散、新增 `reset()`；`heartbeatTiming.ts` 删除无消费方的旧重连 jitter 导出                                                                                  |
| 已采纳 | remote-projects  | `releaseRemoteProjectProfileHost`：未识别线路删除/改址后归还按地址预留的成员行；`findRemoteProjectHostIdForProfile` 枚举时对无效身份返回 null；Host 在 `removeProfile`/`updateProfile` 后调用释放端口；新增 `CONTRACT.md` 记录对称释放语义 |

### D. UI 独立增量

| 状态   | 范围     | 内容                                                                                                                                                                                                                                                                                                                           |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 已采纳 | 会话渲染 | `ToolCallBlocks/QueuedSummaryContent` 的 React #185 修复：禁用动画走静态渲染，动画拆到子组件，同一摘要不再逐 token `setState`；保留产品已收窄的导出面                                                                                                                                                                          |
| 已采纳 | 轮尾加载 | `ChatLoadingOrbs` 105 点球体动画；morph 目标由上游「Z」改为 KayingCode 的「KY」品牌点阵（35 点、约 15×9、变形时点半径 0.5→0.8 加粗），常量改为 `ORB_BRAND_*`；计时改为整秒；`workDuration` 补齐俄语空格并去掉十分之一秒                                                                                                        |
| 已采纳 | 图片预览 | 新增 `ImagePreviewActions`：复制、下载、保存并打开、保存副本并选择应用、在文件管理器中显示、添加到聊天；新增 `useImageFilePreview`/`ConversationImageFileMention`，文件 mention 保留 `href` 以打开原图；未保存标注在关闭/切图前确认，导出期间拒绝离开；下载与复制逻辑下沉到 `lib/imagePreviewDownload`、`lib/copyPreviewImage` |
| 已采纳 | 外观     | 本机 macOS 字体平滑偏好：store 增加 `fontSmoothingEnabled`（默认开启、本地持久化、跨窗口广播），设置「外观」页新增开关（仅 macOS desktop 显示）；CSS 以 `:root.platform-mac-desktop.font-smoothing-enabled` 启用灰度抗锯齿，Web 与远控不继承                                                                                   |
| 延后   | 来源徽标 | 产品已主动简化 `InteractionRequestOriginBadge`（不再展示描述），与上游整行换行方案语义不同，单独评估                                                                                                                                                                                                                           |

### E. 3.18 核心 model/context 专项（分阶段）

该专项与 `context.ts`、`context-refresh.ts`、`compact-active.ts` 共用改动面，不能按单文件拆散；按以下阶段推进，每阶段独立分支与验收。

| 阶段 | 状态     | 内容                                                                                                                                                    |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a   | 已采纳   | instruction-files 基础：结构化文件模型、完整/增量渲染、旧公告解析；adapter 区分"文件不存在"与"读不出来"，读错误按 `user_instructions_read_failed` 诊断  |
| 1b   | 已采纳   | context_prefix 记录已公告文件、请求前增量公告、compaction 重读指令文件并在提交后应用；冷恢复/rewind 不再原位改写指令公告                                |
| 2    | 已采纳   | total-tokens 预算：主/子 agent system 末尾固定预算行；runtime 计数状态、轮首/工具批次/文本续接的提醒与用户输入重锚；compaction rollover，resume 重置    |
| 3    | 部分延后 | context-composition：开源树内只有闭源 App 客户端消费，当前接入无产品入口；本轮只保留 blockIndex 所需的类型占位，完整分类/协议/查询待 App 侧接入后再排期 |
| 4    | 已采纳   | blockIndex：块到达序号贯穿流式/非流式、持久化、冷恢复与请求排序；服务端工具轮次、文字块不合并、旧消息保持旧布局；工具历史与读文件状态按序号排序         |

### F. 不采纳与已调整范围（P5 后）

- 已采纳：`packages/plugin-api`、`packages/session-control`、desktop `extension-host`、`app-control`、`app-control-navigation`、`extension-slots`、plugin-ui/MCP App 页面层、`design-plugin`（P0–P5）。
- 已采纳（PR1）：`enc:v2` 系统凭据 cipher、`@napi-rs/keyring`、Desktop Main 单一 keyring 所有权、Host/CLI cipher 桥、数据根 key share。
- 仍不采纳：上游 OAuth/账号/套餐/登录凭据链路与 `shared-credentials` 的 OAuth 恢复/CAS 机制。
- 仍不采纳：`design-runtime`、browser-use 设计模式与 `embeddedBrowserDesignBridge`。
- 仍不采纳：`windows-runtime-host` 与上游 Windows 签名/NSIS/electron-builder 全量补丁。
- 仍不采纳：voice-input、selection-comment、composer-edit-mode、managed-worktrees、settings-search、data-sync。
- 仍不采纳：i18n 的 ja/ko/ru 与 locale 五值改造；`toolGrouping*` 移除。
- 仍不采纳：上游 desktop/CLI 测试与文档整批回流。
- 待后续：远端 Server/Server CLI 的 v2 格式门禁、`--prepare-credentials` 与 release 回滚保护（PR2）。

## 验收

- 逐文件结果以 `upstream/3.18.2` 的提交 diff 为准；不以 ours merge 或整目录覆盖假冒采纳。
- 必须执行根 `pnpm run typecheck`、`pnpm run lint`、`pnpm run source:check`、`pnpm run architecture:check --changed`；CLI 变更额外执行 CLI 包内 typecheck/lint。
- 受影响模块执行现有测试；UI 交互改动验证桌面与手机 Web 布局；协议改动同时验证 desktop continuous 与 mobile replayable 两条链路。
- 新增文件先判断归属（应用/共享包/插件/工具），`pnpm-lock.yaml`、`SOURCE_PACKAGES.md`、`source:plugins` 按登记流程更新。
- 只有 A–D 全部验收后才将 `UPSTREAM_BASE.json` 更新到 `fec97590`；本轮若存在未完成项，保留 `a9fe401e` 基线并在提交说明中记录剩余范围。

## 验证记录

第一批（2026-11-14，分支 `upstream/3.18.2`）：

- `pnpm run typecheck`：通过（根 `tsc -b` 全量 + relay-cloudflare）。
- `pnpm run lint`：通过，0 errors / 127 warnings；改动文件无新增告警（既有告警来自其他包）。
- `pnpm run source:check`：通过（61 个 workspace 包、16 个官方插件条目、源码地图一致）。
- `pnpm run architecture:check --changed`：通过，0 violations。
- CLI 包内 typecheck：`@zcode/dynamic-workflow-runtime`、`@zcode/adapters`、`@zcode/node-repl-host` 均通过。
- dynamic-workflow 沙箱手工回归：正常脚本返回 2；`globalThis.constructor.constructor("return process")().pid` 被 `ReferenceError: process is not defined` 阻断。
- `node-repl-host` 的 `legacy-cua-retirement.test.ts`：2 个用例通过；`browser-broker.test.ts` 在本机因 Windows 命名管道 `EACCES` 无法监听，属环境限制，未作为通过结果。
- `@zcode/dynamic-workflow-runtime` 的 vitest 入口在本地不可用（仓库仅保留 `run-identity.test.ts`，其引用的 `helpers.ts`/`auto-driver.ts` 未随仓库保留，且包内直接运行 vitest 会按包目录解析根 projects 配置失败），本轮未执行该包测试。
- 未执行：桌面 E2E、真实远端重连、麦克风/语音等需要真机的场景；本批无相关改动。

采纳基线：本轮仍保留 `a9fe401e`（3.17.2），待后续批次完成并验收后再更新 `UPSTREAM_BASE.json`。

第二批（2026-11-15，prompt snapshot）：

- 新增 `core/src/runtime/helpers/prompt-snapshot.ts`；改动 `contracts/session-store.port.ts`、`core/internal.ts`、`context-refresh.ts`、`resume.ts`、`turn-loop.ts`、`compact-active.ts`、`session-fork.ts`、`workspace-fork.ts`、`workspace-checkpoints.ts`。
- 新增上游回归 `core/tests/prompt-snapshot.test.ts`：14 个用例全部通过（覆盖记录/读取/模型不匹配/compaction 清除/legacy fork 复制/写入失败降级/无效数据解析）。
- 包内 typecheck：`@zcode/contracts`、`@zcode/core`、`@zcode/adapters`、`@zcode/bootstrap`、`@zcode/cli` 均通过。
- 受影响回归：`runtime-context-announcements`、`prompt-snapshot` 通过。
- core 全量测试：26 个文件、207 个用例，201 通过、6 失败；失败均为 Windows 环境限制，与本轮改动无关：
  - `post-compact-file-restore` / `tool-executor-read-deny-probe`：断言使用 `/tmp/...`，Windows 实际路径为 `D:\tmp\...`，相对路径比较不通过；相关实现与用例本轮未修改。
  - `subagent-explore-permission-mode`：子代理元数据目录名内嵌 JSON 的 `{`、`}`、`"`，Windows 不允许这些字符，`mkdir` 返回 ENOENT；相关 runner 本轮未修改。
- 根 `pnpm run lint`、`source:check`、`architecture:check --changed` 再次通过。

第三批（2026-11-15，后台 Agent 无进展提醒）：

- 新增 `core/src/subagent/background-stall.ts`、`core/src/runtime/methods/subagent-stall-reminder.ts` 与上游回归 `core/tests/background-subagent-stall.test.ts`。
- 改动 `runtime-task/registry.ts`（activity 快照）、`runtime/internal.ts`、`runtime/types.ts`（`backgroundStallNotifyMs` / `backgroundStallMaxIntervalMs`）、`agent-runtime.ts`（生命周期）、`runtime/methods/subagent.ts`（活动上报）、`background-notifications.ts`（入账等待、失效提醒结算、来源过滤、通知排序）、`runtime-command-active-loop.ts` / `runtime-command-queue.ts`（提醒不计入后台结果消费）。
- 契约：`SubagentTaskSnapshot.executionId`、`SubagentStopOptions.expectedExecutionId`、`BackgroundResultOriginMeta.subagentStall`、`withAgentFailureHandback` / `readAgentFailureHandback`。
- `subagent/runner.ts` 采用上游版本（executionId 生命周期、停止身份校验、失败交接与运行元数据读取），保留 `kayingcode-agents` 临时目录品牌。
- 回归：`background-subagent-stall.test.ts` **22/22 通过**；core 全量 **223/229**，仍为前述 6 个 Windows 环境失败，无新增失败。
- 包内 typecheck：contracts、core、adapters、bootstrap、cli 通过；根 typecheck、lint、source:check、architecture:check --changed 通过。

第四批（2026-11-15，轮尾「工作中」球体动画）：

- 采用上游 `ChatLoadingOrbs`（105 点 SVG 球体，8.24 秒一个循环：球面 → 字形 → 球面），替换原 3×3 像素动画；图标槽保持 16px，`prefers-reduced-motion` 下显示静态字形。
- morph 目标由上游「Z」改为 KayingCode 的「KY」双字母点阵，常量改为 `ORB_BRAND_POINTS` / `ORB_BRAND_TARGETS`，避免沿用上游品牌造型。
- 计时改为整秒（`formatRunningWorkDuration`）；`workDurationUnitSeparator` 按上游补齐俄语空格。
- 样式新增 `.animated-gradient-text-foreground`，删除已无引用的像素/ shimmer 规则。
- 同步更新 `packages/ui/spec/chat-loading-indicator.md`、`packages/ui/spec/upstream-3-17-2.md` 与 `packages/ui/test/modelRetryProgress.e2e.mjs`（`0 秒`、整秒断言）。
- 验证：`tsc -b packages/ui`、根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过；KY 点阵用 20px 实际尺寸渲染核对，字形可读。E2E 需要桌面浏览器环境，本轮未在 CI 中执行。

第五批（2026-11-15，内存分配诊断）：

- 新增 `adapters/src/memory-diagnostics/`（CONTRACT、contract、recorder、storage、types、module、index），采用上游 3.18.1 实现；默认落盘目录改为产品路径 `~/.kayingcode/cli/memory-diagnostics`。
- `packages/shared/src/memoryDiagnostics.ts` 增加 `CliMemoryDiagnostic`/`CliMemoryReading` 与 `sanitizeCliMemoryDiagnostic`、文件保留上限；`ZCODE_COMMIT` 以产品构建提交提供兼容别名。
- 资源采样器在既有 60s 节拍之外启动 15s 分配诊断，`stop()` 同时停止诊断；inspector 不可用时静默降级。
- `collectMemoryDiagnostics({ includeEventStats: false })` 跳过历史事件扫描；v4 gateway 增加 hydration/history/binary cache 计数。
- 回归：`memory-diagnostics/recorder.test.ts` **10/10 通过**；shared/contracts/adapters/bootstrap/cli 与根 typecheck 通过；根 lint、source:check、architecture:check --changed 通过。

第六批（2026-11-15，session-data 文件安全）：

- `session-data-files` 增加 `SessionDataFile` 与可选 `listSessionFiles`；删除前逐类别检查父目录，顶层被换成符号链接时返回 `session-data.symlink-root`，不沿链接清理用户文件。
- `removeSession` 支持 `retainedArtifactIds`：只保留被 URI 引用的 artifact 附件，正文、执行日志与其他独占附件仍删除；无保留参数时保持原有整段删除语义与返回字节数。
- 采用上游行为测试，覆盖符号链接根、清单排序与保留式删除；`session-data-files` 与 contract 测试共 **7/7 通过**（与 memory-diagnostics 合计 17/17）。
- 类型检查 adapters 通过；后续统一执行根 lint、source:check、architecture:check。

第七批（2026-11-15，图片预览操作条）：

- 新增 `image-preview-editor/ImagePreviewActions.tsx`，把复制/下载/保存并打开/选择应用/文件管理器/添加到聊天收进预览操作区；工具条与 Surface 的保存区按上游调整。
- 新增 `lib/imagePreviewDownload.ts`、`lib/copyPreviewImage.ts`；图库下载逻辑从 dialog 下沉，dialog 保留旧导出兼容现有调用方。
- 新增 `hooks/useImageFilePreview.ts` 与 `v4/ConversationImageFileMention.tsx`；`mentionMarkdown` 为 file part 保留 `href`，图片引用可读取原目标。产品已移除的设计模式 `element` mention 不引入。
- `ImagePreviewSurface` 增加 `onDownload`/`downloading`/`onNavigationGuardChange`；未保存标注在关闭/切图前确认，导出/添加忙态期间拒绝离开。
- 补齐 10 个中英文 i18n key；`packages/ui/src/image-preview-editor/CONTRACT.md` 已更新。
- 验证：`tsc -b packages/ui`、根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。上游 browser manual-review 用例（`preview-image-actions`、`inline-image-mention`、更新后的 `image-preview-edit`）需要 Playwright 浏览器环境，本轮未纳入 CI 执行。

第八批（2026-11-15，macOS 字体平滑偏好）：

- store 增加 `fontSmoothingEnabled` / `setFontSmoothingEnabled`，默认开启，存储键为产品前缀 `kayingcode-macos-font-smoothing`；变更写入本地存储并广播到其他窗口。
- 初始化时按偏好给根节点加 `font-smoothing-enabled`；CSS 只在 `.platform-mac-desktop` 下启用 `-webkit-font-smoothing: antialiased`，Web/远控不受影响。
- 「外观」页仅在 macOS desktop 显示「字体平滑」开关；本地 `SettingsRow` 尚无 settings-search 的 `searchId`，本轮不引入该参数。
- 补齐中英文文案；验证 `tsc -b packages/ui`、根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。设置页视觉未单独截图验证。

第九批（2026-11-15，插件文件写读可靠性）：

- `plugins/helpers.ts` 新增 `writePluginTextIfChanged`：内容相同时不写盘；变化时先写临时文件再原子 rename，Windows 占用错误有界重试，失败保留旧文件。
- `plugins/atomic-directory.ts` 采用上游版本：统一事务解析，新增 `readStandaloneAtomicFile` 与 `resolveAtomicReadPath`，读取时避开活跃安装事务、恢复已死亡事务的残留。
- `plugins/marketplace.ts`：JSON 写入改用 write-if-changed；新增 `listInstalledPluginRecordsAsync`、`resolveInstalledPluginRootAsync`，`describeMarketplacePlugin` 的已安装根改走事务安全异步读取。
- 新增回归 `tests/plugins-atomic-write.test.ts`：创建父目录、内容更新、同内容不触碰文件、并发写只留完整文档。
- 验证：adapters/bootstrap typecheck 通过；atomic-write + plugin-mcp-isolation **5/5 通过**；根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。
- 未采纳：插件 discovery/query 全量异步化、material-change 中断、并发上限、zip source 与安装流程重写。

第十批（2026-11-15，remote-projects 成员释放）：

- `connection-membership` 新增 `findRemoteProjectHostIdForProfile` 与 `releaseRemoteProjectProfileHost`：已识别线路直接返回；无其他未归档同地址线路且地址行无入口时 `removeHost`；IPv6 等身份无效线路不再让枚举抛错。
- `sourceServerManagementService` 增加 `releaseUnboundProfileHost` 端口，`removeProfile` 先释放后删设置，`updateProfile` 改址后释放旧地址；`host/index.ts` 注入 `releaseRemoteProjectProfileHost`。
- `services` 的 `remote-projects/index.ts` 与 `node.ts` 导出新入口；新增 `packages/services/src/remote-projects/CONTRACT.md`。
- 新增回归 `packages/services/test/remoteProjectMembership.test.ts`：删除释放、同地址活跃线路保留、retired 线路不阻止释放、有入口旧行保留、设备线路不释放、IPv6 地址正常释放，**6/6 通过**。
- 验证：shared/services/desktop typecheck 通过；根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。

第十一批（2026-11-15，核心专项 1a：instruction-files 基础）：

- 新增 `core/src/context/sections/instruction-files.ts`：文件块/完整公告/增量公告渲染，`createInstructionFile` 计算 sha256，`parseInstructionAnnouncement` 严格解析，`parseLegacyInstructionFiles` 按标题行兼容旧公告。
- `context/types.ts` 增加 `InstructionFile`、`InstructionRefreshReason`、`InstructionAnnouncement`，`ContextSection`/`ContextMetaUserAttachment` 增加 `instructionFiles`/`files`。
- 契约增加 `CONTEXT_SOURCE_INSTRUCTIONS_READ_FAILED`；adapter 只在 ENOENT/EISDIR/ENOTDIR 时视为文件不存在，其他读取错误产生诊断；指令候选检查遇到权限等错误时停在该候选，不再向上换用父目录文件。
- 新增 `core/tests/instruction-files.test.ts`（5 个用例）覆盖 trim/hash、完整/增量渲染、严格解析与旧公告解析。
- 验证：contracts/adapters/core typecheck；instruction-files + runtime-context-announcements **52/52**；根 lint、source:check、architecture:check --changed 通过。
- 未接线：context_prefix metadata、请求前增量公告、compaction 重读与应用（1b）。

第十二批（2026-11-15，核心专项 1b：增量公告与 compaction 重读）：

- `request-user-context` 改用结构化 instruction files 渲染；`builder` 把 `instructionFiles` 汇总到 `context_prefix` 附件。
- `message-history` 与 `session-history-hydrator` 保存/恢复 `instructions` 元数据；旧公告无元数据时按标题行解析。
- `context-refresh` 新增 `buildInstructionAnnouncement`/`announcedInstructionFiles`/`fullInstructionAttachment`：按已公告文件比较，变化或删除时追加增量；请求前公告与 compact 前公告共用同一规则。
- 冷恢复/rewind 不再原位改写指令公告（`REFRESHED_ON_LOAD_SOURCES` 只保留 skills），避免改变已发送前缀字节导致 prompt cache 失效。
- `context.ts` 新增 `rereadInstructionSources`/`buildRereadInstructionContext`/`applyRereadInstructionSources`，启动时记录读不出来的路径；`compact-active` 并行重读，summary 前用重读结果发完整公告，提交后再应用到 runtime 并把 reason 改为 compaction。
- 回归：`instruction-files` + `runtime-context-announcements` **52/52**；core 全量 **228/234**，仍是既有 6 个 Windows 环境失败；更新了 3 个旧语义用例。
- 验证：contracts/adapters/core typecheck；根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。
- 简化：Memory 索引重读未同步 readFileStateEntry/unreadable 路径（本地 memory 读取接口尚无该返回），不影响指令文件增量判定。

第十三批（2026-11-15，核心专项 2：total-tokens 预算）：

- 新增 `context/total-tokens.ts`：固定 15,000,000 预算、`<total_tokens>N tokens left</total_tokens>` 提醒与 system 行；主/子 agent context builder 末尾都带该固定行。
- 新增 `runtime/helpers/total-tokens-budget.ts`：按最近一条带 usage 的 assistant 计算窗口上下文，`consume` 保证已用量不回退，`reanchor` 在用户真实输入时重置窗口，`decideTotalTokensReminder` 区分轮首/工具批次/文本续接。
- `internal`/`agent-runtime` 增加内存计数状态；`resume` 重置；`compact` 在 auto/reactive 提交后 rollover（手动 compact 不 rollover，下一条真实用户输入重锚）。
- `turn-loop` 的输入附件收集改为记录原因（`turn_input`/`tool_batch`/`text_guide`），轮首用 `isRealUserPrompt`、文本续接用 drain 的 `userSteered` 判断是否重锚；收集尾部先写库再更新计数器。
- `steering` 的 drain 诊断增加 `userSteered`；system reminder 增加持久化来源 `total_tokens_reminder`。
- 回归：`total-tokens-budget` 4/4；`runtime-context-announcements` 47/47；`runtime-tool-hook-context` 2/2；core 全量 **232/238**，仍为既有 6 个 Windows 环境失败。
- 验证：contracts/adapters/core/bootstrap typecheck；根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。

第十四批（2026-11-15，核心专项 4：blockIndex / assistant 块顺序）：

- contracts：文本/思考/工具 part 增加 `blockIndex`，`SignedReasoningReset`、`isBlockIndex`、`sortByCompleteIndex` 与 `hasOrderedAssistantBlocks` 等契约辅助；工具 part 的旧 `declarationIndex` 只用于旧数据。
- adapters：`orderedAssistantItems` 按 blockIndex 稳定排序并在请求中剥离序号；`orderGeneratedContent` 给非流式结果编号；推理历史归一化按签名拒绝与恢复标记重写；session-store 读取按 blockIndex 排序。
- core：流式/非流式分配序号并落库；`message-history` 与冷恢复共用 `buildAssistantEntries`（文字块不合并、服务端工具切轮、usage 只在末轮）；请求投影按序输出；工具历史、读文件状态、provider 工具轮次按序号排序。
- 冷恢复与 live 走同一构造入口；旧消息无序号时保持原有 layout。
- 为类型对齐新增 `pluginDiscoveryUi` 占位字段（未接线，默认 false）；`model-status` 增加 Disposable 适配 `using`。
- 明确未采纳：`recordRequestContextComposition*`（phase 3 延后），model.ts 不记录组成预演数据。
- 回归：core `tool-history-order` 21 + `message-history` 9 新增通过；adapters `model-transform` 32 + `reasoning-history-normalization` 65 通过；core 全量 **262/268**，仍是既有 6 个 Windows 环境失败。
- 验证：contracts/adapters/core/bootstrap/cli typecheck；根 lint（0 errors）、`source:check`、`architecture:check --changed` 通过。

第十五批（2026-11-15，插件体系 P0：基础契约与双兼容 loader）：

- 新增 `packages/plugin-api`（1.4.0，4 个 type-only 入口）与 `packages/session-control`（contracts/cli/app/testing）；`@zcode/shared` 新增 `extension-host` 入口与 `@zcode/session-control` 依赖。
- 新增 `packages/shared/src/extension-host/`：manifest 两步校验、grants 档位、slots 静态表、能力表与通道类型；协议导入改用 `kayingcode-protocol-v4`，`PLUGIN_MANIFEST_CANDIDATES` 增加 `.kayingcode-plugin` 回退。
- 新增 `packages/shared/src/kayingcode-protocol-v4/context-composition/contract.ts`，补充 `displayConversationRowSchema`、`UnreadableConversationRow` 与 `WireConversationRow` 别名，供 extension-host 与 plugin-api 复用。
- 插件 loader：`.zcode-plugin` > `.kayingcode-plugin` > `.claude-plugin` > `.codex-plugin`；marketplace 版本解析与 zip 根识别同步优先级。
- 变量双兼容：MCP args/env、命令 shell 块、hooks、skills、Bash 会话 env 同时支持 `${ZCODE_*}` 与 `${KAYINGCODE_*}`；`${user_config.*}` 语义不变；stdio MCP 环境权威双写 `ZCODE_PLUGIN_ID` / `KAYINGCODE_PLUGIN_ID`。
- 官方插件启动参数与打包 staging 同时识别两种清单目录、两种 `${*_PLUGIN_ROOT}/` 占位符；缺失 MCP 入口仍 fail-closed。
- 规范：新增 `adapters/spec/plugin-manifest-compat.md`，明确 loader 与 extension-host 的状态所有者、接口与验收边界。
- 回归：adapters `plugin-zcode-compat` 4/4、core `plugin-variable-compat` 3/3、shared `extension-host/contract` 6/6、session-control 103/103、plugin-api version 1/1、staging `.zcode-plugin` fail-closed 3/3（本机 Windows 运行）通过。
- 验证：根 `pnpm run typecheck`（含 session-control 与 plugin-api）通过；根 `pnpm run lint` 0 errors / 128 个既有 warnings；`source:plugins`、`source:map`、`source:check`、`architecture:check --changed` 通过；`plugin-api` dts 构建通过。
- 未接线：扩展进程、扩展网关、session-control 的 CLI/App adapter、extension-slots UI 与上游插件替换仍按 P1–P5 推进；`UPSTREAM_BASE` 保持 3.17.2。

第十六批（2026-11-15，插件体系 P1：app-control 与扩展网关）：

- 新增 `packages/services/src/app-control/`（contract、discovery、execution、observation、reverseRpc）与 `packages/services/src/extensions/`（门面、能力网关、grantsStore、静态表读取、会话读镜像、settings/context/generation/models/views 后端）。
- 新增 `packages/shared/src/app-control` 协议（12 个 `appControl/*` 方法与 cancel）并接入 `kayingcodeProtocolMethods`；新增 `plugins/readUserOptions`、`plugins/mentionItems` 方法名与 `ServiceChannels.Extensions/ExtensionViews/ExtensionGrants`。
- 共享协议补充 `ConversationInputSource` 的 session/extension 来源、`CommandQueryTurn`、`ModelRequestMetricsFact`、插件 `dataPath` 与沙箱 `contentKind: "extension"` provenance 校验。
- `createLocalServices` 创建 `AppControlService` 并经 `onAppControlServiceCreated` 交给进程内组件；插件 user 设置读取器放进 `WeakMap`，不暴露到 RPC；插件管理服务在成功变更后发 `onMutationSucceeded`。
- `IKayingCodeAgentService` 增加 `getContextComposition`、`onDynamicContextCompositionChanged`、`onDynamicModelRequestMetrics`、`getPluginMentionItems`、`supportsExtensionInputSource` 兼容声明；新增 `pluginHostQueriesClient`，CLI 尚未实现查询方法时按 `supported: false` 降级。
- CLI `session/messages` 增加 forward/cold 读取与 cursor 失效校验；`readSession`/`readSessionEvents` 透传 contentProfile/runtimePolicy；V4 CAS helper 支持可信客户端 `clientId`。
- 规范：新增 `packages/services/spec/plugin-upstream-p1.md`；扩展进程、Main 监管器与桌面频道注册留给 P2/P4。
- 回归：capability gateway **7/7**、grants store **3/3**、sessions backend **5/5**、app-control helpers **4/4**；根 typecheck、lint（0 errors/128 既有 warnings）、source:check、architecture:check --changed 通过。
- 未接线：app-control discovery 目录、创建回执、fork 预留；session-control adapter 与模型会话工具（P3）；扩展宿主进程（P2）。

第十七批（2026-11-15，插件体系 P2：扩展宿主进程与 Main 监管器）：

- 新增 `packages/desktop/src/extension-host/`（L0/L1 通道、扩展注册表与激活事务、能力客户端、视图 MCP 服务器/宿主、窗口连接）与 `main/extensionHostSupervisor.ts`（单进程、代际、崩溃预算、探活、日志环形缓冲、Window Host 配对）。
- Main 启动时创建监管器，首个 Window Host 就绪后拉起扩展进程，并在 App 退出屏障中 dispose；`desktopRuntimeEnv` 增加扩展宿主模块路径。
- Window Host 注册 `IExtensionsService`/`IExtensionViewsService`/`IExtensionGrantsService`，把 AppControl facade、插件管理变更信号、user 选项读取器、任务投影与沙箱登记交给扩展网关；服务就绪后 announceReady。
- 构建：新增 extension-host tsup 入口、`tsconfig.extension-host.json` 与 desktop 的 MCP client/core/server 依赖；扩展进程环境使用产品进程标签与白名单。
- 品牌：扩展进程的 serviceName、MCP server/client info 与错误文案改为 KayingCode。
- 回归：supervisor **3/3**（环境白名单/设置页代理、首次拉起与牵线、崩溃预算耗尽停止）；根 typecheck、lint、source:check、architecture:check --changed 通过。
- 未接线：extension-slots UI 与 Renderer 频道（P4）；session-control adapter 与模型工具（P3）；内置插件替换（P5）。

第十八批（2026-11-15，插件体系 P3：session-control 与模型会话工具）：

- 新增 `core/src/tool/session-control`：8 个共有 + 4 个 App 专属模型工具，模型只见 `tool` 变体；请求身份由 toolCallId/retryOf 注入，超时/取消通过 `describeUnsettledCall` 回传同一 requestId。
- `ToolEntry` 增加 `describeUnsettledCall`；executor 在 ToolTimeout/ToolCancelled 错误上追加对账说明。`AgentRuntimeDeps` / `ToolExecutionContext` / executor deps 增加 `sessionControl`。
- `registerBuiltInTools` 增加 `sessionControlKind`，按可信装配选择同名变体；`ListModels` 在灰度关闭但会话控制在场时保留。
- 新增 `bootstrap/src/session-control`：App 12 动作映射到 `appControl/*` 反向 RPC；`kayingcodeAgentService` 在 chat lane 上处理反向请求，用同一连接的 session/list 事实核对 caller 根会话与 workspace。
- 新增 `bootstrap/src/cli-session-control` 与 `active-transcript`：独立 CLI/TUI 创建本进程会话控制 runtime，`standaloneSessionControl` 注入；后台根共用询问通道但固定 build。
- 共享协议补充 App/extension 输入来源到 contracts 的 `TurnInputSourceMetadata`；core 包新增 `./session-control` 导出与依赖。
- 规范：`core/spec/session-control-tools.md`、`bootstrap/spec/session-control-bindings.md`。
- 回归：core session-control **24/24**、bootstrap contract **2/2**、session-control 包 **103/103**；core 全量 289/295，仍为既有 6 个 Windows 环境失败。
- 验证：根 typecheck、lint（0 errors/128 既有 warnings）、source:check、architecture:check --changed 通过。
- 未接线：扩展 slots UI（P4）与内置插件替换（P5）。

第十九批（2026-11-15，插件体系 P4：扩展插槽与 MCP App 页面层）：

- 恢复上游 `packages/ui/src/plugin-ui`（73 文件）与 `packages/ui/src/extension-slots`（32 文件）：MCP App/Gen UI/扩展视图共用页面宿主、沙箱传输、hostContext 与能力声明。
- `ExtensionViewsProvider` 包裹 Shell，统一处理 views.open、workbench.startDraft、grants.request、notifications.show 与 env 报告；`useAppPanels` 新增扩展视图/日志打开与 file.viewer 路由。
- 五插槽接入：composer.status（用量圆环左侧）、composer.mention（@ 面板分组）、sidePane.launcher（侧栏启动页）、nav.primary（主导航）、file.viewer（代码预览前接管）；扩展视图/日志侧栏标签可渲染。
- 授权：启动页 needs-consent/activation 与插件详情权限区块接入 `IExtensionGrantsService`；通知点击与扩展通知开关接入 PlatformService 可选方法。
- Client `RemoteServiceAccess` 增加 extensions 门面（仅桌面 base attachment 打开）与 plugin-ui 服务；`IServiceAccessor` 增加扩展/沙箱字段。
- 恢复扩展 UI 依赖：MCP client/core/ext-apps；补齐 test ids、confirmDialog `intent`/`scrollableDescription`、MentionCategory、投影 onLiveDeltas、侧栏 tab 联合类型与 i18n 中英文 key。
- 规范：`packages/ui/spec/plugin-extension-slots.md`。
- 回归：`extensionSlotsDomain` **3/3**；根 typecheck、lint（0 errors/133 既有 warnings）、source:check、architecture:check --changed 通过。
- 未执行：桌面 Electron E2E（真实扩展激活/视图 MCP/授权对话框/崩溃重启）需要浏览器与桌面运行环境；内置插件替换留 P5。

第二十批（2026-11-15，插件体系 P5：上游插件替换与内置清单迁移）：

- 上游源码整体替换：`android-emulator`、`browser-use`、`documents`、`ios-simulator`、`pdf`、`presentations`、`plugin-creator`、`skill-creator`、`spreadsheets`、`zcode-guide`、`visualize`、`restore-legacy-sessions` 与 `office-runtime`；新增上游 `design`。本地精简镜像、旧 skill 名与旧命令不再保留。
- 清单统一：所有内置插件改用 `.zcode-plugin/plugin.json`；catalog、SEA、desktop staging、server-cli staging、bootstrap seed 与运行时读取按 `.zcode-plugin` 优先、`.kayingcode-plugin` 回退。产品插件（taptap/blender/game-playtest/computer-use）同步迁移清单，并把 MCP 占位符改为 `${ZCODE_*}`；原 `KAYINGCODE_*` 环境仍由 adapter 双写，产品原生代码无需改环境名。
- 官方开发者字段按 CLI 规范统一为 `kayingai.com`；上游插件正文、skills、MCP 实现与版本保持上游内容。
- `config/official-plugins.json` 更新为 19 个发行条目：office 四件套改为 build，声明 viewer skill、`dist/server.mjs`、`dist/ui/assets.json`、`dist/ui/panel.html` 与 `componentTypes: ["ui"]`；android/ios 改为 build 并更新 skill/seed 路径；`zcode-guide` 取代 `kayingcode-guide`，移除插件内重复的 `/workflow` 命令与 dynamic-workflows 技能（CLI 内置命令与 bundled skill 已承担）；`visualize`、`design`、`restore-legacy-sessions` 进入发行集合，默认关闭策略与上游一致。
- 构建：每个 office 插件增加只复用 `office-runtime` 的 `scripts/build.mjs`，满足 bootstrap 脚本必须位于插件根内的约束；bootstrap/desktop 仅在存在 tsconfig 时执行 tsc，避免纯资源面板构建被空 tsc 阻断。
- 官方服务边界（本条为产品例外，后续接入官方端点时再移除）：
  - `computer-use` 继续使用 `kaying-computer-use-plugin` 原生 stdio MCP，不接入上游 `zcode-cua-plugin`/`node_repl` CUA bridge；`node-repl-host` 继续保留 Browser Use 与 JS 执行，不恢复旧 CUA helper/broker。依据：`AGENTS.md` 与 CLI AGENTS 明确旧 CUA 运行时退役且 Computer Use 只走原生插件。
  - `image-search` 保留本地 Openverse stdio server 作为 localrun 回退；上游 HTTP MCP 依赖 `zcode_official` 鉴权与 `${ZCODE_BASE_URL}`，本产品尚无该端点与解析，直接替换会静默失败。
  - `zcode-site` 暂不纳入发行：其 MCP/UI 依赖官方 Sites 服务与官方鉴权，localrun 无对应服务；待端点与面板接线完成后再补。
- `node-repl-host` 兼容上游 request-context：同时接受 `com.zcode/request-context` 与 `com.kayingcode/request-context`，顶层 `_meta` 仍不能作为会话凭据。
- 规范修复：bootstrap source discovery 接受 `packages/desktop` 入口；catalog 生成器输出 `componentTypes`；source-discovery E2E 的仓库根、用户配置隔离与 desktop 路径修正。
- 回归与验证：
  - `source:plugins`（19 条）与 `source:plugins --runtime` 通过；`source:map`/`source:check` 通过。
  - 根 `pnpm run typecheck`、`pnpm run lint`（0 errors / 133 既有 warnings）、`architecture:check --changed` 通过。
  - android **20/20**、iOS **5/5**、browser-use **3/3**（含真实 headless Chromium 全链路）、plugin-creator **8/8**、office-runtime **83/83**、server-cli packaging **33/33（1 skipped）**、bootstrap seed/source **7/7**、catalog generator **9/9**、listing/UI contribution **3/3**、source-discovery E2E **2/2** 通过。
  - `prepare:agent-bundle` 在 win32-x64 完成全部 19 个内置插件与 bundled-skills 的构建/暂存，Computer Use 原生 runtime、taptap、game-playtest 均通过各自校验。
  - SEA `collectSeaOfficialPluginAssets`（win32-x64、requireRuntime）收集 **19** 个插件、**1329** 个文件，全部含 `.zcode-plugin/plugin.json`。
  - 未执行/受限：design 的 SessionStart hook 用例依赖 POSIX `sh`，本机 Windows 原生 Node 无法在 `/usr/bin:/bin` 下找到 sh（6 个环境失败）；node-repl broker 单测在 Windows 命名 socket 上 `EACCES`，browser-use 真实 Chromium E2E 已覆盖同一 bridge。两者均非 P5 代码回归。
- `UPSTREAM_BASE` 保持 3.17.2；P5 验收完成后另行评估基线更新。

第二十一批（2026-11-15，凭据体系 PR1：本机 enc:v2 与 OS 钥匙串）：

- 新增 `packages/shared/src/credential-security/`：上游 v2 cipher、v1 解码、来源固定、Linux 私有文件回退、密钥共享、server prepare/handoff 与 bridge；品牌化为 KayingCode 环境变量、服务名和错误码。
- `@napi-rs/keyring@2.1.2` 进入 shared/desktop/cli 依赖；Desktop main/host 与 CLI bundle 将其保留为运行时 external，Desktop `asarUnpack` 解包目标平台 `.node`，native policy 裁剪非目标变体并 fail-closed。
- `credentialService` 改为异步 cipher，读取/保存时整库迁移 v1→v2；不可解密旧值保留；provisioning 与 Host 注入同一 cipher。未注入的独立 Server 继续使用 v1 兼容路径，避免在 PR2 前依赖 Secret Service。
- Desktop Main 持有 keyring，Host 通过 `credential-cipher-request/result` 委托；内置 CLI 通过 `interaction/requestCredentialCipher` 委托 Host；数据根切换由 Host 请求 Main 执行 `credential-key-share-request`，失败中止切换。
- Linux Main 在首次凭据访问前启用私有文件 key fallback；真实 Windows 钥匙串 roundtrip smoke 通过并清理了测试条目。
- 回归：cipher/bridge **10/10**、services 迁移与数据根 **6/6**、keyring staging/native policy **5/5**、CLI async store **2/2**；真实 keyring smoke 通过。
- 验证：根 typecheck、lint（0 errors/133 既有 warnings）、source:check、architecture:check --changed、CLI desktop-agent bundle 构建通过。
- 未完成：远端 Server/Server CLI 的格式门禁、`--prepare-credentials` 与 release 回滚保护（PR2）；`UPSTREAM_BASE` 仍保持 3.17.2。
