# KayingCode 开发与贡献指南

本文面向参与 KayingCode 源码开发的贡献者，说明开发环境、分支约定、提交规则、PR 流程与发布机制。默认使用中文，文末附 English guide。

行为规范以各应用或包内的 `spec/` 为准；仓库级协作规则同时受 [AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [scripts/spec/branch-policy.md](scripts/spec/branch-policy.md) 约束。本文与上述文件冲突时，以更具体的规范为准。

## 1. 开始之前

### 1.1 工具版本

- Node.js 与 pnpm 版本以 [mise.toml](mise.toml) 为准（当前 Node `24.14.0`、pnpm `10.31.0`）。
- 安装依赖使用冻结锁文件：`pnpm install --frozen-lockfile`。
- Flutter 相关构建先阅读 [apps/kayingcode-mobile-flutter/AGENTS.md](apps/kayingcode-mobile-flutter/AGENTS.md) 的 SDK 切换规则，不要修改 `.fvmrc`、根 `pubspec.lock` 或全局 PATH。

### 1.2 开工检查

从 GitHub `main` 或其 fork 创建工作分支后，先运行：

```bash
node scripts/check-workspace-freshness.mjs
```

该脚本会拒绝落后于跟踪远端的基线。产品开发基线是 `origin/main`，不是 `zcode-main`。

```bash
git switch main
git pull --ff-only origin main
git switch -c fix/session-reconnect
pnpm install --frozen-lockfile
```

## 2. 分支约定

| 分支                                            | 用途                         | 规则                                                                       |
| ----------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `main`                                          | 产品默认分支                 | 所有功能、修复、文档和发布准备通过 PR 合入；不直接推送，不强推             |
| `zcode-main`                                    | 官方 ZCode `main` 的只读镜像 | 仅维护者从 `upstream/main` 原样快进；禁止合入产品提交或向官方上游推送      |
| `feature/<主题>` / `fix/<主题>`                 | 功能与缺陷修复               | 从最新 `main` 创建，名称使用小写英文与连字符，例如 `fix/session-reconnect` |
| `docs/<主题>` / `ci/<主题>` / `refactor/<主题>` | 文档、CI、重构               | 同上；一个分支只处理一个主题                                               |
| `release/<版本>`                                | 版本与变更日志准备           | 从 `main` 创建；仅在根目录运行 `pnpm run release`；通过 PR 合入后删除      |
| `kaying-code-v<版本>`                           | 正式发布标签                 | 必须指向通过发布验收的 `main` 提交；不指向发布分支                         |

补充约定：

- 外部贡献者从 fork 向 `origin/main` 提交 PR。
- 合并后删除主题分支；删除前确认没有独有提交或其他 worktree 占用。
- `gitee` 是 GitHub 产品仓的单向备份；`legacy` 仅用于查旧历史；二者都不接受产品 PR。
- 不要从 `zcode-main` 开发产品功能，也不要把产品提交合并进 `zcode-main`。

## 3. 提交机制与规则

### 3.1 提交信息格式

使用 Conventional Commits，变更日志由该格式生成：

```text
<type>(<scope>): <subject>

<body>

<footer>
```

- `type`：`feat`、`fix`、`chore`、`docs`、`refactor`；其他类型归入 “Other Changes”。
- `scope`：可选，使用模块名，例如 `desktop`、`mobile`、`relay`、`release`、`licenses`、`ui`、`remote`。
- `subject`：英文祈使句，简短描述做了什么，不加句号。
- `body`：说明为什么改、影响范围、关键取舍。涉及状态、时序、远端或异步同步时，用文字或图说明所有者与事件顺序。
- `footer`：关联 Issue（`Closes #123`）或声明破坏性变更。

破坏性变更使用 `!` 和 `BREAKING CHANGE:`：

```text
feat(protocol)!: rename remote session field

BREAKING CHANGE: remoteSessionId replaces sessionId in V2 frames.
```

示例：

```text
fix(desktop): handle web remote project navigation in Host

Route project navigation through the window-scoped Host so remote
sessions keep their workspace identity. Verified with the desktop unit
suite and a local Host attachment.
```

### 3.2 提交内容规则

- 一个提交只表达一个逻辑改动，不要把无关重构、格式化或二进制文件混入同一提交。
- 行为改动先更新所属应用或包的 `spec/`，再实现代码；根 `docs/` 只放部署文档。
- 修复 bug 时，在相关代码处用中文注释说明原因和修复依据。
- 生成文件不要手改：`SOURCE_PACKAGES.md`、官方插件 Contracts、第三方声明等通过脚本生成。
- 修改包或插件元数据后运行 `pnpm run source:plugins`、`pnpm run source:map` 和 `pnpm run source:check`。
- 不提交证书、私钥、真实 `.env`、抓包、会话数据或用户数据。
- 保留第三方版权、来源和许可声明；不要删除或改写不属于本项目的许可条款。
- 提交前确认没有把与本任务无关的本地改动一起暂存（例如本地构建产物或原生二进制）。

### 3.3 提交授权

向本仓库提交的贡献按 [AGPL-3.0-only](LICENSE) 授权。提交 PR 即表示你有权提供该贡献，并同意其按本项目许可分发。上游 ZCode 派生部分继续适用 Apache-2.0，插件与第三方组件保留各自声明的许可。

## 4. PR 流程

1. 从最新 `origin/main` 创建主题分支，完成 spec、实现和测试。
2. 本地运行与改动范围相关的检查（见第 5 节）。
3. 推送分支，向 `main` 提交 PR；PR 描述至少包含：
   - 产品规则或行为变化
   - 改动范围与关键取舍
   - 实际执行的验证及结果
   - 未验证的平台或边界
   - UI 改动附截图或录屏
4. 等待 `Source checks (Windows)` 通过。该检查覆盖公开快照、源码布局、类型、Lint、架构和 Taro 测试；维护者将其配置为 `main` 的合并检查。
5. 通过审查后合并，并删除主题分支。

约束：

- 不直接向 `main` 推送，不强推 `main` / `zcode-main`。
- 不把多个不相关主题塞进一个 PR。
- 合并前确认生成文件已更新、文档命令和文件真实存在。
- 不通过关闭检查、放宽架构基线或跳过测试来让 PR 变绿。

## 5. 验证清单

根目录常用命令：

| 用途             | 命令                                    |
| ---------------- | --------------------------------------- |
| 类型检查         | `pnpm run typecheck`                    |
| Lint             | `pnpm run lint` / `pnpm run lint:fix`   |
| 格式检查         | `pnpm run fmt:check`                    |
| 目录结构         | `pnpm run source:check`                 |
| 架构检查         | `pnpm run architecture:check --changed` |
| 提交前检查       | `pnpm run verify:pre-push`              |
| 未使用依赖与导出 | `pnpm run knip`                         |

补充要求：

- 测试入口以目标包当前的 `package.json` 和实际测试文件为准，不假定存在统一单测命令。
- 有行为改动时补充对应测试；交互改动补 E2E 场景。
- 状态、时序、远端或异步同步改动，需同时验证 Desktop `desktop-continuous` 与手机 `web-remote-replayable` 两种语义。
- 实际执行可用验证；未执行或环境受限时在 PR 中如实说明，不把已有失败写成通过。
- 仓库目前没有强制 git hook；不要依赖 hook，按上面的清单手动执行。

## 6. 代码与目录规则

- 源码应用定位见 [apps/README.md](apps/README.md)；包名与公开入口见 [SOURCE_PACKAGES.md](SOURCE_PACKAGES.md)。
- 跨包导入使用公开入口和现有路径别名；不跨域导入实现细节，不制造循环依赖。
- UI 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`，不直接调用 `window.kayingcode`。
- Zustand 状态位于 `packages/ui/src/store/`；避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界。
- 日志：UI 使用 `packages/ui/src/logger.ts`；服务层使用 `createServiceLogger(scope)`；不在日志中写入凭据、真实用户数据或内部服务地址。
- UI 改动前阅读 [DESIGN.md](DESIGN.md)；插件商店相关改动同时阅读 [CONTEXT.md](CONTEXT.md)。
- 代码改动使用架构治理技能：先运行架构检查，再读取目标模块的受控上下文。

## 7. 版本与发布

1. 从 `main` 创建 `release/<版本>`。
2. 同步版本：根 `package.json`、CLI、Taro、Flutter `pubspec.yaml`（含 build number）和两端展示版本必须一致。
3. 在该分支运行 `pnpm run release` 生成版本和变更日志提交；命令本身不创建标签、不推送。
4. 提交 PR，通过检查后合入 `main`。
5. 在通过发布验收的 `main` 提交上创建并推送 `kaying-code-v<版本>` 标签。
6. 推送标签会自动触发 Linux、macOS、Windows+Android 三套签名构建；失败时可手动 dispatch 同一标签重跑。全部成功后，`Publish GitHub release` 工作流会汇总制品、生成 `SHA256SUMS-<版本>.txt` 并创建或更新 GitHub Release。
7. 自动发布不替代安装验收；对外宣布前仍需在目标平台完成安装与启动验证。

发布细节见 [scripts/spec/product-release-version.md](scripts/spec/product-release-version.md)。

## 8. 许可与安全

- 项目根许可为 AGPL-3.0-only；上游 ZCode 派生部分为 Apache-2.0；插件与第三方组件保留各自许可。
- 修改许可、声明或第三方材料前，先阅读 [third-party/SPEC.md](third-party/SPEC.md) 和 [scripts/spec/license-inventory.md](scripts/spec/license-inventory.md)。
- 安全漏洞通过 [SECURITY.md](SECURITY.md) 指定的私密渠道报告，不要公开 Issue 中附密钥或用户数据。

## 9. 上游 ZCode 同步

KayingCode 以官方 [ZCode](https://github.com/zai-org/ZCode) 为上游。`main` 是产品分支，`zcode-main` 是官方 `main` 的只读镜像；两者历史独立，不能互相合并。

### 9.1 当前基线

- `UPSTREAM_BASE.json` 记录已审阅并验收的官方提交，是产品采纳的比较基线。
- 官方更新以 `upstream/main` 为准；功能分支不作为默认采纳来源。
- 只 fetch 或只更新镜像不会改变采纳基线。

### 9.2 同步镜像 zcode-main（维护者）

```bash
git fetch --no-tags upstream

# 预演，确认是快进
git push --dry-run --no-follow-tags origin \
  refs/remotes/upstream/main:refs/heads/zcode-main

# 正式快进推送
git push --no-follow-tags origin \
  refs/remotes/upstream/main:refs/heads/zcode-main

# 两端 SHA 必须一致
git ls-remote upstream refs/heads/main
git ls-remote origin refs/heads/zcode-main
```

- 只允许快进；出现分叉先停止排查，不强推或合并无关历史。
- 不向 `upstream` 推送产品提交或标签。
- 镜像前确认上游新增的 Actions 工作流在产品仓可安全运行。

### 9.3 采纳上游变更（产品）

从产品 `main` 创建短期适配分支，按模块审阅和适配：

```bash
git switch main
git pull --ff-only origin main
git switch -c adopt-zcode-<版本>
node scripts/check-workspace-freshness.mjs

upstream_base=$(node -p "require('./UPSTREAM_BASE.json').commit")
git log --oneline "$upstream_base"..upstream/main
git diff --stat "$upstream_base" upstream/main
```

执行顺序：

1. 先更新受影响模块的 `spec/`，明确产品规则、状态所有者、接口和验收场景。
2. 按模块适配实现与测试，保留 KayingCode 品牌、配置、Host/Relay、移动端和插件边界。
3. 在 `scripts/spec/upstream-sync-<版本>.md` 记录采纳项、明确排除项和未完成项。
4. 运行对应验证并提交 PR。
5. 全部目标差异审阅并验收后，才更新 `UPSTREAM_BASE.json` 的 `repo`、`commit`、`version`、`syncedAt`。

部分采纳时保留旧基线并记录进度；KayingCode 产品版本独立管理，不跟随上游版本号。详细操作见 [README 的上游连接与更新](README.md#上游连接与更新) 和 [仓库同步指南](docs/deploy/github-gitee-repository.md#同步-zcode-main)。

---

# Development and contribution guide (English)

This guide covers the development environment, branch model, commit rules, PR flow, and release process. The Chinese section above is authoritative; this English section is a condensed reference.

## Setup

- Use the Node.js and pnpm versions in [mise.toml](mise.toml) (currently Node `24.14.0`, pnpm `10.31.0`).
- Install with `pnpm install --frozen-lockfile`.
- Run `node scripts/check-workspace-freshness.mjs` before starting. The product baseline is `origin/main`, not `zcode-main`.
- For Flutter builds, read [apps/kayingcode-mobile-flutter/AGENTS.md](apps/kayingcode-mobile-flutter/AGENTS.md) first.

## Branches

- `main` is the product default branch. All changes land through pull requests; do not push directly or force-push.
- `zcode-main` mirrors official ZCode `main`. Maintainers fast-forward it from `upstream/main`; never merge product commits into it or push product changes upstream.
- Create short topic branches from the latest `main`: `feature/<topic>`, `fix/<topic>`, `docs/<topic>`, `ci/<topic>`, `refactor/<topic>`. Use lowercase English and hyphens; one topic per branch; delete after merge.
- `release/<version>` is a short-lived branch for version and changelog preparation. Run `pnpm run release` there; the command does not tag or push.
- Product tags use `kaying-code-v<version>` and must point to a validated `main` commit.

## Commits

Use Conventional Commits: `<type>(<scope>): <subject>`.

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`; other types appear under “Other Changes”.
- Scope examples: `desktop`, `mobile`, `relay`, `release`, `licenses`, `ui`, `remote`.
- Write the subject in English, imperative mood, without a trailing period.
- Explain why the change is needed, its impact, and the validation performed in the body.
- Use `type(scope)!:` plus a `BREAKING CHANGE:` footer for breaking changes.
- Keep one logical change per commit. Do not mix unrelated formatting, refactors, or binaries.
- Update the owning spec before changing behavior. Root `docs/` is for deployment guides only.
- Do not hand-edit generated files. Regenerate with `pnpm run source:plugins` and `pnpm run source:map`, then run `pnpm run source:check`.
- Never commit certificates, private keys, real `.env` files, packet captures, or session/user data.
- Preserve third-party copyright, source, and license notices. Contributions are licensed under AGPL-3.0-only.

## Pull requests

1. Branch from the latest `origin/main`; include spec, implementation, and tests.
2. Run the relevant checks locally (see below).
3. Open a PR against `main` describing the behavior change, scope, key trade-offs, actual validation results, and unverified platforms. Attach screenshots for UI changes.
4. Wait for `Source checks (Windows)` to pass. It covers the public snapshot, source layout, typecheck, lint, architecture, and Taro tests.
5. Merge after review and delete the topic branch.

Do not push directly to `main`, force-push protected branches, combine unrelated topics, or weaken checks to make a PR pass.

## Verification

```bash
pnpm run typecheck
pnpm run lint
pnpm run source:check
pnpm run architecture:check --changed
pnpm run verify:pre-push
```

Run the target package's tests as defined in its `package.json`. Add tests for behavior changes and E2E coverage for interaction changes. For remote or async changes, verify both the desktop continuous path and the mobile replayable path. Report failures truthfully; do not describe unexecuted checks as passing. The repository has no enforced git hooks, so run these checks manually.

## Release

1. Create `release/<version>` from `main`.
2. Keep the root `package.json`, CLI, Taro, and Flutter versions in sync, including the Flutter build number and both display versions.
3. Run `pnpm run release` to generate the version and changelog commit, then open a PR.
4. After merge, tag the validated `main` commit with `kaying-code-v<version>` and push the tag.
5. Trigger the Linux, macOS, and Windows+Android signed builds. When all succeed, the `Publish GitHub release` workflow downloads their artifacts, generates `SHA256SUMS-<version>.txt`, and creates or updates the GitHub Release.
6. Automatic publishing does not replace installation acceptance; verify the installers on each target platform before announcing the release.

## Syncing upstream ZCode

KayingCode tracks official [ZCode](https://github.com/zai-org/ZCode). `main` is the product branch; `zcode-main` is a read-only mirror of official `main`. The two histories are independent and must not be merged into each other.

- `UPSTREAM_BASE.json` records the reviewed and accepted upstream commit. Fetching or mirroring alone does not change it.
- Use `upstream/main` as the adoption source; feature branches are not adopted by default.

Mirror update (maintainers, fast-forward only):

```bash
git fetch --no-tags upstream
git push --dry-run --no-follow-tags origin \
  refs/remotes/upstream/main:refs/heads/zcode-main
git push --no-follow-tags origin \
  refs/remotes/upstream/main:refs/heads/zcode-main
git ls-remote upstream refs/heads/main
git ls-remote origin refs/heads/zcode-main
```

Stop and investigate if the update is not a fast-forward. Never push product commits or tags to `upstream`, and confirm new upstream Actions workflows are safe for the product repository before mirroring.

Product adoption:

```bash
git switch main
git pull --ff-only origin main
git switch -c adopt-zcode-<version>
node scripts/check-workspace-freshness.mjs
upstream_base=$(node -p "require('./UPSTREAM_BASE.json').commit")
git log --oneline "$upstream_base"..upstream/main
git diff --stat "$upstream_base" upstream/main
```

Update the affected module `spec/` files first, adapt implementation and tests by module, keep KayingCode branding, configuration, Host/Relay, mobile and plugin boundaries, and record adopted items, explicit exclusions and remaining work in `scripts/spec/upstream-sync-<version>.md`. After all target changes are reviewed and accepted, update `UPSTREAM_BASE.json`. For partial adoption, keep the old baseline and record progress. The KayingCode product version is managed independently.

## License and security

- The repository is licensed under AGPL-3.0-only. Upstream ZCode portions remain Apache-2.0; plugins and third-party components keep their own licenses.
- Read [third-party/SPEC.md](third-party/SPEC.md) before changing license or notice material.
- Report security issues through the private channel in [SECURITY.md](SECURITY.md).

## More reading

- [AGENTS.md](AGENTS.md): repository-wide engineering rules
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution basics
- [scripts/spec/branch-policy.md](scripts/spec/branch-policy.md): branch and CI policy
- [scripts/spec/product-release-version.md](scripts/spec/product-release-version.md): version and release rules
- [docs/deploy/github-gitee-repository.md](docs/deploy/github-gitee-repository.md): repository, mirror, and release operations
