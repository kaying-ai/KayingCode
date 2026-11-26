# Changelog

## [0.3.0](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.2.4...kaying-code-v0.3.0) (2026-11-26)

### Features

* **desktop:** persist and surface the agent reply language ([269d054](https://github.com/kaying-ai/KayingCode/commit/269d054c204a5592656ab6329a2441dd027e21cf))

* **plugin:** adopt manifest discovery, load isolation and private plugin options ([eb3c6c1](https://github.com/kaying-ai/KayingCode/commit/eb3c6c1c6aa1dcf6fc6ada3546702f8ddf96232d))
  * add upstream plugin discovery contract and unified manifest parsing\n- isolate per-plugin load failures with plugin_load_failed diagnostics\n- move plugin secrets and workspace options to private storage; ignore project plugins.options\n- stage workspace plugin declaration/trust, live inventory and watch modules for async discovery integration\n- update Phase 2 progress and remaining trust/live-inventory work

* **upstream:** add agent always-background CLI switch ([2e7ae67](https://github.com/kaying-ai/KayingCode/commit/2e7ae67c4f17f50ef1201edd9f2d7d3419bf5d54))
  * parse --agent-always-background on|off for prompt, target and TUI
  * pass subagents.alwaysBackground through headless and TUI runtime config
  * keep product default foreground; document the launch-only scope in help

* **upstream:** add input preemption and Agent background controls ([19afaa1](https://github.com/kaying-ai/KayingCode/commit/19afaa1ec822191acf5e9a413c51522e72235563))
  * add InputPreemption abort reason/control contracts and executor slot
  * let foreground subagents move to background on immediate-send preemption
  * add alwaysBackground Agent option with product-default foreground behavior
  * add preemption unit tests and bundled game plugin loader acceptance test
  * record stage 4/5 progress in spec

* **upstream:** add MCP tool catalog, WaitForMcpServers and runtime session views ([a165d05](https://github.com/kaying-ai/KayingCode/commit/a165d0527e15708235248beaf3848554d70e1558))
  * add McpToolCatalogPort, tool catalog cache and transport error classification/retry
  * expose tool snapshots, waitForServer and snapshot listeners in adapter and pool
  * add WaitForMcpServers contract/tool, gated by MCP port presence
  * add core mcp/runtime session view and merge catalog-only tools while connecting
  * wire shared in-memory tool catalog through bootstrap and runtime config changes

* **upstream:** add reply language announcements and RPC ([13f96c1](https://github.com/kaying-ai/KayingCode/commit/13f96c11b1a8a8a6ce45b79fc0de82a6887a787d))

* **upstream:** add stage 4 storage migrations, ReadTopicResource and browser state ([123d1c6](https://github.com/kaying-ai/KayingCode/commit/123d1c65a66445ac93a1871849b6c646d7892999))
  * add session purge/runtime presence schema and dwf parent-session index migrations
  * add ReadTopicResource tool contract/reader gated by topicResourcePort
  * restore Playwright storage state support and --browser-state/--no-browser-state
  * await async plugin bootstrap APIs in CLI plugin commands
  * record stage 4 progress and remaining CLI/runtime parity items

* **upstream:** adopt async plugin system, workspace trust and live catalogs ([f36df01](https://github.com/kaying-ai/KayingCode/commit/f36df010beec2c2fe1f5bb6061109215be365a22))
  * switch plugin discovery to upstream async material-cache loader and workspace trust admission
  * add skill live catalog and MCP configuration source, wired into app startup and shutdown
  * add plugins/workspaceTrust protocol, service and settings UI with pending/trusted states
  * keep localrun marketplace boundaries, dual-brand MCP env and .kayingcode-plugin fallback
  * add targeted trust/live-catalog tests, spec updates and trust documentation

* **upstream:** adopt Windows cmd readonly policy ([85a330c](https://github.com/kaying-ai/KayingCode/commit/85a330c6cb9ffa51a2319eff78bc7e291f6ae7f2))
  * add cmd-readonly contract/policy and CMD-only execution checks
  * use CMD read-only classification for Bash and Memory executor when the session runs through cmd.exe
  * port upstream 127-case policy tests

* **upstream:** adopt ZCode 4.0.0 protocol baseline and account mechanisms ([01cb03b](https://github.com/kaying-ai/KayingCode/commit/01cb03b1101128ba4c9fc07db05d5ea2dc8ffcf7))
  * complete upstream protocol inventory and three-way merge POC; add protocol parity and contracts schema gates\n- merge architecture policy candidate with staged managed enablement\n- migrate CLI contracts to zod 4.6.5 and z.toJSONSchema\n- restore upstream OAuth service, credential generation guards, CLI login/logout and CLI OAuth adapters\n- add Relay client API and OAuth mock/proxy routes with contract tests\n- defer desktop login UI, live endpoint validation and staging deployment

* **upstream:** adopt ZCode 4.0.0 wave 4 parity ([f14e863](https://github.com/kaying-ai/KayingCode/commit/f14e86364b78ac271779002807d5104e127739f2))
  * core: live ordered assistant projection via buildAssistantEntries; remove cold-restore legacy shim; hydrator delivery branches
  * mcp: startup policy/deniedTools/tool-search delivery, 401 step-up, pool lease, retainTools and builtin restart caps
  * session: queue edit lock + full composer edit-mode; archive permanent deletion with batch preview/execute and runtime presence
  * runtime prefs: activitySummaryDismissed authoritative watermark (bootstrap/UI/mobile)
  * plugins: pluginDiscoveryUi hello/capability, plugin install card and auto-recommendation preference (partial)
  * ui: settings navigation search; desktop remote/web reply language via host settings
  * platform: browser backend identity and control scopes; managed-worktree foundation; hook verify-before-dispatch
  * tests: vitest migration fixes for ui/cli entry points

* **upstream:** complete wave 5 parity and localrun startup hardening ([aacbf3e](https://github.com/kaying-ai/KayingCode/commit/aacbf3e2960844585501201f15dc23ab4c9dc787))
  * land managed-worktree, preinstalled tools, voice input, selection comments, plugin extension summary and extension input source
  * finish settings search, plugin host naming and MCP App reconnect
  * guard localrun OAuth/help config against empty endpoints
  * ignore extension-host control frames in host response buses
  * generate shared subpath build aliases and pin chokidar for desktop agent builds

* **upstream:** enforce live MCP tool admission at execution ([b11290d](https://github.com/kaying-ai/KayingCode/commit/b11290dca61a805e28066c2b281f27caee6804bf))

* **upstream:** expose MCP tool memory snapshots ([3a4c196](https://github.com/kaying-ai/KayingCode/commit/3a4c196e911200912658c49f250b574f97523e87))
  * add McpServerToolSnapshot and optional getToolSnapshot on McpPort
  * version tool lists on initial and list_changed refresh, keep descriptors across reconnects
  * aggregate leased adapter snapshots in the connection pool with connection-scoped versions
  * add stdio snapshot tests and stage 3 spec notes

* **upstream:** gate total tokens reminder behind CLI switch ([c64c573](https://github.com/kaying-ai/KayingCode/commit/c64c573efc7d706555cf28ba008bc8301dfef4b7))

* **upstream:** reconcile MCP servers from live configuration source ([ead9c72](https://github.com/kaying-ai/KayingCode/commit/ead9c72ac7f740ce25ab1e06c7163eef568f898a))
  * subscribe AgentRuntime to McpConfigurationSource and reconnect on snapshots
  * re-register MCP tools after reconcile and guard stale generations on shutdown
  * fix core zod4 leftovers (issues API, optional Edit.replace_all) so core builds
  * add core reconcile test and stage 3 spec notes

* **upstream:** regionalize plugin store listings ([b0936de](https://github.com/kaying-ai/KayingCode/commit/b0936de5701d4148762a515acd2a12d6fc59d69c))

* **upstream:** resolve late MCP tools and live tool search ([bfe6f6f](https://github.com/kaying-ai/KayingCode/commit/bfe6f6f9b8e593d115df684118ae590ca529f25b))

* **upstream:** retry project token transport failures ([88719fd](https://github.com/kaying-ai/KayingCode/commit/88719fde390b561f8df63c703acf4f29a43ad45c))

* **upstream:** wire token reminder and background subagent prefs ([37f96b9](https://github.com/kaying-ai/KayingCode/commit/37f96b90a32147a823b7530a925fe615f93e7c32))


### Chores

* **upstream:** advance baseline to ZCode 4.0.0 ([430546b](https://github.com/kaying-ai/KayingCode/commit/430546bf98e7404b1f1d888439e81c5218893b4f))


### Documentation

* **spec:** consolidate upstream sync status ([e67391d](https://github.com/kaying-ai/KayingCode/commit/e67391de2438bfa57208bd3b4eab15a64192729b))

* **spec:** record wave 2 MCP, regions and test debt ([f8bbbda](https://github.com/kaying-ai/KayingCode/commit/f8bbbdab3e4eb4cc96280343854e567ab8ce2bb3))

* **spec:** record wave 4 status and remaining parity items ([ec1179a](https://github.com/kaying-ai/KayingCode/commit/ec1179adc45f6eddfe15888498b75970601a8e90))

* **upstream:** mark stage 2/3 delivery status and remaining parity items ([6fe0114](https://github.com/kaying-ai/KayingCode/commit/6fe01147e502f601854bc66fc7e2c6e0711a8e17))


### Refactorings

* **web:** derive upstream source from UPSTREAM_BASE.json ([91e7d0a](https://github.com/kaying-ai/KayingCode/commit/91e7d0ab2e8d58ac4c08d03f56e93b45b8107542))

## [0.2.4](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.2.3...kaying-code-v0.2.4) (2026-11-23)

### Bug Fixes

* **game-center:** register restored projects and bind agent drafts ([1776874](https://github.com/kaying-ai/KayingCode/commit/17768746663de40444a4b3aae2db777d849276ef))
  * Register the restore target through `projectService.saveProject` so the
  * Pass the registered project id in an object contract and open the draft
  * Include local project roots in TapMaker association candidates so
  * Distinguish local/cloud cards with border, corner ribbon and dedicated
  * Cover the flows with unit tests, browser E2E and updated specs.

* **taptap:** match local projects by maker app id ([67be93d](https://github.com/kaying-ai/KayingCode/commit/67be93d8e8cc16d5beb938b35a9b7b46a895f654))

## [0.2.3](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.2.2...kaying-code-v0.2.3) (2026-11-21)

### Features

* **blender:** add explicit add-on installer and doctor next actions ([60359d7](https://github.com/kaying-ai/KayingCode/commit/60359d7550cd4deec5da92bdb17f64c30f108873))
  * 新增 /blender-install 与 blender_setup MCP：默认 dry-run，confirm 后复制固定字节、备份旧副本并以 headless Blender 启用
  * 守卫 Blender 运行中、远端目标、版本未初始化、设置迁移、extensions 副本与启用失败；启用进程禁用 .blend 自动执行
  * doctor 增加 blenderExecutable/blenderVersion/addonsDir 与 nextAction，文档明确 add-on 默认自动启动
  * 补安装器、doctor 和 setup MCP 测试，并用真实 Blender 5.2.1 隔离配置验证持久化
  * 更新插件目录、生成 catalog、spec 与验证记录

* **blender:** ship reference-based modeling workflow in 0.2.0 ([6e4785f](https://github.com/kaying-ai/KayingCode/commit/6e4785f0a2cd6545c6417b1c1918d59bcd6f51fe))
  * sync bundled mcp-for-blender to b6a2ce3 with pinned license notices
  * add /blender-from-reference command, skill reference and asset checker
  * keep original look screenshots through the core MCP image budget
  * cover preview normalization and register CI verification steps


### Bug Fixes

* **blender:** harden snapshot verification and asset input checks ([d10cb14](https://github.com/kaying-ai/KayingCode/commit/d10cb1474df554ce04a6c9a13ad35f6fad4c780f))
  * 快照不一致时列出路径，识别 Windows 旧检出留下的 CRLF 漂移并给出恢复方式，补齐缺失/额外/等量替换回归
  * asset-check 在读取场景前校验 requirements、target、unit_scale 和 tolerance，非法输入返回字段级错误
  * 补充 Blender look 在无 artifactStore 时的内联缩略图回退测试
  * 更新 README、spec 与 Windows 验证记录，移除重复过期的评估文档

* **blender:** make doctor next-action test independent of local runtime cache ([abfc8c6](https://github.com/kaying-ai/KayingCode/commit/abfc8c6717dcf068c33413b172a48c70902352da))

* **blender:** point doctor at opening Blender when the port is closed ([b6ff912](https://github.com/kaying-ai/KayingCode/commit/b6ff912b684302681ad390cc342c71a48cab99a6))

## [0.2.2](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.2.1...kaying-code-v0.2.2) (2026-11-18)

### Features

* **model-provider:** make Z.ai and BigModel presets API-key providers ([d3362a5](https://github.com/kaying-ai/KayingCode/commit/d3362a5e2431b4fbc2d5e5fc3f46f11b38a074fb))
  * add zai-standard-api and bigmodel-standard-api builtin provider rules
  * point settings presets at built-in API-key providers and remove OAuth copy
  * save welcome-page API keys as sparse personal overlays
  * add spec and regression tests

## [0.2.1](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.2.0...kaying-code-v0.2.1) (2026-11-16)

### Bug Fixes

* **taptap:** restore transcription comparison and update Maker ([92bdb63](https://github.com/kaying-ai/KayingCode/commit/92bdb63236b49ef78e3732e1006a77109a326905))


### Documentation

* **release:** record 0.2.0 tag retargets ([3db51fb](https://github.com/kaying-ai/KayingCode/commit/3db51fbe4014e055fbf88318a2275a3616c5bc31))

## [0.2.0](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.5...kaying-code-v0.2.0) (2026-11-15)

### Features

* **context-composition:** wire composition query end to end ([42c5cc3](https://github.com/kaying-ai/KayingCode/commit/42c5cc3701ebdf2d391664beff7f126953411aa8))

* **context:** add structured instruction file foundation ([219c3f5](https://github.com/kaying-ai/KayingCode/commit/219c3f5d598918e96faa758c5316ccb6be23322a))
  * core/context/sections/instruction-files: file block, full and delta
  * context types: InstructionFile, InstructionRefreshReason and
  * contracts: CONTEXT_SOURCE_INSTRUCTIONS_READ_FAILED
  * adapters: only ENOENT/EISDIR/ENOTDIR mean "no instruction file";
  * tests: instruction-files 5 cases (trim/hash, rendering, strict parse,

* **context:** add the total tokens budget and reminders ([7f8ad6a](https://github.com/kaying-ai/KayingCode/commit/7f8ad6a4fd80bc2e02926ba5d3d5e6b9de58c828))
  * add context/total-tokens with the fixed 15M budget, the system line and
  * add total-tokens-budget: consume keeps the used amount monotonic,
  * runtime keeps the counter in memory, resets it on resume, and rolls it
  * input attachment collection now records its reason and passes
  * steering diagnostics expose userSteered; total_tokens_reminder is a
  * tests: budget 4/4, announcements 47/47, tool hook context 2/2

* **context:** announce instruction file changes as deltas ([03e1d7c](https://github.com/kaying-ai/KayingCode/commit/03e1d7cc1180cabf1ffb06fea1e96bfb00f09f48))
  * request-user-context builds structured instruction files; the context
  * message history and the hydrator persist/restore the instructions
  * context-refresh compares announced files with the current build and
  * restored announcements no longer rewrite context_prefix in place, so
  * context.ts adds rereadInstructionSources/buildRereadInstructionContext/
  * compact-active re-reads in parallel, uses the result for the leading
  * update three announcement tests to the delta semantics

* **context:** order assistant blocks by their arrival index ([dedc772](https://github.com/kaying-ai/KayingCode/commit/dedc772a421e46b75d177f56934fa7e399924c86))
  * contracts: text/reasoning/tool parts carry blockIndex; add
  * adapters: orderedAssistantItems sorts by blockIndex and strips the
  * core: streaming and non-streaming paths assign indexes and persist
  * legacy messages without indexes keep the old content-then-tools
  * pluginDiscoveryUi is added as an unwired default-false field for type
  * request context-composition recording is intentionally not adopted

* **credential:** add remote server v2 format gate ([f99e313](https://github.com/kaying-ai/KayingCode/commit/f99e31321109c2ac6db342f6984cdf047f52d0e6))

* **credential:** adopt enc:v2 system keyring for desktop ([6465e64](https://github.com/kaying-ai/KayingCode/commit/6465e64f6781dfb65e35a0072075fe67a611b25e))

* **diagnostics:** adopt ZCode 3.18.1 memory allocation diagnostics ([632f6ac](https://github.com/kaying-ai/KayingCode/commit/632f6ace6eaaa40520c36ed2e454234df2e7effb))
  * new adapters/memory-diagnostics: inspector sampling recorder, atomic
  * resource sampler starts a 15 s allocation diagnostic alongside the
  * records land under ~/.kayingcode/cli/memory-diagnostics (product path
  * protocol server collectMemoryDiagnostics({ includeEventStats: false })
  * v4 gateway adds hydration/history-opening/binary-cache counters
  * shared: CliMemoryDiagnostic sanitizer and retention limits;
  * SOURCE_PACKAGES regenerated for the new adapter entry
  * memory-diagnostics recorder test 10/10 (local vitest config, upstream
  * shared/contracts/adapters/bootstrap/cli and root typecheck pass
  * root lint 0 errors; source:check; architecture:check --changed

* **plugin:** add app-control and extension gateway ([b2fd9d3](https://github.com/kaying-ai/KayingCode/commit/b2fd9d3baeda3ff8a53c2ba5369d04884e6e7b98))
  * add app-control session facade and Host wiring via an in-process handle
  * add extension service, capability gateway, grants store and session backends
  * add shared app-control protocol plus plugin host query methods
  * support extension input sources, command query turns and model request metrics
  * allow extension view sandbox provenance and forward/cold message reads

* **plugin:** add extension host process and supervisor ([409d3df](https://github.com/kaying-ai/KayingCode/commit/409d3df5309a82febffcae6bbb052a450499abff))
  * add the singleton utility process, extension registry and activation transactions
  * add the Main supervisor with crash budget, probes, log ring and window pairing
  * start the host from Main and register extension services in the local Window Host
  * build extension-host as a dedicated tsup entry with the MCP SDK inlined
  * cover env allowlisting, pairing and crash-budget exhaustion

* **plugin:** add session-control model tools and bindings ([c15f373](https://github.com/kaying-ai/KayingCode/commit/c15f3738f2b67464ea8bd40320d0269f4fe683e2))
  * add model-facing session tools with injected request identity and retry reconciliation
  * add App reverse-RPC binding and standalone CLI/TUI runtime
  * verify caller workspace and root session against the active CLI connection
  * register session tools by trusted launch kind and keep ListModels for CreateSession
  * propagate timeout/cancel reconciliation notes into model-visible errors

* **plugin:** adopt upstream built-in plugins ([f2c0206](https://github.com/kaying-ai/KayingCode/commit/f2c0206e3860ae85253a462ab138eedaab076679))

* **plugin:** align manifest loading with upstream ZCode ([4b01a6b](https://github.com/kaying-ai/KayingCode/commit/4b01a6b980cfc69193dc963ed2788fb8cd803040))
  * add type-only plugin-api 1.4.0 and session-control contracts
  * add shared extension-host manifest, grants and slots validation
  * prefer .zcode-plugin manifests while keeping .kayingcode-plugin fallback
  * expand ZCODE_* and KAYINGCODE_* variables across MCP, commands, hooks and skills
  * stage both manifest layouts and root placeholders with fail-closed MCP checks

* **plugin:** restore extension slots and MCP app UI ([3db9e94](https://github.com/kaying-ai/KayingCode/commit/3db9e94bebcd12bb26cbeb89c7213cb627ee2fc9))
  * restore the plugin-ui page host for MCP Apps and Gen UI
  * add extension slots stores, hooks and components for five slots
  * mount composer status, mention, nav, side-pane launcher and file viewer routing
  * add extension logs and view side-pane tabs plus grant/permission sections
  * expose extension services through the desktop base service accessor
  * add extension test ids and localized UI text

* **ui:** add the macOS font smoothing preference ([0134188](https://github.com/kaying-ai/KayingCode/commit/01341884b85cd43504e1b808b44630a4cb009427))
  * store: fontSmoothingEnabled (default on) with local persistence under
  * settings: Appearance shows a "Font smoothing" switch only on macOS
  * styles: grayscale antialiasing only under
  * the local SettingsRow has no settings-search searchId yet, so the

* **ui:** adopt ZCode 3.18 image preview actions ([85652ce](https://github.com/kaying-ai/KayingCode/commit/85652ce9132a3e899b2226c370845b1a80e21078))
  * new ImagePreviewActions: copy, download, save-and-open, save a copy
  * ImagePreviewSurface gains onDownload/downloading and a navigation
  * new lib/imagePreviewDownload and lib/copyPreviewImage; the dialog
  * new useImageFilePreview and ConversationImageFileMention; the mention
  * 10 new en-US/zh-CN keys; CONTRACT.md updated
  * product exclusions: the design-mode element mention (zcode-element)

* **ui:** adopt ZCode 3.18 working orb with KayingCode KY brand ([74f29bd](https://github.com/kaying-ai/KayingCode/commit/74f29bd918be78d958610a7c490950eff9fb6644))
  * Morph target is KayingCode's "KY" instead of upstream ZCode's "Z":
  * Icon slot stays 16 px; reduced motion shows a static KY
  * Timer now displays whole seconds (formatRunningWorkDuration) and the
  * styles: add .animated-gradient-text-foreground, remove the now-unused
  * specs and modelRetryProgress E2E updated for the orb and "0 seconds"

* **upstream:** adopt ZCode 3.18.2 background subagent stall reminder ([e591ed2](https://github.com/kaying-ai/KayingCode/commit/e591ed2e4e75b791d6a3d8bf60d6dff9544788ba))
  * core: new background-stall clock and parent reminder; notify after 15
  * registry: local_agent activity snapshot (last progress, running tools,
  * runner: executionId lifecycle and stop-identity checks, failure
  * notifications: stall reminders are excluded from background result
  * contracts: SubagentTaskSnapshot.executionId, SubagentStopOptions.
  * config: backgroundStallNotifyMs / backgroundStallMaxIntervalMs
  * background-subagent-stall 22/22 (upstream regression)
  * core suite 223/229; the 6 failures are the same Windows-only
  * contracts, core, adapters, bootstrap, cli typechecks; root typecheck,

* **upstream:** adopt ZCode 3.18.2 security and stability fixes ([eca1833](https://github.com/kaying-ai/KayingCode/commit/eca1833613be6878f02c8583b47efb3ee86a3cec))
  * dynamic-workflow: vm escape fix (null-prototype sandbox, closure-scoped
  * adapters: proxy fetch keeps the caller's abort signal and the request
  * node-repl-host: tool contract now states the kernel runs unsandboxed and
  * core: prompt snapshot session entry; main-session system bytes are
  * shared: relay reconnect spread after acknowledgement plus heartbeat
  * ui: QueuedSummaryContent React #185 fix (static path bypasses animated
  * root typecheck; lint 0 errors; source:check; architecture:check --changed
  * CLI package typechecks: contracts, core, adapters, bootstrap, cli
  * prompt-snapshot 14/14; core suite 201/207 (6 Windows-only env failures)
  * sandbox smoke test: process escape blocked with ReferenceError


### Bug Fixes

* **plugins:** make plugin file writes and reads transaction-safe ([2b4e1dc](https://github.com/kaying-ai/KayingCode/commit/2b4e1dcd9ff7c13cae3e8b47f3b7d8ecc9298b28))
  * helpers: add writePluginTextIfChanged; identical bytes skip the write,
  * atomic-directory: take the upstream transaction parser plus
  * marketplace: use write-if-changed for JSON writes; add
  * regression: plugins-atomic-write covers nested creation, content

* **remote-projects:** release address reservations for removed profiles ([f460116](https://github.com/kaying-ai/KayingCode/commit/f4601169bc2c7fef0d237366f43e043b3e2be754))
  * add findRemoteProjectHostIdForProfile (null instead of throwing for
  * release only for unbound profiles (no sourceServerId), only when no
  * source server management gains releaseUnboundProfileHost and calls it
  * export the new entries from services/node and document the contract
  * regression: membership release cases, 6/6

* **session-data:** guard symlinked storage roots on deletion ([e9f6805](https://github.com/kaying-ai/KayingCode/commit/e9f6805c274ed978911d8c997e5439444a444f25))
  * add SessionDataFile and optional listSessionFiles, with entries sorted
  * before measuring or deleting a storage category, reject the path when
  * removeSession accepts retained artifact ids: referenced attachment
  * port the upstream node implementation and behaviour tests

* **ui:** make the KY working orb bolder and squarer ([fe38bf5](https://github.com/kaying-ai/KayingCode/commit/fe38bf56298ed47f5429e1fe6c2a20e1d56349d5))
  * Rebuild ORB_BRAND_POINTS from the letter strokes again: 35 points,
  * Grow target dots from r=0.5 to r=0.7 during the morph so the strokes
  * Reduced-motion static KY uses the bold radius
  * Update the loading spec and the 3.18 adoption record

* **ui:** thicken the KY working orb strokes ([5e727a3](https://github.com/kaying-ai/KayingCode/commit/5e727a391bc93d11cdac03913998869a8cd6521f))


### Chores

* **licenses:** refresh third-party notices for 0.2.0 ([f421ea0](https://github.com/kaying-ai/KayingCode/commit/f421ea0ea0182713ecbfe6607d09e1aea7d2fb95))

* **upstream:** pin mobile web and advance base to 3.18.2 ([3c263f4](https://github.com/kaying-ai/KayingCode/commit/3c263f40d946dc2421ee04b3b6d2fa62b1b1745a))


### Documentation

* **release:** record 0.2.0 preflight deviation ([adbec80](https://github.com/kaying-ai/KayingCode/commit/adbec80b1e7f47c9b9c24baacabe90db505cbe91))

## [0.1.5](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.4...kaying-code-v0.1.5) (2026-11-13)

### Features

* **taptap:** add lighting audit and per-file sampling ([2521880](https://github.com/kaying-ai/KayingCode/commit/2521880623385072e0eea561fd8a811aa7252dd1))
  * add a lighting topic for tone mapping, shadow bias/camera, tsun and post-processing
  * sample long topics per file (first/last 400) so late game code is not truncated
  * narrow the tsun pattern to the quoted source token
  * skip game.bundle.js when game.pretty.js exists

* **taptap:** add source audit and compare acceptance gate ([af48c1c](https://github.com/kaying-ai/KayingCode/commit/af48c1cfb986d1b10cf36799d53c0481ce9efbee))
  * add t3m audit with control-flow, shader, material, model, animation and UI evidence
  * include a GLB material table (clearcoat/emissiveStrength/doubleSided/COLOR_0)
  * skip *.bundle.js when its readable *.pretty.js exists
  * reject accept when side-pane compare metrics are missing, failed or stale
  * keep non-side-pane compare evidence as a warning for fallback workflows
  * update commands, references and policy tests

* **taptap:** close replay P0/P1 evidence gaps ([53b1470](https://github.com/kaying-ai/KayingCode/commit/53b1470e322485f2f4016128baafd12ea8792ad7))
  * add rb/ab/return-null control-flow patterns and library hit counts
  * add target-consistency report via audit --target
  * warn when gameplay screenshots are older than the latest scripts
  * validate visual_fixes source_evidence row by row
  * reject compare evidence without visual_review_mode
  * add compare profile state/freeze and a Turbo Tails golden fixture

* **taptap:** warn on missing source evidence at accept ([602188b](https://github.com/kaying-ai/KayingCode/commit/602188bd02ea3043816c1ccd6a7270fd14cba39f))
  * create source/SOURCE_NOTES.md and source/audit/ templates on init
  * warn when SOURCE_NOTES is missing, empty, unfilled or lacks file:line
  * warn when visual_fixes or gameplay_screenshot artifacts are missing
  * keep runtime_log/maker_url as hard gates and --force as the escape hatch
  * cover the warning branches with native unit tests


### Bug Fixes

* **taptap:** discover comparison guests through Browser Use ([564dbb9](https://github.com/kaying-ai/KayingCode/commit/564dbb9e209e3e0c3113e01bb8c7f77b024b2abe))
  * prepare_visual_comparison 成功响应返回回执 tab group，并提示在当前桌面会话探测、认领双 guest、串行截图后用 t3m compare
  * 新增 buildPluginBrowserCompareTabGroup，UI 与 MCP 共用同一组名构造，避免两边字符串漂移
  * 续做任务按当前会话重新探测，不沿用历史 Browser Use 错误；原始 PNG 先复制到工作区证据目录再交给转写 MCP
  * 同步 SKILL、visual-compare 参考与 preview-workflow spec，新增 MCP 端到端测试

* **ui:** preserve selected project when trying a plugin ([adfc469](https://github.com/kaying-ai/KayingCode/commit/adfc469ca3d75ee0c1ac296ead06fd74b85e041c))


### Documentation

* **agents:** document automated release workflow ([6ac70ec](https://github.com/kaying-ai/KayingCode/commit/6ac70ecce996c84e977ae7cbd9aa7b96df983dca))

* **taptap:** add real-project replay evaluation ([e5ac8ac](https://github.com/kaying-ai/KayingCode/commit/e5ac8ac01615a9c224961646d3eb59c583c49b69))

* **taptap:** add transcription plugin optimization handoff ([6dd824e](https://github.com/kaying-ai/KayingCode/commit/6dd824e98d38c8edc90f561997c5dbff59c74f53))

* **taptap:** enforce source-first transcription workflow ([57bfaf1](https://github.com/kaying-ai/KayingCode/commit/57bfaf120b6fe10162b9d4b6c3144435b4efcbb1))
  * add the source-first iron rule: screenshots identify differences,
  * add read-only subagent policy and contract for parallel audits
  * add source audit checklists: control flow, custom shaders, materials,
  * require SOURCE_NOTES, visual_fixes evidence and deterministic compare
  * add Turbo Tails anti-patterns and policy regression tests

* **taptap:** record P0/P1 commit in handoff status ([2074f9d](https://github.com/kaying-ai/KayingCode/commit/2074f9d6fdc2158592884766f407ef9c695260a8))

* **taptap:** record phase 2 commit in handoff status ([07e5d38](https://github.com/kaying-ai/KayingCode/commit/07e5d3860c88e663bf069f9cdeb522b529b2b0e6))

* **taptap:** record phase 3 commit in handoff status ([bcc956d](https://github.com/kaying-ai/KayingCode/commit/bcc956d59aea9579bac4cb8e4e3bd90933e54aa0))

* **taptap:** record replay commits in handoff status ([84f52b1](https://github.com/kaying-ai/KayingCode/commit/84f52b13329d7f9cc122b15ed4b89ed97f541279))

## [0.1.4](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.3...kaying-code-v0.1.4) (2026-11-11)

### Features

* **mobile:** add Russian UI locale ([637a3c2](https://github.com/kaying-ai/KayingCode/commit/637a3c20a84045e9bb26c5d9bc2ca0cb47c587d0))


### Bug Fixes

* restore project picker and embedded browser panels ([ef93fcc](https://github.com/kaying-ai/KayingCode/commit/ef93fcc06fd8aec49ba546f2fb3e58505d42e4df))
  * resolve selected project cwd through Host prepareSession and keep
  * retain plugin uiContributions in PluginMetadata so TapTap
  * consume the injected node_repl browser broker env and send
  * allow the TapTap preview partition in BrowserViewLoadUrl owner


### Documentation

* **mobile:** add Russian RuStore screenshots ([9c77d51](https://github.com/kaying-ai/KayingCode/commit/9c77d51b273fedb52af0c7623d00cf15fa73c43b))

* **review:** add review environment runbook ([84ccc19](https://github.com/kaying-ai/KayingCode/commit/84ccc192c779aa246a2a8a5919ab418c0f691468))
  * add step-by-step Ubuntu host deployment and link issuance runbook
  * document fixed Xvfb + VNC + xclip flow for headless hosts
  * link the runbook from deployment index and review docs

## [0.1.3](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.2...kaying-code-v0.1.3) (2026-11-10)

### 设置

- 新增「显示未读角标」开关（默认关闭），macOS Dock、Linux LauncherEntry 与 Windows 任务栏显示未读任务数量。
- 任务通知总开关关闭时角标开关置灰；关闭角标只上报 0，不清除未读状态，侧栏蓝点保持不变。
- `ProjectDirectoryProvider` 成为唯一上报者；多窗口取最大值，关闭窗口或卸载工作区后不再残留旧计数。

### 手机远控

- 「设置 → 远程设备」新增自定义 HTTPS Relay 地址，二维码、复制链接、设备注册/账号邀请、V2 HTTP 与 WebSocket 统一使用同一 origin。
- 修改地址后既有远控会话挂起，旧二维码不可复用；清空输入恢复部署默认 origin。

### 审核环境

- Relay 邀请与终端 TTL 支持按天配置，邀请可设置领取次数。
- Web 重开同一邀请时复用既有会话。
- Desktop 支持通过进程环境覆盖 Relay origin，用于自托管审核主机。
- Agent 审核 Token 预算支持环境级与会话级范围。
- 审核备注支持精简移动端链接，适配微信 200 字符限制。

### 界面

- 采用上游工作态加载指示器：像素轨道动画、working 文案与按轮次耗时计时的十分之一秒计时器，兼容深色主题、减弱动效与中英文文案。

### 文档与构建

- 新增开发与贡献指南、上游 ZCode 同步流程说明。
- 补充 Ubuntu 审核主机、应用审核部署与自托管 Relay 文档，新增移动端商店截图库。
- 签名构建全部成功后由 GitHub Actions 自动汇总制品并发布 Release。

## [0.1.2](https://github.com/kaying-ai/KayingCode/compare/kaying-code-v0.1.1...kaying-code-v0.1.2) (2026-11-09)

### 许可与合规

- 项目根许可切换为 GNU AGPL-3.0（SPDX：`AGPL-3.0-only`），新增中英文隐私声明与商用授权说明。
- 上游 ZCode 派生部分继续适用 Apache-2.0；内置插件与第三方组件保留各自声明的许可。

### 文档与下载

- README 顶部新增 Windows、macOS、Linux、Android 下载入口与当前版本说明。
- 补充联系与交流方式（微信二维码、service@kayingai.com）。
- 恢复内置插件总览与协议评估文档。

### 构建

- Windows 验签门禁允许自签或未受信任根证书，仍要求安装器带签名并记录验签诊断。

## 0.1.1

- 修复浏览器生命周期与 TapTap Maker 预览路由，预览面板复用平台预览链路。
- 内置 kaying-for-taptap 插件升至 `0.1.1`，随包分发重建的原生运行时（core / t3m）。
- 新增游戏开发插件展示、插件技能详情与游戏试玩插件。
- 移动端支持 ZCode v2 与平台专属接入，补充简体中文、繁体中文与英文文案。
- 加固 macOS 签名与公证流程，安装包发布前仍需完成签名、许可与更新源验收。

## 0.1.0 (unreleased)

- 首次公开源码基线，版本从 `0.1.0` 开始。
- Desktop、Android 和 iOS 使用新的安装标识；旧产品不承诺原位升级或自动迁移。
- 发布安装包前仍需通过签名、许可、设备与更新源验收。本条目不表示制品已经发布。

本项目衍生自 ZCode；上游归属和第三方声明见 [README.md](README.md)、[LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。旧产品的 3.x 发布记录保留在旧仓库历史中，不构成新产品的连续升级记录。
