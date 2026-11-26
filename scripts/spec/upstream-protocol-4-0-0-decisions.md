# ZCode 4.0.0 协议合并决策清单

状态：P0-2 POC 决策记录（2026-11-24）。
输入：[三方合并报告](upstream-protocol-4-0-0-merge-report.md)、[盘点报告](upstream-protocol-4-0-0-inventory.md)。

## 决策规则

- **merge-now**：机制属于当前阶段（协议/插件 schema），冲突可按“双方都保留”或“采用上游”解决。
- **override-product**：产品明确边界（CUA、永久删除），保留产品文件，不生成上游版本。
- **defer-P2/P4**：依赖后续阶段的新类型/新文件，先保留产品文件，等阶段落地后重新合并。
- **port-later**：产品缺失但属于后续阶段能力，先记录，不在 P0 直接补入。

## 12 个冲突文件

| 文件 | 决策 | 关键冲突与理由 |
| --- | --- | --- |
| `kayingcode-protocol/plugins.ts` | merge-now | `uiContributions` 与 `workspaceTrust` 同时保留；`setWorkspacePluginTrust` 导入依赖 P2 的 workspace trust，合入时需同时落 P2 模块 |
| `packages/shared/src/kayingcode-protocol/index.ts` | merge-now | `uiContributions` + `workspaceTrust` 字段并存；trust schema 由合并输出补齐 |
| `kayingcode-protocol/server-operations.ts` | 部分 merge-now | 采用上游 `elideSessionSnapshotForIndex`；子 agent 元数据导入与 runtime prefs 新字段依赖 P4，暂保留产品分支 |
| `kayingcode-protocol/server.ts` | 部分 merge-now | 采用 `idleRestartInProgress` 租约等待；永久删除 preview/execute 与 `assertSessionNotDeleting` 属于产品明确排除项，不引入 |
| `kayingcode-protocol/session-data/index.ts` | override-product | 产品不恢复永久删除，保留现有 measure/purge 导出 |
| `packages/shared/src/kayingcode-protocol-v4/session-data/contract.ts` | override-product | 同上，不引入 deletionPreview/Execute schema |
| `kayingcode-protocol-v4/transport.ts` | defer-P4 | 删除相关路由排除；turn-admission/model-request-metrics 路由随 P4 telemetry 一起接 |
| `kayingcode-protocol-v4/v4-gateway.ts` | defer-P4 | 依赖 `PluginDiscoveryFactNormalizer`、CUA observation 与 4.0.0 telemetry 类型；P4 统一接 |
| `kayingcode-protocol-v4/conversation-telemetry-facts.ts` | defer-P4 | 依赖 `turnAdmissionTelemetrySchema` 等 4.0.0 telemetry schema |
| `kayingcode-protocol/v4-bridge.ts` | defer-P4 | 新增 `storedSessionSummary` 与 turn-admission/model metrics 发射器，随 P4 |
| `kayingcode-protocol/subagent-session-query.ts` | defer-P4 | 依赖 4.0.0 subagent metadata 辅助函数；产品现有冷恢复修复先保留 |
| `kayingcode-protocol-v4/product-projection.ts` | defer-P4 | activity summary/TransactionalMap 等与 4.0.0 snapshot 字段联动，随 P4 整体接 |

## 26 个产品缺失文件

| 分组 | 数量 | 决策 |
| --- | --- | --- |
| CUA（`cua-permission-observation.ts`、`cuaPermission.ts`） | 2 | 产品边界，暂不补入；CUA 对齐评估时再定 |
| 永久删除（`session-data/permanent-deletion.ts`） | 1 | 产品边界，不补入 |
| 插件/材料化/workspace trust（materialization、plugin-discovery-port、plugin-install-interaction、plugin-mention-items、plugin-user-options、pluginInstall、plugin-host-queries、context-composition contract） | 18 | 阶段 2 一并补入 |
| MCP UI 与 transport 测试 | 5 | 对应代码合入时同步补测试；不先单独加测试 |

## 下一步

1. 阶段 2 合入插件机制时，先落 `workspace-plugin-trust`、`mcp/config-loader`、`live-inventory`，再合 `plugins.ts` 与 shared protocol trust schema。
2. 阶段 4 合入 telemetry/subagent/projection 时，按本清单重新跑三方合并；届时 `defer-P4` 文件应转为 `merge-now`。
3. 永久删除与 CUA 继续保持 override，除非产品重新决定恢复。
