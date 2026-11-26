# 上游协议/共享层盘点（4.0.0）

生成时间：2026-11-24T06:48:02.285Z
基线：`fec975905a2abd4c07e35c40d51fa097a2258ec9`
上游：`upstream/main`

> 本文件由 `scripts/upstream-protocol-inventory.mjs` 生成，不要手改。
> `patch` 不代表错误：它表示品牌映射后仍有产品本地改动，需要在 P0-2 移入显式 patch 清单并确认是否保留。
> `missing` 也不代表必须补入：其中包含 CUA、permanent-deletion、plugin-host-queries 等产品边界项，需要逐项确认。

## 汇总

| 项目 | 数量 |
| --- | --- |
| 上游文件 | 242 |
| parity（映射后一致） | 132 |
| patch（产品本地改动） | 84 |
| missing（产品缺失） | 26 |
| product-only（产品独有） | 3 |
| 上游相对基线新增 | 0 |
| 上游相对基线修改 | 30 |

## 产品缺失文件

| 上游文件 | 期望产品路径 | 上游行数 |
| --- | --- | --- |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cua-permission-observation.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/cua-permission-observation.ts` | 54 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/CONTRACT.md` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/CONTRACT.md` | 10 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/contract.example.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/contract.example.ts` | 9 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/contract.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/contract.test.ts` | 42 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/contract.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/contract.ts` | 25 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/index.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/index.ts` | 353 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/materialization/module.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/materialization/module.ts` | 6 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/callRaces.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/callRaces.test.ts` | 113 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/contract.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/contract.test.ts` | 17 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/instances.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/instances.test.ts` | 131 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/samplingCalls.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/mcp-ui/samplingCalls.test.ts` | 90 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-discovery-port.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-discovery-port.ts` | 270 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-install-interaction.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-install-interaction.ts` | 89 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-mention-items.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-mention-items.ts` | 187 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-user-options.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/plugin-user-options.ts` | 53 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/permanent-deletion.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/session-data/permanent-deletion.ts` | 324 |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/transport.test.ts` | `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/transport.test.ts` | 84 |
| `packages/shared/src/zcode-protocol-v4/context-composition/CONTRACT.md` | `packages/shared/src/kayingcode-protocol-v4/context-composition/CONTRACT.md` | 19 |
| `packages/shared/src/zcode-protocol-v4/context-composition/contract.example.ts` | `packages/shared/src/kayingcode-protocol-v4/context-composition/contract.example.ts` | 23 |
| `packages/shared/src/zcode-protocol-v4/context-composition/module.ts` | `packages/shared/src/kayingcode-protocol-v4/context-composition/module.ts` | 22 |
| `packages/shared/src/zcode-protocol-v4/cuaPermission.ts` | `packages/shared/src/kayingcode-protocol-v4/cuaPermission.ts` | 41 |
| `packages/shared/src/zcode-protocol-v4/pluginInstall.ts` | `packages/shared/src/kayingcode-protocol-v4/pluginInstall.ts` | 113 |
| `packages/shared/src/zcode-protocol/plugin-host-queries/CONTRACT.md` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/CONTRACT.md` | 33 |
| `packages/shared/src/zcode-protocol/plugin-host-queries/contract.example.ts` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/contract.example.ts` | 22 |
| `packages/shared/src/zcode-protocol/plugin-host-queries/contract.ts` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/contract.ts` | 95 |
| `packages/shared/src/zcode-protocol/plugin-host-queries/module.ts` | `packages/shared/src/kayingcode-protocol/plugin-host-queries/module.ts` | 20 |

## 产品本地改动（patch）

| 文件 | 上游行数 | 产品行数 | 产品相对基线 | 上游相对基线 |
| --- | --- | --- | --- | --- |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts` | 569 | 507 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-event-merge.ts` | 861 | 919 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-session-resume.ts` | 134 | 130 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts` | 611 | 519 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/canonical-intent-replay.ts` | 195 | 189 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/fork-edit-retry.ts` | 417 | 414 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/goal-compact.ts` | 536 | 518 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/interaction-background.ts` | 364 | 321 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts` | 265 | 267 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/queue.ts` | 512 | 378 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-flow.ts` | 447 | 441 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-mgmt.ts` | 218 | 205 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/input-admission.ts` | 214 | 195 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/input-intent.ts` | 177 | 175 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/prompt-turn.ts` | 427 | 363 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/types.ts` | 333 | 327 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts` | 975 | 766 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts` | 1021 | 1223 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/index.ts` | 71 | 71 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.ts` | 407 | 385 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts` | 6904 | 5994 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-rows.ts` | 206 | 190 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-state.ts` | 266 | 225 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/queue-auto-drain.ts` | 22 | 19 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts` | 246 | 233 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts` | 2340 | 2233 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts` | 3973 | 3840 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/automation-port.ts` | 294 | 295 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/context-composition/handler.ts` | 31 | 31 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/context-composition/index.ts` | 7 | 7 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/context-composition/tracker.ts` | 62 | 62 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/input-prediction-handler.ts` | 207 | 205 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts` | 815 | 812 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-preferences.ts` | 23 | 26 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-response-race.ts` | 102 | 102 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/CONTRACT.md` | 22 | 20 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/protocol.ts` | 343 | 332 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp.ts` | 324 | 306 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/message-mapper.ts` | 324 | 326 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/official-mcp-auth-port.ts` | 137 | 138 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-reference-catalog.ts` | 324 | 294 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-ui-surfaces.ts` | 49 | 46 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugins.ts` | 699 | 649 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/runtime-cleanup.ts` | 70 | 68 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` | 4519 | 4449 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts` | 385 | 379 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts` | 1271 | 1190 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/CONTRACT.md` | 12 | 10 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/index.ts` | 186 | 189 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts` | 1559 | 1541 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-residency.ts` | 393 | 294 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-resident-pool.ts` | 326 | 322 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/skill-reference-catalog.ts` | 70 | 66 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/subagent-session-query.ts` | 717 | 494 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/transport.ts` | 381 | 357 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | 2295 | 2161 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-workspace-config.ts` | 63 | 59 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-hook-trust.ts` | 114 | 107 | local-change | unchanged |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-runtime.ts` | 162 | 149 | local-change | modified |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace.ts` | 83 | 35 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-legacy-types.ts` | 553 | 561 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/apply.ts` | 239 | 229 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/command.ts` | 628 | 520 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/context-composition/contract.ts` | 161 | 161 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/core.ts` | 109 | 100 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/delta.ts` | 208 | 205 | base | modified |
| `packages/shared/src/zcode-protocol-v4/index.ts` | 68 | 71 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/input-intent.ts` | 130 | 116 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/input-prediction/module.ts` | 16 | 16 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/rows.ts` | 548 | 510 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/session-data/CONTRACT.md` | 11 | 10 | base | modified |
| `packages/shared/src/zcode-protocol-v4/session-data/contract.ts` | 129 | 51 | local-change | modified |
| `packages/shared/src/zcode-protocol-v4/sessions-index.ts` | 124 | 121 | local-change | modified |
| `packages/shared/src/zcode-protocol-v4/snapshot.ts` | 598 | 541 | local-change | modified |
| `packages/shared/src/zcode-protocol-v4/telemetry.ts` | 403 | 361 | local-change | modified |
| `packages/shared/src/zcode-protocol-v4/toolDisplay.ts` | 292 | 301 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/transport.ts` | 1231 | 1201 | local-change | modified |
| `packages/shared/src/zcode-protocol-v4/workflow-artifacts.ts` | 352 | 349 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/workflow-observation-display.ts` | 285 | 281 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/workflow-row-meta.ts` | 208 | 208 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/workflow-runs-holes.ts` | 205 | 205 | local-change | unchanged |
| `packages/shared/src/zcode-protocol-v4/workflow-workspace.ts` | 144 | 141 | local-change | unchanged |
| `packages/shared/src/zcode-protocol/index.ts` | 4716 | 4809 | local-change | modified |
| `packages/shared/src/zcode-protocol/trace.ts` | 11 | 14 | local-change | unchanged |

## 产品独有文件

- `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol-v4/local-ttft.ts`
- `apps/zcode-cli/packages/bootstrap/src/kayingcode-protocol/tapmaker-projects.ts`
- `packages/shared/src/kayingcode-protocol-v4/mobile-model-catalog.ts`

## 上游相对基线变化

| 上游文件 | 变化 | 产品状态 |
| --- | --- | --- |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-state.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/protocol.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/message-mapper.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugins.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/index.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-data/permanent-deletion.ts` | modified | missing |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/subagent-session-query.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | modified | patch |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-runtime.ts` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/delta.ts` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/session-data/CONTRACT.md` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/session-data/contract.ts` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/sessions-index.ts` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/snapshot.ts` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/telemetry.ts` | modified | patch |
| `packages/shared/src/zcode-protocol-v4/transport.ts` | modified | patch |
| `packages/shared/src/zcode-protocol/index.ts` | modified | patch |
| `packages/shared/src/zcode-protocol/plugin-host-queries/CONTRACT.md` | modified | missing |
