# kayingcode-desktop（桌面客户端）部署

> 应用目录：`packages/desktop`；包名 `@zcode/desktop`；产品名 `KayingCode`。
> 返回 [部署汇总](../deploy.md)。

桌面客户端是个人版默认运行形态：Renderer → 窗口级 Local Host → stdio Agent，默认本地执行。也支持把执行放到远端（SSH / WSL / Docker / 远程 Agent）。Main 只负责窗口、原生操作、进程调度和消息转发，**不承载 task/session 业务状态**。

---

## 1. 本地开发运行

首次克隆后：

```sh
node scripts/check-workspace-freshness.mjs
pnpm install
pnpm run dev:desktop          # = dev:desktop:prod（node scripts/dev-desktop-env.mjs production）
```

其他开发入口（根 `package.json`）：

| 命令                              | 用途                    |
| --------------------------------- | ----------------------- |
| `pnpm run dev:desktop`             | 生产模式开发（默认）    |
| `pnpm run dev:desktop:test`        | 测试环境变量模式        |
| `pnpm run dev:desktop:bytecode`    | 生产模式 + Agent 字节码 |
| `pnpm run dev:desktop:remote-prod` | 远程生产联调            |

---

## 2. 构建

```sh
pnpm run build:desktop-agent:bytecode   # 可选：构建 Agent 字节码
pnpm --filter @zcode/desktop run build   # = prepare:runtime-assets + build:no-runtime-assets
pnpm --filter @zcode/desktop run build:no-runtime-assets
```

- `build:no-runtime-assets` = `prepare:build-meta` + 生产构建脚本，不预取运行时资源，适合 CI/快速验证。
- `build` 额外执行 `prepare:runtime-assets`（下载/准备随包运行时资源）。

桌面 `package.json` **无 `version` 字段**，dev 下 `app.getVersion()` 会退化为 Electron 版本。产品版本取自构建元数据（`scripts/build-metadata.mjs`），回落到根 `package.json` 的 `0.1.0`；「关于」页显示该版本。

---

## 3. 打包与分发

Windows 从测试密钥、正式证书、签名构建到上传和自动更新验收的逐步流程，见 [Windows 发布教程](kayingcode-desktop-windows-release.md)。

```sh
pnpm run bootstrap            # 安装依赖并执行完整检查
pnpm run package              # = bundle:desktop（--filter @zcode/desktop bundle）
pnpm run bundle:desktop -- --help   # 查看其他系统/架构的打包参数
```

打包流程：`packages/desktop/scripts/bundle.mjs` + `electron-builder.config.js`。产物默认在 `packages/desktop/dist/`。

- **跨平台构建**：在各目标平台（Windows/macOS/Linux）构建对应 x64/arm64 安装包；跨平台打包需要对应平台工具链。
- **签名与公证**：正式分发需要平台签名（macOS 签名+公证、Windows 代码签名、Linux 按制品类型）。`pnpm run doctor:macos-release` 可核查 macOS release 应用。
- **自建未签名包**：按组织分发流程处理，**不能**把关闭系统安全校验（Gatekeeper/SmartScreen）作为客户默认安装步骤。
- macOS DMG 拖入"应用程序"，Windows 用交付的安装程序，Linux 按制品类型安装。分发时提供校验信息（sha256）。

`packages/ui/src/assets/KayingCode.svg` 是 KY 品牌标志矢量源；图标母版在 `assets/brand/kayingcode.png`，由 `scripts/generate-kayingcode-icons.py` 生成各平台资产。

---

## 4. 自动更新

桌面依赖 `electron-updater`。发布通道与 CDN/更新源按组织部署配置；更新元数据与产物版本必须一致，且只发布验收过的版本。桌面 `mock-cdn/releases/` 用于本地/联调，不是生产更新源。

---

## 5. 个人版：安装后使用

1. 从实际交付渠道取得对应 OS/架构的安装包，核对发布版本与校验信息。
2. 安装并打开 KayingCode。
3. 打开有读写权限的项目目录（不要首次就用系统目录或含生产凭据的目录）。
4. 配置可执行的模型供应商/凭据，或使用发行版提供的登录方式。内置模型元数据不等于已有可用 API Key。
5. 新建会话发一条简单问题；再让 Agent 在测试项目创建文件并检查差异，确认模型、文件与 Git 能力。
6. 关闭重开，确认项目和历史会话可访问；制定项目与应用数据备份方式。

个人最小部署**无需 Relay、PostgreSQL 或 Redis**。默认数据基目录是用户 home 下的 `.kayingcode/`；项目在打开的目录里。敏感备份要同时考虑项目文件和应用配置/会话，不能只复制安装包。

`KayingCode.localrun` 没有官方 endpoint 时，公共 Client API 应使用 ApiMock 本地返回；**不要**为解决配置报错而填假 URL。模型 endpoint 是另一项配置，按所选模型方案提供。

---

## 6. 远程工作区

| 方式       | 适用                          | 要点                                                                                               |
| ---------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| SSH        | 已有 POSIX 开发机             | 桌面管理远端资源部署与连接；开发态先 `pnpm run bootstrap:with-remote`，资源选"本地下载后上传"       |
| WSL        | Windows 用户跑 Linux 项目     | 本机 Linux 环境，不需要公网 Relay                                                                  |
| Docker     | 本机容器开发                  | 由桌面部署并连接开发容器中的当前远端运行时                                      |

这三种 remote 当前要求 POSIX shell，**不支持 Windows 原生远程主机**。不要暴露 Docker daemon/socket 到公网；container 工作目录限制不自动成为 Agent 的文件系统沙箱。平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`）注入，不直接调用 `window.kayingcode`。

---

## 7. 验收

| 场景       | 操作                                  | 通过条件                                         |
| ---------- | ------------------------------------- | ------------------------------------------------ |
| 安装/启动  | 安装对应 OS/架构包并启动              | 能打开窗口，版本与交付一致                       |
| 项目/模型  | 打开项目，配置模型，发一条消息        | 实际获得模型响应                                 |
| 文件/Git   | 让 Agent 创建文件并查看差异           | 产物与差异正确                                   |
| 历史会话   | 关闭重开                              | 项目与历史会话可访问                             |
| 远程工作区 | 按所选 remote 连接并验证会话/文件/Git | 目标远端可用，Core 只监听 loopback（远程 Agent） |
| 连续链路   | 长会话 + 断线/恢复                    | `desktop-continuous` 语义正确，无 stale 世代污染 |

代码改动需执行 `pnpm run typecheck` 与 `pnpm run lint`；交互改动需要 E2E 场景。

---

## 8. 源码依据

- `packages/desktop/package.json`、`electron-builder.config.js`、`scripts/bundle.mjs`、`scripts/build-metadata.mjs`、`scripts/prepare-runtime-assets.mjs`
- `packages/ui/src/SSHDialog.tsx`（远程连接入口）、`packages/shared/src/platform.ts`（`IPlatformService`）、`packages/server/src/remote/remotePlatformSupport.ts`（POSIX 边界）
- `assets/brand/kayingcode.png`、`scripts/generate-kayingcode-icons.py`（图标资产）
