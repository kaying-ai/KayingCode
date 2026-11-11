# node_repl 上游同步边界

- 本宿主只承载 JS 与 Browser Use；Computer Use 使用独立插件。
- 不引入上游依赖 `NodeReplCuaAppIdentity` 的调用账本和对应代理，也不复制旧 CUA 类型作为兼容兜底。当前 server 未装配的 watchdog 不作为运行时能力引入。
- 保留现有 Browser broker 的身份与生命周期；以构建和 `legacy-cua-retirement.test.ts` 验证 JS/Browser 可用、旧 Computer Use bridge 不出现。
- Browser bridge 必须消费宿主注入的 `KAYINGCODE_NODE_REPL_BROWSER_BROKER_SOCKET/TOKEN`，并在每个请求携带来自 request-context 的 `runtimeScope/sessionId/turnId/trace`；缺 session 元数据时在发请求前失败。不得只依赖 Worker 内显式 connection，否则 broker 注入后 bridge 仍报 “Browser control is unavailable”。
- 显式 `tab.screenshot()` 的图片要写回本次 run 的 browserScreenshots，供 `toMcpRunResult` 标记截图下标。
- 当前回归使用 `node:test`，包内 test 命令必须走 Node/tsx，不交给 Vitest 执行。
