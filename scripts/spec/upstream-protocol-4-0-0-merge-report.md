# 上游协议三方合并 POC（4.0.0）

> 由 `scripts/upstream-protocol-merge.mjs` 生成，不要手改。
> `merged-clean` 表示 4.0.0 变更可以自动合入产品本地改动；`conflict` 需要人工决策或进入显式 patch 清单。

## 汇总

| 结果 | 数量 |
| --- | --- |
| 总文件 | 245 |
| parity（无需处理） | 132 |
| ported（上游有、产品缺失，需按产品边界确认） | 26 |
| clean-adopt（产品等于基线，直接采用上游） | 2 |
| merged-clean（自动三方合并成功） | 70 |
| conflict（需人工处理） | 12 |
| manual-no-base（无共同基线，需人工处理） | 0 |
| product-only | 3 |

输出目录：`/var/folders/7y/g9vz0hc91vd84908d8yp70q00000gn/T/kayingcode-upstream-protocol-4.0.0`
报告：`scripts/spec/upstream-protocol-4-0-0-merge-report.md`

## 冲突文件

| 上游文件 | 产品路径 |
| --- | --- |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/conversation-telemetry-facts.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/product-projection.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/v4-gateway.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugins.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugins.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/server-operations.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/server.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/index.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-data/index.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/subagent-session-query.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/subagent-session-query.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/v4-bridge.ts` |
| `packages/shared/src/zcode-protocol-v4/session-data/contract.ts` | `packages/shared/src/kayingcode-protocol-v4/session-data/contract.ts` |
| `packages/shared/src/zcode-protocol-v4/transport.ts` | `packages/shared/src/kayingcode-protocol-v4/transport.ts` |
| `packages/shared/src/zcode-protocol/index.ts` | `packages/shared/src/kayingcode-protocol/index.ts` |

## 无共同基线

无。

## 上游有、产品缺失（ported，需确认）

| 上游文件 | 产品路径 |
| --- | --- |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cua-permission-observation.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/cua-permission-observation.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/CONTRACT.md` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/CONTRACT.md` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/contract.example.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/contract.example.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/contract.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/contract.test.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/contract.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/contract.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/index.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/index.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/module.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/module.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/callRaces.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/callRaces.test.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/contract.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/contract.test.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/instances.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/instances.test.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/samplingCalls.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/samplingCalls.test.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-discovery-port.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-discovery-port.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-install-interaction.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-install-interaction.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-mention-items.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-mention-items.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-user-options.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-user-options.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/permanent-deletion.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-data/permanent-deletion.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/transport.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/transport.test.ts` |
| `packages/shared/src/zcode-protocol-v4/context-composition/CONTRACT.md` | `packages/shared/src/kayingcode-protocol-v4/context-composition/CONTRACT.md` |
| `packages/shared/src/zcode-protocol-v4/context-composition/contract.example.ts` | `packages/shared/src/kayingcode-protocol-v4/context-composition/contract.example.ts` |
| `packages/shared/src/zcode-protocol-v4/context-composition/module.ts` | `packages/shared/src/kayingcode-protocol-v4/context-composition/module.ts` |
| `packages/shared/src/zcode-protocol-v4/cuaPermission.ts` | `packages/shared/src/kayingcode-protocol-v4/cuaPermission.ts` |
| `packages/shared/src/zcode-protocol-v4/pluginInstall.ts` | `packages/shared/src/kayingcode-protocol-v4/pluginInstall.ts` |
| `packages/shared/src/zcode-protocol/plugin-host-queries/CONTRACT.md` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/CONTRACT.md` |
| `packages/shared/src/zcode-protocol/plugin-host-queries/contract.example.ts` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/contract.example.ts` |
| `packages/shared/src/zcode-protocol/plugin-host-queries/contract.ts` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/contract.ts` |
| `packages/shared/src/zcode-protocol/plugin-host-queries/module.ts` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/module.ts` |

## 直接采用上游（clean-adopt）

| 上游文件 | 产品路径 |
| --- | --- |
| `packages/shared/src/zcode-protocol-v4/delta.ts` | `packages/shared/src/kayingcode-protocol-v4/delta.ts` |
| `packages/shared/src/zcode-protocol-v4/session-data/CONTRACT.md` | `packages/shared/src/kayingcode-protocol-v4/session-data/CONTRACT.md` |

## 自动合并（merged-clean）

