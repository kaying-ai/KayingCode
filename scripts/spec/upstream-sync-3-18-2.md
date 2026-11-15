# ZCode 3.18.2 采纳计划与验收

## 范围与来源

- 产品起点：`6418edc4`（0.1.5 后的 main），上游基线 `a9fe401e`（3.17.2）。
- 官方目标：`https://github.com/zai-org/ZCode` 的 `fec97590`（3.18.2），对应同步提交 `b95ebaff`（3.18.0）、`c5904686`（3.18.1）、`fec97590`（3.18.2）。
- 镜像：`zcode-main` 已从 `a9fe401e` 快进至 `fec97590`，`origin/zcode-main` 与 `upstream/main` SHA 一致。
- 适配分支：`upstream/3.18.2`，从产品 `main` 开出。
- 仓库历史为独立树，产品 `main` 与 `upstream/main` 没有共同祖先，**不得以 git merge 或整树覆盖完成采纳**；以三方文件比较（基线 `a9fe401e` / 产品 `HEAD` / 目标 `upstream/main`）逐模块适配。

## 差异规模

| 类别 | 文件数 | 说明 |
| --- | --- | --- |
| 纯新增（产品无同名文件） | 1527 | 其中 918 个为上游 desktop 测试、375 个为 design-plugin 资源 |
| 上游新增但产品已有同名文件 | — | 见各模块审阅；不得覆盖产品实现 |
| 上游修改、产品未改 | 432 | 可机械取用，但需检查跨模块引用 |
| 双方都改（源码类） | 657 | UI 293、CLI 146、services 65、desktop 44、shared 31 |
| 上游修改、产品已删除 | 1738 | 多为已退役测试/文档/账号链路；不恢复 |
| 上游删除 | 31 | 逐项判断是否已由产品删除 |

3.18.0 是功能主体；3.18.1 主要是语音输入与内存诊断；3.18.2 集中在凭据安全（`enc:v2` 系统密钥）、OAuth 凭据与模型提供方族。

## 规则与所有者

- 协议唯一入口是 `packages/shared/src/kayingcode-protocol(-v4)`；上游 `zcode-protocol*` 增量必须手工迁入，不恢复上游原树。
- Host/session/Controller、owner/lease、SSH/Relay、桌面 continuous 与手机 replayable 链路保持现状；不引入上游 app-control、extension-host、session-control 的第二套会话入口。
- KayingCode.localrun 的 ApiMock、模型配置、鉴权与本地默认路径保持唯一写入路径；上游账号/OAuth/套餐/云目录/官方 MCP 不接入。
- 已退役模块（CUA package、relay-core、plugin-ui、data-sync、highspeed、gen-ui、settings-scope、conversation-share-interaction、App 业务单测）不随上游文件回流。
- 新协议字段必须在接收侧按 capability 位门控；发送侧未装配的能力不宣告。
- 品牌、版本、插件目录（`.kayingcode-plugin`、`KAYINGCODE_PLUGIN_ROOT`）、官方插件清单、发布 CI 保留本地约定。

## 本轮采纳（第一批：安全与稳定性）

本轮为**部分采纳**。第一批只收自包含、可独立验证的修复；能力模块（prompt snapshot、context composition、扩展宿主等）留待后续批次，未完成全部范围前不更新采纳基线。

### A. Agent / runtime 自包含修复

| 状态 | 范围 | 内容 |
| --- | --- | --- |
| 已采纳 | dynamic-workflow | `child-source.ts` 的 vm realm 逃逸修复：沙箱改 null 原型、传输函数收进闭包并从全局删除、入口函数预取、收尾改由 cell 主动通知；保留 `.kayingcode/workflow-runs` 与 `__kayingcode-dwf-child` 品牌命名 |
| 已采纳 | adapters | `network/proxy-fetch.ts`：取消信号不再取自可被 GC 的临时 Request，代理连接错误监听随请求对象回收，CONNECT 阶段可取消 |
| 已采纳 | node-repl-host | 工具契约如实声明 `js` 非沙箱执行且不经过 Bash 危险命令确认；保留产品“仅 Browser Use”边界，不恢复 Computer Use 文案 |
| 延后 | adapters | 推理历史/runner 归一化依赖 `blockIndex`、`signedReasoningReset` 协议批次，与 blockIndex 改造同批 |
| 延后 | adapters | session-data 符号链接越界与 `listSessionFiles`/保留式删除，属会话永久删除特性，需协议与 Host 同批 |
| 延后 | adapters | 插件目录原子写入、zip source 与插件安装流程整体改造 |
| 延后 | android-emulator-plugin | 产品已删除该包，不恢复 |
| 延后 | memory-diagnostics | 3.18.1 诊断模块，需 bootstrap 接线后单独验收 |

