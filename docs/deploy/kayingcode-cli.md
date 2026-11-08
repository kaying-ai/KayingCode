# kayingcode-cli（统一命令行）部署

> 应用目录：`apps/zcode-cli/packages/cli`；包名 `@zcode/cli`；命令 `kayingcode`。
> 返回 [部署汇总](../deploy.md)。

TypeScript + Node.js 的 Coding Agent CLI，支持主流模型和操作系统。默认产物是普通 Node CLI bundle；SEA（单文件可执行程序）是可选打包方式。


---

## 1. 本地开发

```sh
pnpm run bootstrap
pnpm --filter @zcode/cli run dev -- --help
pnpm --filter @zcode/cli run build
pnpm --filter @zcode/cli run start -- doctor --json
pnpm --filter @zcode/cli run test
```

Runtime 代码没有生产依赖，使用 Node 内置模块处理参数解析和终端交互。

---

## 2. 构建产物

### 2.1 普通 Node bundle

```sh
pnpm --filter @zcode/cli run build   # node scripts/build.mjs → dist/kayingcode.cjs
```

`bin` 指向 `./dist/kayingcode.cjs`，运行于安装了 Node `24.14.0`（以 `mise.toml` 为准）的环境。

### 2.2 SEA 单文件可执行程序（可选）

```sh
pnpm --filter @zcode/cli run sea                       # 当前宿主平台
pnpm --filter @zcode/cli run sea -- --target linux-x64 --target win-x64
pnpm --filter @zcode/cli run sea -- --all
# 或仓库根：
pnpm run build:sea        # = pnpm --dir apps/zcode-cli/packages/cli run build:sea
pnpm run build:sea:all
```

打包策略：

1. `build` 生成普通 Node CLI bundle。
2. `sea` 默认构建当前宿主平台目标。
3. `sea -- --all` 打包全部目标。
4. SEA 目标使用与当前 `process.versions.node` 相同版本的官方 Node.js binary，并通过 `SHASUMS256.txt` 校验。
5. SEA 兼容性验证完成前，不要把原生 addon 或运行时动态导入放进 CLI 核心。
6. SEA 在某个平台失败时，普通 CLI bundle 仍可作为运行产物。

---

## 3. 统一发行包（发布给客户）

在仓库根构建（下载根地址需为自己管理的真实托管地址）：

```sh
pnpm run build:kayingcode --base-url https://downloads.example.com/kayingcode/
```

输出 `dist/kayingcode/`，包含 `latest.json`、`install.sh`、版本 tar 与 `sha256.txt`。发布者验证摘要、上传完整目录，并交付自己的安装说明。

本地测试无需发布：

```sh
kayingcode_version=$(node -p "require('./dist/kayingcode/latest.json').version")
mkdir -p dist/kayingcode/debug
tar -xzf "dist/kayingcode/releases/$kayingcode_version/kayingcode-$kayingcode_version.tar.gz" -C dist/kayingcode/debug
node dist/kayingcode/debug/kayingcode/bin/kayingcode.mjs --web --workspace "$PWD" --port 3030 --no-open
```

### 3.1 版本发布（release-it）

```sh
pnpm run release           # 根 release-it
pnpm run release:cli       # 应用级 release-it（apps/zcode-cli/packages/cli/.release-it.json）
pnpm run release:cli:dry   # 干跑
```

---

## 4. 使用

先确认命令指向正确安装：

```sh
# macOS/Linux
command -v kayingcode && kayingcode --help && kayingcode --web --help
# Windows
where.exe kayingcode
```

TUI 与 Web：

```sh
cd /path/to/project
kayingcode                                   # 终端 TUI，本机运行时
kayingcode --web --workspace /path/to/project --port 3030 --no-open
```

- 默认 loopback、不启用访问令牌；**非本机监听默认生成令牌**。
- 受控局域网确需使用时：`kayingcode --web --workspace /path/to/project --host 0.0.0.0 --port 3030 --no-open`，只向有权限的人交付打印的带令牌链接，并配合受控网络/TLS。
- **不要**用 `--no-token` 作为对外部署缺省；该令牌不是每成员账号或团队 RBAC。

---

## 5. 验收

| 检查点   | 期望                                                        |
| -------- | ----------------------------------------------------------- |
| 安装指向 | `command -v` / `where.exe` 命中正确安装，`--help` 正常      |
| 模型     | 本机运行时能调用实际模型                                    |
| 文件/Git | Agent 能创建文件并查看差异                                  |
| TUI      | 交互、折叠/展开（`+`/`-`）、权限提示正常                    |
| `--web`  | loopback 工作台可访问；非 loopback 生成并校验令牌           |
| SEA      | 目标平台产物可执行；不支持的平台回退普通 bundle             |
| 发行包   | `dist/kayingcode/` 内 `latest.json`/tar/sha256 一致且可安装 |

代码改动需执行 `pnpm run typecheck` 与 `pnpm run lint`；CLI 还应运行 `pnpm --dir apps/zcode-cli/packages/cli run typecheck` 与 `... lint`。

---

## 6. 源码依据

- `apps/zcode-cli/packages/cli/package.json`、`scripts/build.mjs`、`scripts/build-sea.mjs`、`.release-it.json`
- 根 `package.json` 的 `build:kayingcode`、`build:sea`、`release*`
- `apps/zcode-cli/packages/cli/README.md`（插件与 MCP/Hooks 配置）、`BUILD-SPEC.md`
