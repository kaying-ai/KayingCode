# GitHub 主库与 Gitee 备份

[GitHub](https://github.com/kaying-ai/KayingCode) 管理产品 PR、CI、发布和正式标签。`main` 是产品默认分支，`zcode-main` 镜像 [官方 ZCode](https://github.com/zai-org/ZCode)。Gitee 单向同步产品 `main` 和选定的正式标签，供备份和克隆加速。

## 本地工作区切换

GitHub 的默认分支已切换到 `main`。已有 GitHub clone 可以刷新远端引用，并将本地产品分支设为跟踪 `origin/main`。先保存当前工作，确认本地 `main` 属于 GitHub 产品历史。

```bash
git fetch origin --prune &&
  git remote set-head origin -a &&
  git switch main &&
  git merge --ff-only origin/main &&
  git branch --set-upstream-to=origin/main main
```

如果 clone 只跟踪旧分支，可先用 `git remote set-branches origin '*'` 恢复获取 GitHub 分支。首次建立本地产品分支可用 `git switch --track origin/main`，首次检出上游镜像可用 `git switch --track origin/zcode-main`。

原 Gitee 工作区的本地 `main` 可能属于 ZCode。可重新克隆 GitHub，从产品 `main` 建短期分支，逐项迁移已审查的本地改动。旧 Gitee refs 和归档标签留在旧库。

维护者在 GitHub 核对 `Source checks (Windows)` 后，可将它设为 `main` 的必需检查。要求 PR，限制强推和删除，并限制 `zcode-main` 的写入主体与产品标签的创建权限。

## 同步 zcode-main

在维护者的 GitHub clone 里将 `upstream` 配置为 `https://github.com/zai-org/ZCode.git`。获取官方 `main` 后，确认新增或变更的上游 Actions 工作流可在产品仓库安全运行，再预演和执行快进推送。以下命令使用 Git Bash。

```bash
git fetch --no-tags upstream &&
  git push --dry-run --no-follow-tags origin refs/remotes/upstream/main:refs/heads/zcode-main
```

```bash
git push --no-follow-tags origin refs/remotes/upstream/main:refs/heads/zcode-main &&
  git ls-remote upstream refs/heads/main &&
  git ls-remote origin refs/heads/zcode-main
```

两端 SHA 应一致。遇到分叉或拒绝时停止并排查。需要本地查看镜像时，用 `git switch --track origin/zcode-main`。产品采纳在从 `main` 建立的短期分支进行，步骤见 [README](../../README.md#上游连接与更新)。

## 发布产品

1. 从同步后的 `main` 创建 `release/<版本>`，获取 GitHub 的已有产品标签，在分支上运行根 `pnpm run release` 生成本地版本和变更日志提交。核对版本文件并提交 PR。紧急修复同样从 `main` 开短期分支，经 PR 验收后合入。
2. 在 GitHub `main` 上确定通过发布验收的提交。用完整的 `RELEASE_SHA` 和对应 `RELEASE_VERSION` 执行下面的命令。分支或标签存在均不能代替发布验收。
3. 等待标签的源码检查通过，再在 GitHub 创建 Release 并上传已验收制品。

```bash
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main &&
  git merge-base --is-ancestor "${RELEASE_SHA:?}" refs/remotes/origin/main &&
  git tag -a "kaying-code-v${RELEASE_VERSION:?}" "$RELEASE_SHA" -m "KayingCode $RELEASE_VERSION" &&
  git push --no-follow-tags origin "refs/tags/kaying-code-v$RELEASE_VERSION"
```

## 构建已签名的 macOS 安装包

在 Mac 上申请 Developer ID Application 证书，并从钥匙串导出含私钥的 `.p12`。在 App Store Connect 创建团队 API 密钥用于公证，保存 `.p8`、Key ID 和 Issuer ID。参考 [Apple 证书指南](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/) 和 [Apple 公证指南](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。

在 GitHub **Settings → Environments** 创建 `macos-release`，将可部署标签限制为 `kaying-code-v*`。在仓库套餐支持时可设置发布审批。将以下值保存为该环境的 Secrets。

| Secret                 | 内容                                                |
| ---------------------- | --------------------------------------------------- |
| `MAC_CSC_LINK`         | Developer ID Application `.p12` 的单行 Base64       |
| `MAC_CSC_KEY_PASSWORD` | `.p12` 导出密码                                     |
| `APPLE_API_KEY_BASE64` | App Store Connect 团队 API 密钥 `.p8` 的单行 Base64 |
| `APPLE_API_KEY_ID`     | 该密钥的 Key ID                                     |
| `APPLE_API_ISSUER`     | App Store Connect 的 Issuer ID                      |

工作流合入 `main` 后，先使用绑定该提交的预验收标签，并仅为该精确标签临时放行 `macos-release`；验收通过并撤销临时规则后，使用同一提交的正式标签在 Actions 手动运行 **Build signed macOS release**。也可以用 GitHub CLI 选择标签，例如 `gh workflow run release-macos.yml --ref kaying-code-v0.1.1`。成功任务会上传已签名并附有 Apple 公证票据的 Apple Silicon DMG。macOS Intel（x64）自 0.1.5 起暂停构建，恢复前须先在发布版本 spec 记录需求和验证范围。下载后完成安装验收，再上传到对应的 GitHub Release。

## 同步到 Gitee

确认新空库的可见性与已授权源码范围一致，将 `GITEE_MIRROR_URL` 设为其地址，并在维护者的 GitHub clone 执行 `git remote add gitee "$GITEE_MIRROR_URL"`。

```bash
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main &&
  git push --dry-run --no-follow-tags gitee refs/remotes/origin/main:refs/heads/main
```

预演通过后执行同步并比对 SHA。

```bash
git push --no-follow-tags gitee refs/remotes/origin/main:refs/heads/main &&
  git ls-remote origin refs/heads/main &&
  git ls-remote gitee refs/heads/main
```

在 GitHub 核对已发布的产品标签与目标提交，再按精确 refspec 同步，例如 `refs/tags/kaying-code-v0.1.1:refs/tags/kaying-code-v0.1.1`。首次同步验收后将 Gitee 默认分支设为 `main`，仓库说明指向 GitHub 的 Issues、PR 和 Releases。自动镜像使用只对新 Gitee 库有写权限的凭据，限制并发，按相同范围推送并核对 SHA。GitHub Releases 附件和协作记录由 GitHub 管理。

## 从 Gitee 加速后参与开发

在从新 Gitee 镜像克隆的工作区中，维护者将 GitHub 配置为 `origin` 和默认推送目的地。

```bash
git remote rename origin gitee
git remote add origin git@github.com:kaying-ai/KayingCode.git
git fetch --no-tags origin &&
  git branch --set-upstream-to=origin/main main &&
  git config --local remote.pushDefault origin &&
  node scripts/check-workspace-freshness.mjs
```

外部贡献者可直接从 GitHub fork 向产品 `main` 提交 PR。参见 [分支治理规范](../../scripts/spec/branch-policy.md)。

## 构建和验证 Linux 桌面发行包

`linux-release` 环境仅允许正式标签 `kaying-code-v*`，配置环境 Secrets `LINUX_GPG_PRIVATE_KEY`（ASCII 格式私钥）与 `LINUX_GPG_PASSPHRASE`（私钥口令）。公钥位于 `packages/desktop/build/linux-signing/release-public-key.asc`；应通过可信渠道核对其完整指纹后使用。私钥与口令的本机备份存放在仓库外，禁止提交。

签名工作流合入 `main` 后，先对该提交创建 `kaying-code-preflight-v<版本>-<提交前12位>` 标签，仅将该精确标签临时加入环境允许规则，手动运行工作流并验收两种架构。移除临时规则后，基于同一提交创建正式标签，在 Actions 手动运行 **Build signed Linux release**，选择该标签。x64 和 arm64 制品分别包含安装包、`SHA256SUMS-linux-<架构>`、其 `.asc` 分离签名和公钥。预验收制品名含 `preflight`，正式制品名含 `release`；工作流只上传 Actions 制品，不自动创建 Release。

下载同一架构的文件并独立核对公钥指纹后，可用以下命令验证签名和文件完整性（以 x64 为例）：

```sh
gpg --show-keys --fingerprint KayingCode-linux-release-public-key.asc
gpg --dearmor < KayingCode-linux-release-public-key.asc > release-public-key.gpg
gpgv --keyring ./release-public-key.gpg SHA256SUMS-linux-x64.asc SHA256SUMS-linux-x64
sha256sum --check SHA256SUMS-linux-x64
```

只有在公钥指纹来自可信渠道且签名及所有校验值均通过时，才能确认文件与签名清单一致。此流程签署发行校验清单，不提供 APT 或 RPM 仓库原生签名。

### Windows 与 Android 签名构建

在 `windows-release` 环境设置 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`，在 `android-release` 环境设置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_STOREPASSWORD`、`ANDROID_KEYALIAS`、`ANDROID_KEYPASSWORD`；正式环境仅放行 `kaying-code-v*`。预验收时仅临时放行同一提交的精确预验收标签，运行结束后移除。手动运行 **Build signed Windows and Android releases**；上传前分别验证 Authenticode 和 APK 签名。工作流上传 Actions 制品，安装验收与 Release 发布仍须完成。
