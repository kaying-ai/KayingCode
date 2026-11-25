# Desktop agent CLI 打包

状态：已落地（2026-11-25）。

## 共享子路径别名

- `scripts/build.mjs` 的 `resolveBuildAliases` 从 `packages/shared/package.json#exports` 生成全部
  `@zcode/shared/*` 精确 alias，再按 key 长度降序排序后交给 esbuild。
- 原因：esbuild alias 按前缀改写；漏声明会把 `@zcode/shared/managed-worktree` 错误拼成
  `packages/shared/src/index.ts/managed-worktree`，导致 Desktop agent/SEA 打包失败。
- `@zcode/shared-types`、`@zcode/core` 等非 shared exports 或需要覆盖的入口继续使用显式 alias。

## 可选原生依赖

- `adapters` 必须显式声明 `chokidar`（当前 `4.0.3`）。`adapters/src/watch` 直接 import；
  若解析到 hoisted 的 `3.6.0`，会把 macOS 专用 `fsevents.node` 带进 Windows bundle，
  esbuild 报 `No loader is configured for ".node"`。
- `koffi`、`@napi-rs/keyring` 等运行时动态加载的原生模块继续 external。

## 验收

- `node scripts/build-desktop-agent-cli.mjs` 在 Windows 通过。
- `pnpm --filter @zcode/cli test` 覆盖 `tests/build-aliases.test.mjs`，校验 shared exports 全覆盖与长 key 排序。
