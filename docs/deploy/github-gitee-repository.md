# GitHub 主库与 Gitee 备份

[GitHub](https://github.com/kaying-ai/KayingCode) 管理产品 PR、CI、发布和正式标签。`main` 是产品默认分支，`zcode-main` 镜像 [官方 ZCode](https://github.com/zai-org/ZCode)。Gitee 单向同步产品 `main` 和选定的正式标签，供备份和克隆加速。

## 切换默认分支

1. 维护者在 GitHub 把旧默认分支 `kaying-code-dev` 重命名为 `main`，确认 SHA 和打开的 PR 目标，再用分支治理 PR 验证新 CI 触发条件。
2. 在 GitHub 核对 `Source checks (Windows)`，将其设为 `main` 的必需检查。要求 PR，限制强推和删除。限制 `zcode-main` 的写入主体与产品标签的创建权限。
3. 按公开范围和许可审核流程复核两条分支的内容。原 Gitee 开发库保留为历史档案，另建空仓库作为备份。

只有从 GitHub 产品历史克隆、且本地没有 `main` 时，才使用下列重命名命令。执行前保留当前工作并检查 `git branch -avv`。

```bash
git branch -m kaying-code-dev main &&
  git fetch origin --prune &&
  git branch --set-upstream-to=origin/main main &&
  git remote set-head origin -a
```

原 Gitee 工作区的本地 `main` 可能属于 ZCode。此类工作区推荐重新克隆 GitHub，从产品 `main` 建短期分支，逐项迁移已审查的本地改动。旧 Gitee refs 和归档标签保留在旧库。

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
