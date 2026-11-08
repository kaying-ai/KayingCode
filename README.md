# KayingCode

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="KayingCode" width="128" height="128" />
</div>
<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

**KayingCode 以 ZCode harness 为载体，全面接入游戏开发场景，打造面向多游戏引擎、多平台的游戏开发 harness。** 它将 Agent、引擎工具、运行预览与测试验证连接起来，支持从玩法目标、实现到结果验证的持续迭代。

我们尽可能保留 ZCode 的通用编程能力、交互和运行逻辑，将核心改造集中在游戏开发工作流、引擎接入与多平台验证。多引擎、多平台是持续扩展方向；当前能力与已验收范围见各应用文档。项目基于 [官方 ZCode](https://github.com/zai-org/ZCode)，遵循 Apache-2.0，为非官方衍生项目。

## 游戏开发工作流

- **项目与引擎工具**：游戏中心连接项目列表、本地工作区与开发参考；当前内置 TapTap Maker 插件提供项目、诊断、构建及发布准备工具。
- **实现与运行预览**：Agent 在现有 harness 中执行开发任务，本地 Desktop 提供游戏预览、界面截图和功能验证入口。
- **视觉对照与迭代**：双预览与像素差异用于对照结果；视觉修复有预算与停止条件，完成情况以真实运行、玩法和视觉验收为准。
- **原型与转写**：可用 three.js 网页 Demo 验证原型，再按模块适配到 TapTap Maker，并通过实际预览核对玩法与视觉结果。
- **引擎扩展与平台接入**：通过插件、MCP、Skills 和现有接口接入引擎及工具，保留通用编程能力；具体支持范围以当前插件和应用文档为准。

## 使用与连接

本地使用 Desktop 或 CLI，无需注册 KayingCode 账号。手机接入时，在桌面左下角打开远控入口并扫码，浏览器即可连接同一 Host 与会话。设备身份和浏览器凭据由客户端自动管理，用户无需注册、设置密码或填写 token；授权到期、注销或清除浏览器存储后重新扫码即可。

自托管时，将 Web 与 Relay 部署到同一 HTTPS 地址，按 [Relay 部署教程](apps/kayingcode-relay-cloudflare/DEPLOYMENT.md) 连接 Desktop。移动入口包括 [Taro（H5/微信小程序）](apps/kayingcode-mobile-taro/README.md) 和 [Flutter](apps/kayingcode-mobile-flutter/README.md)，各渠道的接入方式及已验收平台见应用文档。Desktop 面向 Windows、macOS、Linux，支持 SSH/WSL/Docker 开发环境。

| 入口                      | 用途                                             | 开发命令                         |
| ------------------------- | ------------------------------------------------ | -------------------------------- |
| Desktop                   | 本地游戏开发、预览和调试工作台                   | pnpm run dev:desktop             |
| Web / KayingCode 命令行版 | 浏览器与终端入口，组装 Web、TUI、后端和 Agent    | pnpm run dev:web                 |
| Agent CLI                 | 终端中的 kayingcode，也为 Desktop/Web 提供运行时 | pnpm --filter @zcode/cli run dev |

## 阅读导航

- [部署指南](docs/deploy.md)：选择 Desktop、Web、CLI 或移动接入方式。
- [Relay 文档](apps/kayingcode-relay-cloudflare/README.md)：实现、流程和首次部署，支持中英文切换。
- [贡献指南](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md)、[安全报告](SECURITY.md)。

本项目按首次发布形态提供说明；安装包与平台支持以实际构建和验收为准。本地模式使用自配 Provider、内置或本地插件；模型调用会向配置端点发送所需上下文，TapTap 等平台工具有各自的登录、授权及发布确认。远控扫码授权是设备连接机制，不是订阅或额度账号。数据与网络行为见 [NOTICE.md](NOTICE.md)。

## 分支与协作

| 分支 | 用途 |
| --- | --- |
| `main` | KayingCode 的 GitHub 默认分支。功能、修复和版本准备经 PR 与 CI 合入。 |
| `zcode-main` | 官方 ZCode `main` 的镜像，保留上游源码与文档，只快进。 |
| 短期主题分支 | 从 `main` 创建，例如 `project-drag`、`fix/session-reconnect`，合入后清理。 |

```bash
git fetch origin --prune
git switch main
git merge --ff-only origin/main
git switch -c project-drag
node scripts/check-workspace-freshness.mjs
```

GitHub 管理产品协作与发布，Gitee 提供产品源码备份和克隆加速。维护者从 `release/<版本>` 分支提交版本准备 PR，再对通过发布验收的 `main` 提交打 `kaying-code-v<版本>` 标签。[仓库同步和发布指南](docs/deploy/github-gitee-repository.md)

### 上游连接与更新

原始源码与文档可在 GitHub 的 [zcode-main](https://github.com/kaying-ai/KayingCode/tree/zcode-main) 查看。维护者在 clone 中配置官方上游 [zai-org/ZCode](https://github.com/zai-org/ZCode)，已有 `upstream` 时用 `git remote set-url upstream` 修正地址。

```bash
git remote add -t main upstream https://github.com/zai-org/ZCode.git
git fetch --no-tags upstream
```

同步镜像与采纳改动分别执行。镜像按[仓库同步指南](docs/deploy/github-gitee-repository.md#同步-zcode-main)更新。采纳前先保存当前工作，再从同步后的产品 `main` 建适配分支，比较已验收基线与官方最新提交。

```bash
git fetch origin --prune
git fetch --no-tags upstream
git switch main
git merge --ff-only origin/main
git switch -c upstream/zcode-3-17-2
node scripts/check-workspace-freshness.mjs
upstream_base=$(node -p "require('./UPSTREAM_BASE.json').commit")
git log --oneline "$upstream_base"..upstream/main
git diff --stat "$upstream_base" upstream/main
```

按模块更新 spec、适配实现和测试，记录采纳项、保留的差异和未完成项，验证后提交 PR。只有目标差异全部审阅、采纳或明确排除并验收后，才更新 `UPSTREAM_BASE.json`。KayingCode 自身版本独立管理。

## 初始化

准备 Git、Node.js **24.14.0** 和 pnpm **10.31.0**，版本以 [mise.toml](mise.toml) 为准。以下开发和打包命令均在仓库根目录执行。

```bash
pnpm run bootstrap
```

`pnpm run bootstrap` 安装 workspace 依赖、准备桌面本地运行资源，再执行 `build:bootstrap`。

Agent CLI 与运行时源码位于 [apps/zcode-cli/packages/cli/](apps/zcode-cli/packages/cli/)，作为普通目录随本仓库一起克隆，无需单独拉取或初始化 Git submodule。

根据需要选择其他初始化或构建入口：

| 命令                               | 用途                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| `pnpm install`                     | 安装依赖                                                           |
| `pnpm run prepare:desktop-runtime` | 准备桌面运行资源，默认包含远程资源准备                             |
| `pnpm run prepare:remote-assets`   | 单独准备远程运行资源                                               |
| `pnpm run bootstrap:with-remote`   | 初始化依赖、本地与远程资源，并串行构建相关包；跳过桌面应用 bundle  |
| `pnpm run build`                   | 经 turbo 拓扑执行各 workspace 包的构建脚本，包括包内的资源准备步骤 |

默认 `bootstrap` 跳过远程资源准备，适合本地桌面开发。使用远程工作区或验证远程发行资源时，再运行对应准备命令。

## 开发与运行

### 桌面版

```bash
pnpm run dev:desktop

# 使用测试环境
pnpm run dev:desktop:test
```

`pnpm run dev:desktop` 默认等同于 `pnpm run dev:desktop:prod`，使用生产服务配置。启动脚本会准备本地运行资源、构建桌面 Agent，再启动 Electron 和源码监听。Agent 构建带源码指纹缓存：相关输入未变且产物齐全时跳过全量重建（日常无改动启动可省约 20s）。

需要独立开发数据目录时，可设置 `KAYINGCODE_DATA_BASE_DIR`。例如在 macOS / Linux 中：

```bash
KAYINGCODE_DATA_BASE_DIR="$HOME/.kayingcode-dev-home" pnpm run dev:desktop:test
```

### 远程功能（SSH/WSL）

先执行 `pnpm run bootstrap:with-remote` 准备远程资源（mock-cdn），再 `pnpm run dev:desktop`；连接远程项目时资源选择「本地下载后上传」。开发态资源取自本地 `packages/desktop/mock-cdn` 和本地构建产物，经 SFTP 上传到远程，不访问 CDN。

### Web 开发

只开发 Web 或后端时，可从干净克隆安装依赖、生成工作区类型产物，再启动开发服务。Windows 建议使用较短的克隆路径，例如 `D:\src\KayingCode`。

```bash
pnpm install --frozen-lockfile --child-concurrency=1
pnpm run typecheck
pnpm run dev:web

# 指定后端工作区（macOS / Linux）
KAYINGCODE_SERVER_WORKSPACE=/path/to/project pnpm run dev:web
```

该命令同时启动 Web 开发服务器（默认 `http://localhost:5173`）和后端（默认 `http://localhost:3030`）；浏览器访问前者。`/ws` 和一般 `/api` 请求代理到本地后端，`/api/v1/oauth/token` 单独代理到当前配置的产品服务。

Agent 源码修改后，执行 `pnpm exec turbo run build --filter=@zcode/cli...` 并重启服务。需要验证完整发行包时，按下方“KayingCode 命令行版”打包章节解压运行。

### KayingCode 命令行版

命令行发行包包含 TUI、Web 和 Agent，统一使用 `kayingcode` 启动：无参数进入 TUI；第一个参数为 `--web` 时启动 Web；其他参数交给现有 Agent CLI 处理。两种模式都在本机运行，无需 Electron。

```bash
# 默认进入终端交互界面
kayingcode

# 启动 Web 界面
kayingcode --web

# 指定项目和端口，不自动打开浏览器
kayingcode --web --workspace /path/to/project --port 3030 --no-open

# 查看 CLI 或 Web 参数
kayingcode --help
kayingcode --web --help
```

Web 模式默认工作目录为当前目录，监听 `127.0.0.1`，默认不启用访问令牌，自动选择空闲端口并打开浏览器。访问终端输出的地址，按 `Ctrl+C` 停止服务。局域网访问可使用 `--host 0.0.0.0`；监听非本机地址时默认生成访问令牌，使用终端输出的带令牌链接。可通过 `--token` 指定令牌或 `--no-token` 关闭令牌认证。

直接启动通用 Web 服务的 HTTP 入口时，通过 `KAYINGCODE_SERVER_AUTH_TOKEN` 配置 API／WebSocket 认证；通过程序接口创建服务时，使用 `authToken` 选项。

构建方式见下方打包章节。`pnpm run build:kayingcode` 只生成发行包，不会替换 `PATH` 中已有的 `kayingcode`。如果命令仍指向旧安装或其他源码目录，macOS / Linux 可用 `command -v kayingcode` 检查，Windows 可用 `where.exe kayingcode` 检查。

### CLI 源码开发

直接开发 TUI 或 Agent 时，运行源码入口：

```bash
pnpm --filter @zcode/cli run dev --help
pnpm --filter @zcode/cli run dev

# 构建 CLI 及其 workspace 依赖
pnpm exec turbo run build --filter=@zcode/cli...
node apps/zcode-cli/packages/cli/dist/kayingcode.cjs --help
```

这个入口直接运行 Agent CLI，不经过发行包的 `--web` 分流。开发 Web 用 `pnpm run dev:web`；验证统一的 `kayingcode` 命令，用下方解压后的 `bin/kayingcode.mjs`。

## 配置

根目录 [.env.example](.env.example) 提供服务地址与构建配置示例，可按需复制到 `.env`，本地覆盖放入 `.env.local`。Desktop 的开发环境通过 `dev:desktop:test` / `dev:desktop:prod` 选择。

| 配置                                      | 用途                                             |
| ----------------------------------------- | ------------------------------------------------ |
| `KAYINGCODE_DATA_BASE_DIR`                | 应用数据基目录，数据写入其下的 `.kayingcode/`    |
| `KAYINGCODE_SERVER_WORKSPACE`             | Web 后端的工作区路径                             |
| `KAYINGCODE_BUILTIN_PROVIDER_CONFIG_FILE` | 本地 Provider 配置文件路径；未设置时使用内置配置 |
| `KAYINGCODE_DIST_BASE_URL`                | 命令行安装脚本使用的下载根地址                   |

运行时变量可在启动命令的环境中显式设置。随客户端发布的默认配置见 [config/README.md](config/README.md)。

## 打包

第三方声明生成、发行校验流程及声明在发行物中的位置见 [third-party/README.md](third-party/README.md)。

### 桌面版

```bash
# 自动识别当前系统并构建对应的安装包
pnpm run package

# 等价于 bundle:desktop 不带参数；也可显式指定目标平台与 CPU 架构
pnpm run bundle:desktop -- --os win --arch x64

pnpm run bundle:desktop -- --help
```

未显式指定 `--os`/`--arch` 时，默认构建当前系统与当前架构对应的安装包，默认输出目录为 `packages/desktop/dist/`。打包默认产出正式版本（`KayingCode-<version>-<platform>-<arch>.exe`，连接生产后端）；需要测试后端的 Preview 包时显式 `KAYINGCODE_ENV=test pnpm run package`。`--os` 支持 `mac`、`win`、`linux`，`--arch` 支持 `x64`、`arm64`；实际打包与签名需要目标平台对应的工具和配置。

安装：双击打开产物 DMG，将 KayingCode 拖入"应用程序"。本地构建未签名，首次打开若被 macOS 拦截，执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/KayingCode.app
```

### KayingCode 命令行版

构建入口为 `pnpm run build:kayingcode`。脚本会依次构建 CLI/TUI、后端和 Web，收集 TUI 的原生库、worker 与运行时依赖，再组装发行包；运行发行包仍需要 Node.js，版本以 `mise.toml` 为准。

打包前必须设置下载根地址 `KAYINGCODE_DIST_BASE_URL`（可放在 `.env`、`.env.local` 或环境变量中），也可以通过 `--base-url` 传入。以下地址是占位示例，发布时替换为实际托管地址：

```bash
pnpm run build:kayingcode --base-url https://downloads.example.com/kayingcode/

# 已配置 KAYINGCODE_DIST_BASE_URL 时
pnpm run build:kayingcode

# 仅重新组包，复用已有的 Agent、后端和 Web 构建产物
pnpm run build:kayingcode --skip-build

# 查看版本、输出目录等可选参数
pnpm run build:kayingcode --help
```

默认版本取根目录 `package.json`，输出目录为 `dist/kayingcode/`：

- `releases/<version>/kayingcode-<version>.tar.gz`：运行包。
- `releases/<version>/sha256.txt`：校验摘要。
- `latest.json`、`install.sh`：版本索引和安装脚本。

完整目录可上传到配置的下载根地址。安装脚本从该地址下载运行包，默认安装到 `~/.kayingcode/runtime`，并在 `~/.local/bin` 创建 `kayingcode` 命令。安装目录可通过 `KAYINGCODE_DIST_HOME` 修改，命令目录可通过 `KAYINGCODE_DIST_BIN_DIR` 修改。

本地调试打包产物时，可直接解压运行，无需上传或安装：

```bash
kayingcode_version=$(node -p "require('./dist/kayingcode/latest.json').version")
mkdir -p dist/kayingcode/debug
tar -xzf "dist/kayingcode/releases/$kayingcode_version/kayingcode-$kayingcode_version.tar.gz" \
  -C dist/kayingcode/debug
# 默认启动 TUI
node dist/kayingcode/debug/kayingcode/bin/kayingcode.mjs

# 启动 Web
node dist/kayingcode/debug/kayingcode/bin/kayingcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

浏览器打开 `http://127.0.0.1:3030`，即可验证同一后端服务托管 Web 页面和 Agent 的完整链路。该端口需要空闲；如正在运行 `pnpm run dev:web`，可改用其他 `--port`。

## 仓库结构

### apps：可独立运行或交付的入口

| 目录                                                                    | 当前包名或工程入口             | 职责                                                             |
| ----------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| [`packages/desktop`](packages/desktop/)                                 | `@zcode/desktop`               | Electron Main、窗口级 Local Host、Renderer 与桌面打包            |
| [`packages/web`](packages/web/)                                         | `@zcode/web`                   | 浏览器工作台与 Relay Web 界面                                    |
| [`apps/kayingcode-site`](apps/kayingcode-site/)                         | `kayingcode-product-site`      | 独立静态产品站与本地预览                                         |
| [`apps/zcode-cli/packages/cli`](apps/zcode-cli/packages/cli/)           | `@zcode/cli`                   | Agent CLI/TUI 入口与 SEA 发行                                    |
| [`packages/zcode-server-cli`](packages/zcode-server-cli/)               | `@zcode/server-cli`            | 上游常驻服务、远程 staging 与代理；保留 SSH/WSL/Docker 开发容器  |
| [`apps/kayingcode-relay-cloudflare`](apps/kayingcode-relay-cloudflare/) | `@kayingcode/relay-cloudflare` | Relay、设备授权与同源 Web 工作台                                 |
| [`apps/kayingcode-mobile-taro`](apps/kayingcode-mobile-taro/)           | `@kayingcode/mobile`           | Taro 微信小程序与 H5 客户端                                      |
| [`apps/kayingcode-mobile-flutter`](apps/kayingcode-mobile-flutter/)     | `pubspec.yaml`                 | Flutter Android/iOS 客户端；使用 Dart 工具链，不属于 pnpm 工作区 |

### packages：跨入口复用的能力

| 目录                                               | 职责                                              |
| -------------------------------------------------- | ------------------------------------------------- |
| `apps/zcode-cli/packages/adapters`                 | Agent 文件、网络、模型、插件等 I/O 适配           |
| `apps/zcode-cli/packages/bootstrap`                | Agent 服务与协议装配                              |
| `apps/zcode-cli/packages/shared-types`             | Agent CLI 共享类型                                |
| `apps/zcode-cli/packages/contracts`                | Agent 端口、事件与工具契约                        |
| `packages/agent-gateway`                           | Web Host 和 Agent Node 共用的 HTTP/WS RPC ingress |
| `apps/zcode-cli/packages/i18n`                     | Agent 国际化资源                                  |
| `apps/zcode-cli/packages/core`                     | Agent 命令、会话与工具运行时                      |
| `apps/zcode-cli/packages/telemetry`                | Agent 遥测事件与处理能力                          |
| `packages/client`                                  | Agent 客户端 SDK 与连接适配                       |
| `apps/zcode-cli/packages/dynamic-workflow`         | 动态工作流引擎核心                                |
| `apps/zcode-cli/packages/dynamic-workflow-runtime` | 动态工作流脚本的沙箱执行与宿主桥接                |
| `packages/mobile-client-core`                      | 手机、H5、小程序共用的配对、连接与投影逻辑        |
| `packages/model-option-map`                        | 模型选项映射的解析与求值                          |
| `apps/zcode-cli/packages/node-repl-host`           | JavaScript 执行与 Browser Use 宿主                |
| `packages/provider`                                | Provider 公共能力                                 |
| `packages/provider-node`                           | Provider 的 Node 实现                             |
| `packages/rpc`                                     | 跨进程 RPC 框架                                   |
| `packages/server`                                  | Web Host 的 HTTP、WebSocket 与远程连接服务        |
| `packages/services`                                | 业务服务与持久化                                  |
| `packages/shared`                                  | 多端共享协议、平台接口与类型                      |
| `apps/zcode-cli/packages/swift-bridge`             | Swift 互操作占位包                                |
| `apps/zcode-cli/packages/tui`                      | Agent 终端 UI                                     |
| `packages/ui`                                      | 共享 React 组件、hooks 与 Zustand 状态            |

### 其他目录

| 目录                                  | 职责                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `plugins/`                            | 可启停的内置插件与随包资产；Computer Use 运行实现位于此处 |
| `tools/`                              | 开发、调试、研究与验证工具                                |
| `scripts/`、`config/`、`third-party/` | 构建维护脚本、发行配置与第三方声明材料                    |

新增文件的落点见 [仓库工作规则](AGENTS.md) 和 [应用目录说明](apps/README.md)，完整包信息见 [生成包地图](SOURCE_PACKAGES.md)。包或插件变更后运行 `pnpm run source:plugins`、`pnpm run source:map` 和 `pnpm run source:check`。

## 项目声明

功能与优惠范围、维护规则、执行与数据风险，以及许可和第三方版权说明，详见 [NOTICE.md](NOTICE.md)。
