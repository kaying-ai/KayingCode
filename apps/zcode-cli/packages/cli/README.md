# kayingcode-cli

[简体中文](README.md) · [English](README.en.md)

基于 TypeScript 和 Node.js 24.14.0 的 CLI starter。默认产物是普通 Node CLI bundle；SEA（单文件可执行程序）是可选打包方式。

## 设计说明

- Runtime 代码没有生产依赖。
- CLI 使用 Node 内置模块处理参数解析和终端交互。
- `npm run build` 生成 `dist/kayingcode.cjs`，可运行于安装了 Node.js 24.14.0 的环境。
- `npm run sea` 尝试把同一 bundle 打包为单文件可执行程序。
- 若 SEA 在某个平台失败，普通 CLI bundle 仍可作为运行产物。

## 常用命令

```sh
npm run bootstrap
npm run dev -- --help
npm run build
npm run start -- doctor --json
npm test
npm run sea
npm run sea -- --target linux-x64 --target win-x64
npm run sea -- --all
```

## 项目结构

```txt
src/
  cli/       命令解析和进程装配
  core/      可复用的运行时逻辑
  ui/        终端 UI 层
scripts/     构建及可选 SEA 打包脚本
tests/      CLI 子进程级测试
```

## 初始化

克隆仓库后运行 `npm run bootstrap`。脚本会检查本机 Node.js 版本、安装依赖并执行项目完整检查。

## 插件开发

kayingcode 插件是本地 bundle，可提供 skills、自定义命令和 MCP server。

插件状态保存在 `~/.kayingcode/cli/plugins`：

- `cache/`：已安装的 marketplace 插件代码和静态文件。
- `data/<plugin-id>/`：插件持久数据。MCP server 的运行时输出应写到这里，不要写入插件源码目录。
- `marketplaces/kayingcode-plugins-official/`：官方 marketplace 的内置/CDN 分区及合并后的元数据。

仓库也通过 workspace packages 提供内置官方插件。Browser Use、Document Skills、Skill Creator 和 KayingCode Guide 内容插件默认启用，标识分别为 `browser-use@kayingcode-plugins-official`、`document-skills@kayingcode-plugins-official`、`skill-creator@kayingcode-plugins-official` 和 `kayingcode-guide@kayingcode-plugins-official`。运行时型官方插件，以及 `ios-simulator@kayingcode-plugins-official`、`android-emulator@kayingcode-plugins-official`、`restore-legacy-sessions@kayingcode-plugins-official` 等本地数据迁移插件，能够被 kayingcode 发现，但须由用户启用后才会运行。

```sh
kayingcode plugins list
kayingcode plugins enable ios-simulator
kayingcode plugins disable browser-use
kayingcode plugins enable restore-legacy-sessions
kayingcode plugins disable ios-simulator
```

本地插件可以放在任意目录，再写入用户配置。配置中本地插件目录默认启用：

```json
{
  "plugins": {
    "enabled": true,
    "dirs": ["/absolute/path/to/my-plugin"]
  }
}
```

### 插件清单

MCP 配置可通过 `mcpServers` 直接写在 `.kayingcode-plugin/plugin.json`。插件可以同时提供 `.mcp.json` 和清单中的 `mcpServers`；同名 server 冲突时，以选中清单的 `mcpServers` 为准。

当前 kayingcode 插件面支持字段：

- `name`、`version`、`description`、`author`、`license`
- `skills`：包含 `SKILL.md` 的一个或多个相对目录
- `commands`：自定义 Markdown 命令的一个或多个相对目录
- `mcpServers`：内联 MCP server 配置，或配置文件的相对路径
- `userConfig`：`${user_config.key}` 插值使用的选项默认值

内联 MCP 配置示例：

```json
{
  "name": "ios-simulator",
  "version": "0.1.0",
  "skills": "skills",
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["${KAYINGCODE_PLUGIN_ROOT}/dist/mcp/server.js"],
      "cwd": "${KAYINGCODE_PROJECT_DIR}",
      "env": {
        "PLUGIN_DATA": "${KAYINGCODE_PLUGIN_DATA}",
        "DEFAULT_DEVICE": "${user_config.default_device}"
      }
    }
  },
  "userConfig": {
    "default_device": {
      "type": "string",
      "default": "iPhone 16"
    }
  }
}
```

MCP 配置可使用以下变量：`${KAYINGCODE_PLUGIN_ROOT}`、`${KAYINGCODE_PLUGIN_DATA}`、`${KAYINGCODE_PROJECT_DIR}`、`${user_config.key}` 和 `${KAYINGCODE_SOME_ENV}`。只有 `KAYINGCODE_` 前缀的环境变量会被插值。必需变量缺失时，对应 MCP server 会被禁用并生成插件诊断信息。

建议的本地插件结构：

```txt
my-plugin/
  .kayingcode-plugin/plugin.json
  .mcp.json
  skills/my-skill/SKILL.md
  commands/my-command.md
  src/
```

面向 kayingcode-cli 的 MCP server，优先使用 Node 常规 package build 和 `bin` 产物；所有进程、文件和网络副作用都应留在 MCP server 边界内。

## MCP 配置

kayingcode 从主 JSON 配置读取 MCP server。默认用户配置路径为 `~/.kayingcode/cli/config.json`，条目位于 `mcp.servers`。MCP 默认启用；只有需要显式开关时才配置 `features.mcp`。当前 CLI 不会扫描已启用插件之外的独立 `mcp.json` 或 `.mcp.json` 文件。

