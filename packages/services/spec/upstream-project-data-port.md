# 项目数据端口的发布边界

- 项目数据的浏览器侧只消费 `ProjectDataPort` / `IProjectService` 契约；文件系统实现归 Host / Node 装配。
- `createProjectDataPort` 及其 Node 依赖仅由 `@zcode/services/node` 导出，不经共享 UI 使用的 `@zcode/services` 桶入口加载。
- 不通过增加浏览器 fs shim 来掩盖边界错误；沿用现有项目 Repository 与事务 owner，不新增 UI 写库路径。
- 验收：根类型检查、架构检查与桌面 renderer 生产构建；renderer 不再解析该端口的 `node:fs/promises` 实现。