| 上游文件 | 产品路径 |
| --- | --- |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-entrypoint.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-event-merge.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/cold-event-merge.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-session-resume.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/cold-session-resume.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/command-inbox.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/canonical-intent-replay.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/canonical-intent-replay.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/fork-edit-retry.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/fork-edit-retry.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/goal-compact.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/goal-compact.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/interaction-background.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/interaction-background.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/model-config.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/queue.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/queue.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-flow.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/session-flow.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-mgmt.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/handlers/session-mgmt.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/input-admission.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/input-admission.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/input-intent.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/input-intent.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/prompt-turn.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/prompt-turn.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/types.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/commands/types.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/conversation-topic-publisher.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/index.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/index.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/interaction-registry.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-rows.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/projection-rows.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-state.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/projection-state.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/queue-auto-drain.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/queue-auto-drain.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/sessions-index-projection.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/transcript-hydration.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/automation-port.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/automation-port.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/context-composition/handler.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/context-composition/handler.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/context-composition/index.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/context-composition/index.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/context-composition/tracker.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/context-composition/tracker.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/input-prediction-handler.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/input-prediction-handler.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/interaction-broker.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-preferences.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/interaction-preferences.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-response-race.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/interaction-response-race.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/CONTRACT.md` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/CONTRACT.md` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/protocol.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/protocol.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/message-mapper.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/message-mapper.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/official-mcp-auth-port.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/official-mcp-auth-port.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-reference-catalog.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-reference-catalog.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-ui-surfaces.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-ui-surfaces.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/runtime-cleanup.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/runtime-cleanup.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/server-types.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/CONTRACT.md` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-data/CONTRACT.md` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-mapper.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-residency.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-residency.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-resident-pool.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-resident-pool.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/skill-reference-catalog.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/skill-reference-catalog.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/transport.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/transport.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-workspace-config.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/v4-workspace-config.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-hook-trust.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/workspace-hook-trust.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-runtime.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/workspace-model-runtime.ts` |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/workspace.ts` |
| `packages/shared/src/zcode-protocol-legacy-types.ts` | `packages/shared/src/kayingcode-protocol-legacy-types.ts` |
| `packages/shared/src/zcode-protocol-v4/apply.ts` | `packages/shared/src/kayingcode-protocol-v4/apply.ts` |
| `packages/shared/src/zcode-protocol-v4/command.ts` | `packages/shared/src/kayingcode-protocol-v4/command.ts` |
| `packages/shared/src/zcode-protocol-v4/context-composition/contract.ts` | `packages/shared/src/kayingcode-protocol-v4/context-composition/contract.ts` |
| `packages/shared/src/zcode-protocol-v4/core.ts` | `packages/shared/src/kayingcode-protocol-v4/core.ts` |
| `packages/shared/src/zcode-protocol-v4/index.ts` | `packages/shared/src/kayingcode-protocol-v4/index.ts` |
| `packages/shared/src/zcode-protocol-v4/input-intent.ts` | `packages/shared/src/kayingcode-protocol-v4/input-intent.ts` |
| `packages/shared/src/zcode-protocol-v4/input-prediction/module.ts` | `packages/shared/src/kayingcode-protocol-v4/input-prediction/module.ts` |
| `packages/shared/src/zcode-protocol-v4/rows.ts` | `packages/shared/src/kayingcode-protocol-v4/rows.ts` |
| `packages/shared/src/zcode-protocol-v4/sessions-index.ts` | `packages/shared/src/kayingcode-protocol-v4/sessions-index.ts` |
| `packages/shared/src/zcode-protocol-v4/snapshot.ts` | `packages/shared/src/kayingcode-protocol-v4/snapshot.ts` |
| `packages/shared/src/zcode-protocol-v4/telemetry.ts` | `packages/shared/src/kayingcode-protocol-v4/telemetry.ts` |
| `packages/shared/src/zcode-protocol-v4/toolDisplay.ts` | `packages/shared/src/kayingcode-protocol-v4/toolDisplay.ts` |
| `packages/shared/src/zcode-protocol-v4/workflow-artifacts.ts` | `packages/shared/src/kayingcode-protocol-v4/workflow-artifacts.ts` |
| `packages/shared/src/zcode-protocol-v4/workflow-observation-display.ts` | `packages/shared/src/kayingcode-protocol-v4/workflow-observation-display.ts` |
| `packages/shared/src/zcode-protocol-v4/workflow-row-meta.ts` | `packages/shared/src/kayingcode-protocol-v4/workflow-row-meta.ts` |
| `packages/shared/src/zcode-protocol-v4/workflow-runs-holes.ts` | `packages/shared/src/kayingcode-protocol-v4/workflow-runs-holes.ts` |
| `packages/shared/src/zcode-protocol-v4/workflow-workspace.ts` | `packages/shared/src/kayingcode-protocol-v4/workflow-workspace.ts` |
| `packages/shared/src/zcode-protocol/trace.ts` | `packages/shared/src/kayingcode-protocol/trace.ts` |
