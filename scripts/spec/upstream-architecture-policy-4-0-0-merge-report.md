# 上游架构策略合并报告（4.0.0）

> 由 `scripts/upstream-architecture-policy-merge.mjs` 生成，不要手改。
> 新增上游模块默认 `managed: false`，先登记边界；各阶段切到上游结构并清零 violations 后再逐个启用。`--manage-added` 可直接生成启用版。

## 汇总

| 项目 | 数量 |
| --- | --- |
| 候选策略模块 | 99 |
| 纳入的上游模块 | 67 |
| 延后的上游模块（roots 缺失） | 68 |
| 与产品同 ID（产品优先） | 14 |
| 剔除的 requires | 6 |
| 剔除的 publicEntrypoints | 20 |
| 剔除的 exceptions | 31 |

## 纳入的上游模块

- `session-control`
- `app-control-protocol`
- `app-control`
- `cli-session-control-tools`
- `cli-session-control-bootstrap`
- `cli-active-transcript`
- `stream-animate`
- `e2e-report`
- `zcode-cli`
- `conversation-telemetry-engine`
- `conversation-telemetry-service`
- `sqlite-migrations`
- `project-storage`
- `project`
- `task-facts`
- `project-sidebar`
- `remote-projects`
- `startup-storage`
- `workspace-config-catalog`
- `project-catalog`
- `bot-project-runtime`
- `project-workspace-navigation`
- `conversation-workspace-target`
- `gen-ui-protocol`
- `gen-ui-service`
- `mcp-apps-protocol`
- `mcp-ui`
- `plugin-ui-bridge`
- `plugin-sandbox`
- `plugin-ui`
- `remote-connection-flow`
- `host-database-startup`
- `web-remote-relay`
- `desktop-web-remote-relay`
- `mobile-ui`
- `web-remote-control-ui`
- `session-features`
- `provider-tool-rounds`
- `provider-builtin-tool-compat`
- `conversation-quote-context`
- `task-groups`
- `window-project-directory`
- `office-runtime`
- `embedded-browser-permission`
- `request-security-edition`
- `local-ttft-contract`
- `local-ttft-cli`
- `cli-official-command-endpoint`
- `file-open-apps`
- `ui-file-menu`
- `image-preview-editor`
- `protocol-session-data`
- `cli-session-data-files`
- `cli-session-data`
- `provider-regression`
- `session-lifecycle`
- `workspace-mcp-trust`
- `extension-host-protocol`
- `extensions-service`
- `extension-host`
- `extension-slots`
- `browser-local-preview`
- `plugin-api`
- `web-auth`
- `credential-security`
- `resource-manager`
- `shortcuts`

## 延后的上游模块

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

## 剔除的 requires

- `project-sidebar` → `data-sync`
- `project-sidebar` → `managed-worktree-ui`
- `project-sidebar` → `task-row-hover`
- `extension-host-protocol` → `context-composition`
- `extension-host-protocol` → `plugin-host-queries`
- `extensions-service` → `plugin-host-queries`

## 剔除的 publicEntrypoints

- `packages/services/src/session/contract.ts` (session)
- `packages/ui/src/project-sidebar/index.tsx` (project-sidebar)
- `packages/ui/src/project-sidebar/RemoteProjectMenu.tsx` (project-sidebar)
- `packages/ui/src/project-sidebar/RemoteConversationDisconnected.tsx` (project-sidebar)
- `packages/ui/src/conversation-workspace-target/index.ts` (conversation-workspace-target)
- `packages/ui/src/conversation-workspace-target/contract.ts` (conversation-workspace-target)
- `packages/ui/src/conversation-workspace-target/purpose.ts` (conversation-workspace-target)
- `packages/ui/src/conversation-workspace-target/workbenchTarget.ts` (conversation-workspace-target)
- `packages/ui/src/conversation-workspace-target/usePluginCreator.ts` (conversation-workspace-target)
- `packages/ui/src/conversation-workspace-target/PluginAddMenu.tsx` (conversation-workspace-target)
- `packages/ui/src/remote-connection-flow/index.ts` (remote-connection-flow)
- `packages/ui/src/components/mobile-ui/index.ts` (mobile-ui)
- `packages/ui/src/components/mobile-ui/ZCodeAppLogo.tsx` (mobile-ui)
- `packages/ui/src/components/mobile-ui/bottom-sheet.tsx` (mobile-ui)
- `packages/ui/src/web-remote-control/index.ts` (web-remote-control-ui)
- `packages/ui/src/web-remote-control/app/useWebRemoteControlAuthSync.ts` (web-remote-control-ui)
- `packages/web/src/auth/index.ts` (web-auth)
- `packages/web/src/auth/contract.ts` (web-auth)
- `packages/ui/src/resource-manager/contract.ts` (resource-manager)
- `packages/ui/src/shortcuts/contract.ts` (shortcuts)
