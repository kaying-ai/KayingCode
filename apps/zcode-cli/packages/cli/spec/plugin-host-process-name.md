# 插件宿主进程命名（plugin host process name）

- 来源：官方 ZCode 4.0.0（`upstream/main` 提交 `a4b44451`）的 `process-name.ts`、`main.ts`、`tests/process-name.test.mjs`。
- 产品基线已具备 `__kayingcode-plugin-host` 隐藏子命令、`contracts` 常量、bootstrap 的 `officialPluginHostPrefixArgs` 与 `runPluginHostCommand`；本次只补齐「按角色给进程命名」，不新增第二套插件宿主入口。
- 目标：官方插件 MCP server 通过 CLI 入口启动时，进程查看工具显示 `kayingcode-mcp-<plugin>`，不再把插件宿主误认为 Agent（`kayingcode-cli`）。

## 命令与入口契约

- 隐藏子命令：`__kayingcode-plugin-host <server-path> [-- <server-arg>...]`，常量在 `@zcode/contracts/plugins`（`KAYINGCODE_PLUGIN_HOST_COMMAND`，`ZCODE_PLUGIN_HOST_COMMAND` 为其别名）。
- 入口分派必须发生在 `parseArgs` 与动态 `import("./run.js")` 之前：
  - `main.ts` 在清洗环境变量之前先按 `argv[0]` 判定角色并设置 `process.title`，再清洗环境、加载插件；
  - `run.ts` 保留同一分派作为程序化调用（直接 import `run`）的兜底，但不重复设置进程名。
- 插件宿主只加载插件 `main()`，不加载 Agent、工具注册表、Provider 与工作流模块。

## 进程命名规则

| 角色 | `process.title` |
| --- | --- |
| 普通 CLI（包括带着 `KAYINGCODE_PLUGIN_ID` 环境变量的普通命令） | `kayingcode-cli` |
| `__kayingcode-plugin-host` + 合法插件身份 | `kayingcode-mcp-<plugin>` |
| `__kayingcode-plugin-host` + 缺失/非法插件身份 | `kayingcode-mcp` |
| `--prepare-storage` / 存储迁移 | 不修改（可能运行在 Host Worker 中，改的是整个 Host 的进程名） |

- 插件身份来源：优先 `KAYINGCODE_PLUGIN_ID`，缺失或空白时回退 `ZCODE_PLUGIN_ID`（产品双写两个变量以兼容直接采用的上游插件）。
- 取 `@` 之前的部分，trim + 小写；必须匹配 `^[a-z0-9][a-z0-9._-]{0,127}$` 才拼进进程名，否则回退 `kayingcode-mcp`，不从文件路径猜名字。
- 命名前缀与 `kayingcode-cli`、shared 的 `kayingcode-*` 进程名保持同一品牌；实现在 `src/process-name.ts`，不引入新的命名模块。
- 产品既有的 `KAYINGCODE_PROCESS_LABEL` → `formatKayingCodeHostProcessName()` 是桌面 Host 进程链路；CLI 插件宿主复用同一 `kayingcode-*` 前缀和 `process-name.ts` 机制，但不设置 `KAYINGCODE_PROCESS_LABEL`——该变量会被 services 判为桌面运行时，注入插件宿主会改变无关行为。
- `process.title` 仅用于展示，不参与鉴权、插件身份或工具可见性判断；环境变量被伪造只会改变显示名。

## 环境变量契约

- 不新增环境变量。
- 插件宿主沿用 bootstrap 既有注入：`KAYINGCODE_PLUGIN_ID` 与 `ZCODE_PLUGIN_ID`（`<manifest.name>@<marketplace>`，resolver 权威写入，manifest/user env 不可覆盖）、`ELECTRON_RUN_AS_NODE=1`；进程命名只读这两个身份变量。
- 普通 CLI 即使继承了插件身份变量，也必须保持 `kayingcode-cli`，避免从 Agent 进程派生的普通命令被误标。

## 启动路径

