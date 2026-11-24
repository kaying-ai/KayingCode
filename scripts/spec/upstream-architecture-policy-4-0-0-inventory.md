# 上游架构策略盘点（4.0.0）

生成时间：2026-11-24T06:28:49.004Z
上游：`upstream/main`

> 由 `scripts/upstream-architecture-policy-inventory.mjs` 生成，不要手改。

## 汇总

| 项目 | 数量 |
| --- | --- |
| 上游模块 | 149 |
| roots 全部存在 | 81 |
| 部分 roots 缺失 | 16 |
| roots 全部缺失（候选例外） | 52 |
| 产品模块 | 32 |
| 产品独有模块 | 18 |
| 与产品同 ID | 14 |

## roots 缺失的模块

| 模块 | 状态 | 缺失 roots |
| --- | --- | --- |
| `windows-runtime-host` | all-missing | `packages/services/src/windows-runtime-host` |
| `cli-session-control-runtime` | partial | `apps/zcode-cli/packages/bootstrap/tests/cli-session-control/vitest.config.ts` |
| `cli-session-fork-commit` | all-missing | `apps/zcode-cli/packages/core/src/runtime/session-fork-commit` |
| `cli-conversation-materialization` | all-missing | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization` |
| `app-control-navigation` | all-missing | `packages/desktop/src/app-control-navigation` |
| `design-runtime` | all-missing | `packages/design-runtime/src` |
| `agent-crash-diagnostic` | all-missing | `packages/shared/src/agent-crash-diagnostic` |
| `gen-ui` | all-missing | `packages/ui/src/gen-ui` |
| `project-workflow` | all-missing | `packages/ui/src/project-workflow` |
| `cli-subagent-config` | partial | `apps/zcode-cli/packages/bootstrap/tests/runtime-subagents` |
| `cli-session-execution` | partial | `apps/zcode-cli/packages/bootstrap/tests/session-execution`<br>`apps/zcode-cli/packages/core/tests/permission-full-access.test.ts` |
| `web-remote-control` | all-missing | `packages/web/src/web-remote-control` |
| `cli-arguments` | partial | `apps/zcode-cli/packages/cli/tests/argument-parsing` |
| `workflow-tool-entrypoints` | partial | `apps/zcode-cli/packages/core/tests/workflow-entrypoints` |
| `bash-cmd-readonly-policy` | all-missing | `apps/zcode-cli/packages/core/src/tool/cmd-readonly`<br>`apps/zcode-cli/packages/core/src/tool/handlers/bash-cmd-readonly-policy.ts`<br>`apps/zcode-cli/packages/core/tests/cmd-readonly` |
| `mcp-runtime` | partial | `apps/zcode-cli/packages/core/src/mcp/runtime`<br>`apps/zcode-cli/packages/adapters/src/mcp/tool-catalog-cache.ts`<br>`apps/zcode-cli/packages/adapters/src/mcp/config-source.ts`<br>`apps/zcode-cli/packages/adapters/src/mcp/config-loader.ts`<br>`apps/zcode-cli/packages/adapters/src/mcp/transport-errors.ts`<br>`apps/zcode-cli/packages/bootstrap/src/app/dynamic-mcp-config.ts`<br>`apps/zcode-cli/packages/core/tests/mcp`<br>`apps/zcode-cli/packages/core/tests/mcp-runtime-fixture.ts` |
| `live-config-watch` | all-missing | `apps/zcode-cli/packages/adapters/src/watch`<br>`apps/zcode-cli/packages/adapters/src/plugins/live-inventory.ts`<br>`apps/zcode-cli/packages/adapters/tests/watched-source-directories.test.ts` |
| `skill-live-catalog` | all-missing | `apps/zcode-cli/packages/core/src/skills`<br>`apps/zcode-cli/packages/adapters/src/skills/catalog.ts`<br>`apps/zcode-cli/packages/bootstrap/src/app/dynamic-skill-catalog.ts`<br>`apps/zcode-cli/packages/adapters/tests/skill-catalog.test.ts`<br>`apps/zcode-cli/packages/core/tests/skills-listing.test.ts` |
| `plugin-discovery` | all-missing | `apps/zcode-cli/packages/adapters/src/plugins/discovery`<br>`apps/zcode-cli/packages/adapters/tests/plugin-discovery` |
| `tool-result-settlement` | partial | `apps/zcode-cli/packages/core/tests/tool-result-settlement` |
| `remote-input-prediction` | partial | `packages/services/src/zcode-agent/inputPredictionSwitch.ts` |
| `context-composition` | partial | `packages/services/src/zcode-agent/contextCompositionClient.ts` |
| `plugin-host-queries` | all-missing | `packages/shared/src/kayingcode-protocol/plugin-host-queries`<br>`apps/zcode-cli/packages/adapters/src/config/plugin-secrets.adapter.ts`<br>`apps/zcode-cli/packages/bootstrap/src/plugin-secrets.ts`<br>`apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-user-options.ts`<br>`apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-mention-items.ts`<br>`packages/services/src/zcode-agent/pluginHostQueriesClient.ts` |
| `remote-resident-rows-range` | all-missing | `packages/services/src/zcode-agent/resident-rows-range` |
| `agent-plugin-discovery` | all-missing | `apps/zcode-cli/packages/bootstrap/src/plugin-discovery`<br>`apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-discovery-port.ts`<br>`apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-install-interaction.ts`<br>`apps/zcode-cli/packages/contracts/src/interfaces/plugin-discovery.port.ts`<br>`apps/zcode-cli/packages/contracts/src/tools/plugin-discovery.ts`<br>`apps/zcode-cli/packages/core/src/tool/handlers/plugin-discovery.ts` |
| `plugin-install-interaction` | all-missing | `packages/shared/src/plugin-discovery`<br>`packages/shared/src/plugin-store-visibility.ts`<br>`packages/shared/src/kayingcode-protocol-v4/pluginInstall.ts`<br>`packages/ui/src/v4/PluginInstallCard.tsx`<br>`packages/ui/src/settings/PluginAutoRecommendationSetting.tsx` |
| `tool-discovery` | partial | `apps/zcode-cli/packages/core/src/tool/handlers/wait-for-mcp-servers.ts`<br>`apps/zcode-cli/packages/contracts/src/tools/wait-for-mcp-servers.ts`<br>`apps/zcode-cli/packages/core/tests/tool-search` |
| `node-repl-call-ledger` | all-missing | `apps/zcode-cli/packages/node-repl-host/src/call-ledger`<br>`apps/zcode-cli/packages/node-repl-host/test/call-ledger` |
| `tool-search-comparison` | partial | `apps/zcode-cli/tools/prompt-trajectory/src/tool-search-comparison.ts` |
| `window-topic-resource-relay` | partial | `packages/desktop/test/topic-resource-relay` |
| `channel-reply-tool` | partial | `apps/zcode-cli/packages/core/tests/channel-reply` |
| `topic-resource-tool` | all-missing | `apps/zcode-cli/packages/core/src/tool/topic-resource`<br>`apps/zcode-cli/packages/core/src/tool/handlers/read-topic-resource.ts` |
| `bot-topic-history-attachment` | partial | `packages/services/src/bots/topic-history-attachment` |
| `composer-toolbar-layout` | partial | `packages/ui/src/composer-toolbar-layout`<br>`packages/ui/test/composer-toolbar-layout` |
| `conversation-share-interaction` | all-missing | `packages/ui/src/conversation-share-interaction` |
| `workspace-plugin-preview` | all-missing | `packages/ui/src/workspace-plugin-preview` |
| `marketing-touch-controller` | all-missing | `packages/ui/src/marketing-touch-contract`<br>`packages/ui/src/components/marketing-touch/marketingTouchController.ts` |
| `data-sync-service` | all-missing | `packages/services/src/data-sync` |
| `voice-input-service` | all-missing | `packages/services/src/voice-input` |
| `provider-provisioning-status` | all-missing | `packages/services/src/provider-provisioning-status` |
| `data-sync` | all-missing | `packages/ui/src/data-sync` |
| `voice-input` | all-missing | `packages/ui/src/voice-input` |
| `settings-scope` | all-missing | `packages/ui/src/settings-scope` |
| `side-pane-full-view` | all-missing | `packages/ui/src/side-pane-full-view` |
| `local-ttft-renderer` | all-missing | `packages/ui/src/v4/telemetry/local-ttft` |
| `local-ttft-desktop` | all-missing | `packages/desktop/src/renderer/src/local-ttft` |
| `zcode-site-panel` | all-missing | `apps/zcode-cli/packages/zcode-site-plugin/src` |
| `web-platform` | all-missing | `packages/web/src/platform` |
| `conversation-user-input-presentation` | all-missing | `packages/ui/src/conversation-user-input-presentation`<br>`packages/ui/src/v4/ConversationUserInputBubble.tsx` |
| `cli-plugin-startup-budget` | all-missing | `apps/zcode-cli/packages/bootstrap/src/plugin-startup-budget` |
| `composer-edit-mode` | all-missing | `packages/ui/src/composer-edit-mode` |
| `desktop-microphone-access` | all-missing | `packages/desktop/src/main/microphone-access` |
| `web-share-manage` | all-missing | `packages/web/src/share-manage` |
| `managed-worktree-shared` | all-missing | `packages/shared/src/managed-worktree` |
| `managed-worktree-repo` | all-missing | `packages/services/src/git/managed-worktree` |
| `managed-worktree-tasks` | all-missing | `packages/services/src/managed-worktree-tasks` |
| `managed-worktree-ui` | all-missing | `packages/ui/src/managed-worktrees` |
| `session-tool-presentation` | all-missing | `packages/ui/src/ToolCallBlocks/session` |
| `selection-comment` | all-missing | `packages/ui/src/selection-comment` |
| `preinstalled-tools-contract` | all-missing | `packages/shared/src/preinstalled-tools` |
| `desktop-preinstalled-tools` | all-missing | `packages/desktop/src/preinstalled-tools` |
| `ui-preinstalled-tools` | all-missing | `packages/ui/src/preinstalled-tools` |
| `settings-search` | all-missing | `packages/ui/src/settings-search` |
| `task-row-hover` | all-missing | `packages/ui/src/task-row-hover` |
| `cli-memory-diagnostics` | partial | `packages/desktop/scripts/cli-diagnostic-evidence-smoke.mjs`<br>`packages/services/src/zcode-agent/agentStderrCollector.ts` |
| `workspace-plugin-trust` | all-missing | `apps/zcode-cli/packages/bootstrap/src/workspace-plugin-trust` |
| `workspace-plugin-declaration` | all-missing | `apps/zcode-cli/packages/adapters/src/plugins/workspace-plugin-declaration` |
| `windows-git-bash-discovery` | all-missing | `packages/shared/src/node/windowsGitBashDiscovery` |

## 与产品同 ID 的模块

| 模块 | 上游 managed | 产品 managed | 上游 owner | 产品 owner |
| --- | --- | --- | --- | --- |
| `rpc` | false | false | — | — |
| `shared` | false | false | — | — |
| `provider` | false | false | — | — |
| `provider-node` | false | false | — | — |
| `services` | false | false | — | — |
| `session` | false | false | conversation | conversation |
| `storage` | true | true | desktop-settings | desktop-settings |
| `client` | false | false | — | — |
| `server` | false | false | — | — |
| `zcode-server-cli` | false | false | — | — |
| `ui` | false | false | — | — |
| `web` | false | false | — | — |
| `desktop` | false | false | — | — |
| `formal-proof` | false | false | — | — |

## 产品独有模块

| 模块 | managed | owner | roots |
| --- | --- | --- | --- |
| `agent-gateway` | true | remote-agent | `packages/agent-gateway/src` |
| `product-site` | false | — | `apps/kayingcode-site` |
| `agent-cli-types` | false | — | `apps/zcode-cli/packages/shared-types/src` |
| `agent-contracts` | false | — | `apps/zcode-cli/packages/contracts/src` |
| `agent-runtime` | false | — | `apps/zcode-cli/packages/core/src` |
| `agent-adapters` | false | — | `apps/zcode-cli/packages/adapters/src` |
| `agent-bootstrap` | false | — | `apps/zcode-cli/packages/bootstrap/src` |
| `agent-i18n` | false | — | `apps/zcode-cli/packages/i18n/src` |
| `agent-telemetry` | false | — | `apps/zcode-cli/packages/telemetry/src` |
| `terminal-ui` | false | — | `apps/zcode-cli/packages/tui/src` |
| `dynamic-workflow` | false | — | `apps/zcode-cli/packages/dynamic-workflow/src` |
| `dynamic-workflow-runtime` | false | — | `apps/zcode-cli/packages/dynamic-workflow-runtime/src` |
| `node-repl-host` | false | — | `apps/zcode-cli/packages/node-repl-host/src` |
| `plugins` | false | — | `plugins` |
| `kayingcode-cli` | false | — | `apps/zcode-cli/packages/cli` |
| `relay-cloudflare` | true | mobile-access | `apps/kayingcode-relay-cloudflare/src` |
| `mobile-client-core` | true | mobile-access | `packages/mobile-client-core/src` |
| `mobile` | true | mobile-access | `apps/kayingcode-mobile-taro/src` |

## global 差异

| 字段 | 上游 | 产品 |
| --- | --- | --- |
| `newFilesEnforcedSince` | "2026-09-10" | — |
| `acceptedUpstreamCommits` | [] | — |
| `maxFileLines` | 800 | 400 |
| `maxContractLines` | 300 | 300 |
| `maxPublicMethods` | 12 | 12 |
| `forbidCycles` | true | true |
| `forbidDeepImports` | true | true |
| `managedOnly` | true | true |
| `acceptedUpstreamSnapshot` | "scripts/architecture/upstream-snapshot.json" | — |
