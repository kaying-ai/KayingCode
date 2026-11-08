# @zcode/node-repl-host

`node_repl` 的共享宿主：提供 `js` 执行面和 Browser Use bridge。每次调用使用独立 Worker；BrowserControl 持有浏览器状态，JS 全局和模块缓存不跨调用保留。

## 为什么它是独立包

JS 执行、调用隔离和 stdio 生命周期由共享宿主拥有；Browser Use 插件提供技能、文档及 browser-client。Agent bootstrap 仅在 Browser Use 启用且宿主制品存在时注册 `node_repl`。

## 构建与退役边界

运行 `pnpm --filter @zcode/node-repl-host run build`，生成 `dist/mcp/server.js`，由官方 catalog 的隐藏 seed 单元随 Desktop、SEA 和 Agent Node 发布。

Computer Use 通过 `apps/zcode-cli/packages/kaying-computer-use-plugin` 的原生 stdio MCP 执行。旧 CUA bridge、broker 和环境凭据恢复入口已退役；不得重新接入 `@kayingcode/cua`。