- 官方插件：bootstrap `officialPluginHostPrefixArgs()` →
  - SEA：`[__kayingcode-plugin-host]`（自 re-exec 单文件二进制）；
  - Node：`[...process.execArgv, <cli 入口>, __kayingcode-plugin-host]`。
- 第三方/缓存插件的 stdio MCP server 继续按 manifest 的 command/args 启动，不强制经过 CLI 插件宿主；本契约只覆盖经 CLI 入口的插件宿主。
- `plugin-host-command.ts` 校验 server 路径存在、模块导出 `main()`，在调用前把 `process.argv` 改成 `[execPath, serverPath, ...serverArgs]`。

## 关停与终止语义

- 不新增进程状态、信号处理或杀进程路径。
- 插件宿主 `main()` 在 MCP `server.connect()` 完成后返回时，stdio handle 仍是服务存活条件：
  - 退出码为 0 时不安装一次性 CLI 退出 watchdog，避免把正常存活的 MCP 进程误判为泄漏并强退；
  - 退出码非 0 或启动失败时仍走既有 watchdog / 非零退出。
- 终止由既有 MCP 进程所有者负责：`mcpTelemetry.listProcesses()` 记录的 PID、桌面 Host 的进程管理；`process/childProcesses` 继续返回 `pid`、`serverName`、`mcpSource`、`pluginName`，不读取操作系统进程标题。

## 进程树如何呈现

- 操作系统进程列表读取 `process.title`：Unix `ps` / Activity Monitor 直接显示 `kayingcode-mcp-<plugin>`；Windows 上 Node 的 `process.title` 更新控制台标题，任务管理器的映像名仍是 `node.exe`/`kayingcode.exe`，这是平台限制，不用其他机制伪造。
- `kayingcode doctor --json` 输出两处身份，便于诊断与自动化验收：
  - `cli.processName`：逻辑进程名（`kayingcode-cli`）；
  - `runtime.processTitle`：当前真实 `process.title`（插件宿主内为 `kayingcode-mcp-<plugin>`）。
- 桌面 Host 侧的子进程展示名继续由 `formatKayingCodeHostProcessName()` 生成，与 CLI 的 `process.title` 是两条独立展示链路，不互相覆盖。

## 验收场景

1. 带 `KAYINGCODE_PLUGIN_ID=documents@kayingcode-plugins-official` 运行 `kayingcode doctor --json`：`cli.processName` 与 `runtime.processTitle` 均为 `kayingcode-cli`。
2. 以同一身份运行 `__kayingcode-plugin-host <fixture server>`：fixture 在 import 时和 `main()` 内看到的 `process.title` 都是 `kayingcode-mcp-documents`，`process.argv[1]` 是解析后的 server 路径，两个插件身份变量均透传。
3. 缺失、空值、` ZCode-Site@example-marketplace `、`invalid/name@example-marketplace` 分别得到 `kayingcode-mcp`、`kayingcode-mcp`、`kayingcode-mcp-zcode-site`、`kayingcode-mcp`。
4. 上述场景由 `tests/process-name.test.mjs` 覆盖；测试通过 `node --import tsx src/main.ts` 直接运行源码入口，不依赖过期 `dist`。

## 与上游的差异

- 品牌：`zcode` → `kayingcode`，`zcode-cli`/`zcode-mcp` → `kayingcode-cli`/`kayingcode-mcp`；`@zcode/*` 包作用域保持不变。
- 身份变量：上游只读 `ZCODE_PLUGIN_ID`；产品优先 `KAYINGCODE_PLUGIN_ID` 并回退 `ZCODE_PLUGIN_ID`，与 resolver 双写一致。
- 不移植同批次的独立 CUA broker 凭据铸造（`mintStandaloneCuaCredentialsIfEligible`）；它是另一项能力，不属于进程命名。
- 产品既有 CLI 参数（`--browser-state`、`--total-tokens-reminder`、`--agent-always-background` 等）与命令面保持不变。
