# 上游同步后的 CLI 验证入口

- CLI 保留 `kayingcode` 命令和自身版本来源，复用已同步的 bootstrap/runtime，不引入第二套模型或工具状态。
- CLI 包使用自己的 Oxlint 配置检查 `src`。根配置为整体仓库扫描排除了 CLI 目录，不能将「No files found」当作包内 Lint 通过。
- 包内配置使用 Oxlint 的默认正确性检查；根架构策略继续负责模块边界，根 Lint 的排除范围不扩大。
- 验收：构建 CLI 的工作区依赖、CLI typecheck、包内 lint，以及构建产物的 `--help` / `--version`。

## 许可检查尺度对齐（2026-11-07）

- CLI 构建读取并交付已有声明；SEA 上传只管理已构建制品和目录暂存/覆盖，不隐式执行全仓许可检查。材料待办与 inventory 过期不额外阻断，遵循根 third-party/SPEC.md。
- 上传保持现有必需 SEA 文件、目标目录边界、覆盖确认与暂存复制校验。显式 check --strict 仍对未解决材料失败；不删除待办、不改写原文。
- 验收在本地临时目录使用虚构制品与 inventory：待办/过期不影响上传，缺失制品仍失败。无需连接真实 SMB。
