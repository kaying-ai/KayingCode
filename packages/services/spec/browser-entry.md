# 浏览器公共入口

`@zcode/services` 只导出浏览器可加载的 descriptor、接口和纯逻辑。项目服务、分组 repository、projectStorage 及 SQLite 迁移实现由 `@zcode/services/node` 导出；Host 仍通过相同服务契约装配。此边界修复 Taro Web 远控构建遇到的 node:crypto 错误，不提供 Node shim 或假数据库。

验收：用 esbuild platform=browser 对公共入口打包，禁止 Node 内置模块进入依赖图；Taro H5/weapp 构建及根 typecheck，Host 项目/分组测试回归。调用方迁移前通过 dep:refs 核对真实引用，保留 Node 公开能力。

## 验证记录（2026-11-05）

- `browserEntry.test.ts` 通过：`@zcode/services` 公共入口可被 esbuild `platform=browser` 打包，依赖图不含 Node 实现。
- Taro H5 构建通过（webpack 编译成功），根 typecheck 通过。
- 未执行：weapp 目标构建；本轮只验证 H5 容器与浏览器入口。
