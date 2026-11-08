# CLI SEA 构建路径

## 规则与所有者

- `apps/zcode-cli/packages/cli/scripts/sea-runtime-tool-prepare.mjs` 负责将目标平台的搜索工具准备到当前 Desktop 应用目录 `packages/desktop/bundled-tools/<platform>`。
- `sea-runtime-tool-assets.mjs` 从同一目录收集二进制，计算摘要并写入 SEA 资产清单；不得读取已迁走的 `packages/desktop`。
- SEA 构建产物仍位于 `apps/zcode-cli/packages/cli/dist`，该路径不影响运行时搜索工具的资产键和协议。

## 失败与验收

- 工具缺失时保留明确的文件路径错误，不生成缺少工具的 SEA。
- 先完成工作区与本机搜索工具构建，再用仓库锁定的 Node 版本构建本机 SEA；构建应成功并通过脚本内置的 `--version` 冒烟检查。
