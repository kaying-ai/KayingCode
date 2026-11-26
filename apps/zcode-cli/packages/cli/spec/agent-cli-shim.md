# Agent 可用的 kayingcode CLI 入口（agent cli shim）

## 目标与边界

Agent 在 Bash 中执行社区插件目录协议时需要一个稳定的 `kayingcode` 命令（例如 `kayingcode plugins install --from <目录>`）。桌面打包态只把 CLI bundle 放在应用资源目录，不会写入系统 PATH；本机制由 CLI 在数据目录生成自有 shim，并让 Agent 的 Bash 会话优先命中它。

- 不是新的插件安装 API：shim 只是同一 CLI 可执行入口的固定别名，安装、市场与启停仍由 CLI 命令与配置事实源完成。
- 不修改系统 PATH、不写 `/usr/local/bin`、不改用户 shell 配置；只改 Agent 子进程的 `PATH` 环境变量。
- 不新增环境变量；shim 目录由现有 `KAYINGCODE_DATA_BASE_DIR`（缺省 `homedir()`）推导。
- 不改远端部署协议：CLI 在远端运行时同样在远端数据目录生成 shim，远端 Bash 会话自行命中；Host 不需要跨机注入。

## 路径与文件

- 目录：`<dataBaseDir>/.kayingcode/bin`，创建时权限 `0700`。
- POSIX：`kayingcode`，`0755`，内容固定为 `exec` 调用（可带 `ELECTRON_RUN_AS_NODE=1`），不解析参数、不转发额外环境。
- Windows：`kayingcode.cmd`，供 cmd/PowerShell 与非 POSIX 场景使用；git-bash 直接命中无扩展名的 POSIX shim。
- 生成内容只由当前 CLI 的可执行入口决定，不包含用户输入、工作区路径或凭据。

## 入口解析（按优先级）

1. `process.argv[1]` 为 `.ts` 源码入口（开发态 tsx）：使用同包 `../dist/kayingcode.cjs`（存在时）配合 `process.execPath`；不存在则不生成 shim，并记录 debug 日志。
2. `process.argv[1]` 为现有文件（bundle）：`process.execPath` + 该文件；`process.versions.electron` 存在时写入 `ELECTRON_RUN_AS_NODE=1`。
3. 无脚本参数（独立二进制 / SEA）：直接使用 `process.execPath`。
4. 其他情况（插件宿主、存储迁移、`--prepare-storage`）不生成。

## 写入时机与幂等

- CLI 在 `app-server` 与 TUI 启动路径调用 `ensureAgentCliShim()`；插件宿主与存储迁移命令跳过，避免 MCP 子进程覆盖入口。
- 内容与现有文件一致时不写；写入失败只记录 debug 日志，不影响 CLI 启动。
- 同一数据目录被多个 CLI 形态（桌面 bundle / 命令行发行包）写入时，后启动者覆盖为自身入口；两者执行同一份代码，行为一致。

## Agent PATH 注入

- `packages/shared/src/agent-cli-shim.ts` 提供 `resolveAgentCliShimDir(env)`（唯一路径规则），CLI 与 Bash 工具共用。
- `apps/zcode-cli/packages/core` 的 Bash 会话环境在 `PATH` 前置 shim 目录（已存在则不重复），沿用当前进程 PATH，不覆盖用户工具链。
- Windows 使用 `;`、其他平台使用 `:` 拼接；现有 git-bash PATH 归一化逻辑保持不变。
- 注入只影响 Bash/tool 子进程；CLI 自身、Host 与插件宿主的 PATH 不变。

## 安全

- shim 目录为用户数据目录下的私有目录；shim 内容只执行当前 CLI 入口，不提供提权、绕过 sandbox 或自动批准。
- 不把 shim 目录写进 `plugins.dirs`、marketplace 或任何插件信任记录。
- Agent 运行 shim 时仍受既有 Bash 权限/沙箱与用户审批约束；安装写入数据目录或用户目录时按普通命令权限处理。
- 日志只记录 shim 路径与失败原因，不记录 CLI 参数内容。

## 验收

1. 打包态与开发态（存在 `dist/kayingcode.cjs`）启动 app-server 后生成可执行 `kayingcode`；内容指向正确入口。
2. 插件宿主/存储迁移启动不生成或覆盖 shim。
3. Agent Bash 会话 `command -v kayingcode` 命中 shim；`kayingcode plugins list` 可运行。
4. 同一数据目录重复启动不重复改写文件；不可写目录下 CLI 正常启动。
5. macOS、Linux、Windows 的入口与 PATH 拼接正确；Windows git-bash 可运行无扩展名 shim。
6. 用户手工在系统 shell 中不会因本机制获得新的 PATH 变更。