```json
{
  "features": { "mcp": true },
  "mcp": {
    "servers": {
      "filesystem": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
        "cwd": ".",
        "timeoutMs": 30000
      },
      "docs": {
        "type": "http",
        "url": "https://mcp.example.com/mcp",
        "headers": { "Authorization": "Bearer <token>" }
      },
      "legacy-sse": {
        "type": "sse",
        "url": "https://mcp.example.com/sse",
        "enabled": false
      }
    }
  }
}
```

当前支持的 MCP server 类型：

- `stdio`：必需 `command`；可配置 `args`、`cwd`、`env`、`enabled`、`timeoutMs`。`cwd` 相对当前工作目录解析；子进程继承 kayingcode 环境变量，并应用 `env` 覆盖值。
- `http`：必需 `url`；可配置 `headers`、`enabled`、`timeoutMs`。
- `sse`：必需 `url`；可配置 `headers`、`enabled`、`timeoutMs`。

MCP 工具会在首次模型请求前注册，并以 `mcp__<server>__<tool>` 暴露。在 CLI 会话中使用 `/mcp list`、`/mcp status`、`/mcp connect <server>` 和 `/mcp disconnect <server>` 查看或管理当前 session 的配置。

## Hooks 配置

kayingcode 从同一主 JSON 配置读取 hooks，默认路径通常是 `~/.kayingcode/cli/config.json`。Hooks 默认关闭；设置 `hooks.enabled` 为 `true`，并在 `hooks.events` 下配置进程 hook。

当前支持的事件：

- `SessionStart`：session context 初始化后、首条普通 prompt 发送前运行；matcher 可匹配 `startup` 或 `resume` 等来源，并可追加上下文。
- `UserPromptSubmit`：prompt 写入历史或发送给模型前运行；可用 `continue: false` 阻止 prompt，matcher 可匹配原始 prompt 文本。
- `PreToolUse`：客户端工具执行前运行；可拒绝、询问、允许、替换工具输入或添加模型可见上下文，matcher 匹配工具名。
- `PermissionRequest`：工具申请权限时运行；可允许、拒绝、更新权限或修改待处理的工具输入，matcher 匹配工具名。
- `PostToolUse`：工具成功后、结果返回模型前运行；可追加上下文。
- `PostToolUseFailure`：工具失败后、错误返回模型前运行；可添加恢复上下文。
- `Stop`：本轮即将结束且没有下一次客户端工具调用时运行；可提供反馈并通过 `continue: true` 请求模型再执行一步。空 continuation 会被忽略，连续执行次数有上限。

配置示例：

```json
{
  "hooks": {
    "enabled": true,
    "timeoutMs": 60000,
    "maxOutputBytes": 32768,
    "events": {
      "SessionStart": [{
        "matcher": "startup|resume",
        "hooks": [{ "type": "process", "command": "node", "args": ["./scripts/session-start-hook.mjs"] }]
      }],
      "PreToolUse": [{
        "matcher": "^(Bash|Write|Edit)$",
        "hooks": [{ "type": "process", "command": "node", "args": ["./scripts/pre-tool-hook.mjs"], "timeoutMs": 5000 }]
      }],
      "Stop": [{
        "hooks": [{ "type": "process", "command": "node", "args": ["./scripts/stop-hook.mjs"] }]
      }]
    }
  }
}
```

配置字段：`modelStream.idleTimeoutMs`（模型 SSE 事件间初始空闲超时，默认 `600000`）、`hooks.enabled`（默认 `false`）、`hooks.timeoutMs`（hook 默认超时 `60000`）、`hooks.maxOutputBytes`（stdout/stderr 上限 `32768`）、`hooks.events.<EventName>`（按顺序运行的 matcher 组）、`matcher`（可选 JavaScript 正则，省略则匹配全部）、`hooks`（hook 列表）、`type`（当前仅 `process`）、`command`（argv 执行的程序）、`args`、`timeoutMs`（单 hook 覆盖）及 `statusMessage`（状态标签）。

每个进程 hook 从 stdin 接收一个 JSON hook input，可向 stdout 输出一个 JSON 对象。空 stdout 视为无操作。非 JSON、schema 无效、超时，以及退出码不是 `2` 的非零退出会记录为 hook 失败，默认不让 turn 崩溃。退出码 `2` 表示显式 block/deny。

示例输出：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "使用本仓库内部 API 迁移清单。"
  }
}
```

```json
{
  "continue": false,
  "reason": "不要在此工作区运行破坏性 shell 命令。",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "项目 hook 已阻止此操作。"
  }
}
```

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "结束前请确认答复说明了测试覆盖。"
  }
}
```

## 打包策略

1. 使用 `npm run build` 生成普通 Node CLI bundle。
2. `npm run sea` 默认构建当前宿主平台目标。
3. 使用 `npm run sea -- --target <platform-arch>` 或 `npm run sea -- --all` 打包指定目标。
4. SEA 目标使用与当前 `process.versions.node` 相同版本的官方 Node.js binary，并通过 `SHASUMS256.txt` 校验。
5. SEA 兼容性验证完成前，不要把原生 addon 或运行时动态导入放进 CLI 核心。
6. 增加更丰富的 TUI 库前，先做兼容性验证。