### B. 上下文与会话能力

| 状态 | 范围 | 内容 |
| --- | --- | --- |
| 已采纳 | core / contracts | prompt snapshot：新增 `SESSION_ENTRY_PROMPT_SNAPSHOT`（`runtime/prompt_snapshot`）；主会话首次请求记录 system 字节，恢复时读取，compaction 成功后清除并按当前代码重建前缀，legacy fork 复制父会话快照；模型 identity 只比较 provider 与 model id，写入失败只记 warning |
| 已采纳 | core / contracts | 后台 Agent 无进展提醒：新增 `background-stall.ts` 与 `subagent-stall-reminder.ts`；registry 增加 activity 快照；子代理执行引入 `executionId` fencing 与终止/停止校验；无进展提醒不计入后台结果消费与 `message_source`；通知合批把标准 `<task-notification>` 排在提醒之前；出队时已失效的提醒结算为 discarded |
| 延后 | core | `context-composition` 组成分类依赖新的 session row/协议字段与 UI 展示，随 blockIndex/session row 批次 |
| 延后 | core | 编辑锁协议依赖队列编辑命令与 UI，随后台输入批次 |

### C. Shared / Services 小范围修复

| 状态 | 范围 | 内容 |
| --- | --- | --- |
| 已采纳 | web-remote-relay | `domain/retry.ts` 连接建立后首次重连在 1.5 秒窗口内打散，`acknowledged()` 设置打散、新增 `reset()`；`heartbeatTiming.ts` 删除无消费方的旧重连 jitter 导出 |
| 延后 | remote-projects | 成员释放修复依赖 `desktop/src/host/index.ts` 的 admission 接线，随 Host 批次 |

### D. UI 独立增量

| 状态 | 范围 | 内容 |
| --- | --- | --- |
| 已采纳 | 会话渲染 | `ToolCallBlocks/QueuedSummaryContent` 的 React #185 修复：禁用动画走静态渲染，动画拆到子组件，同一摘要不再逐 token `setState`；保留产品已收窄的导出面 |
| 已采纳 | 轮尾加载 | `ChatLoadingOrbs` 105 点球体动画；morph 目标由上游「Z」改为 KayingCode 的「KY」品牌点阵（35 点、约 15×9、变形时点半径 0.5→0.8 加粗），常量改为 `ORB_BRAND_*`；计时改为整秒；`workDuration` 补齐俄语空格并去掉十分之一秒 |
| 延后 | 来源徽标 | 产品已主动简化 `InteractionRequestOriginBadge`（不再展示描述），与上游整行换行方案语义不同，单独评估 |
| 延后 | 外观 | 字体平滑依赖设置页与 store 结构，随设置批次 |

### E. 本轮明确不采纳

- 凭据体系重写（`systemCredentialCipher`、`enc:v2`、`@napi-rs/keyring`）与 OAuth/账号/套餐链路。
- `packages/plugin-api`、`packages/session-control`、desktop `extension-host`、`app-control`、`app-control-navigation`。
- `design-runtime`、`design-plugin`、browser-use 设计模式与 `embeddedBrowserDesignBridge`。
- `windows-runtime-host` 与上游 Windows 签名/NSIS/electron-builder 全量补丁。
- voice-input、selection-comment、composer-edit-mode、managed-worktrees、extension-slots、settings-search、data-sync、plugin-ui。
- i18n 的 ja/ko/ru 与 locale 五值改造；`toolGrouping*` 移除。
- 上游 desktop/CLI 测试与文档整批回流。

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
