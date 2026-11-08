# GitHub 主库与 Gitee 备份

GitHub 的 [kaying-ai/KayingCode](https://github.com/kaying-ai/KayingCode) 管理产品源码、PR、CI、发布和正式标签。Gitee 提供同一份源码的备份和克隆加速。ZCode 更新从官方 [zai-org/ZCode](https://github.com/zai-org/ZCode) 获取。原 Gitee 开发库保留为历史档案。

| Git ref | 管理方式 |
| --- | --- |
| `kaying-code-dev` | GitHub 默认分支。日常改动经 PR 与 `Source checks (Windows)` 检查后进入。 |
| `kaying-code-feature-*` | 从 GitHub dev 建立，合入后清理。 |
| `kaying-code-release` | 从已通过验收的 GitHub dev 提交建立首条发布线。发布修复经 PR 验收后进入。 |
| `kaying-code-hotfix-*` | 从 release 开始，修复验收后同步回 release 和 dev。 |
| `kaying-code-v*` | GitHub 产品标签。标签提交须可从 GitHub release 到达。 |
| `upstream/main` | 本地跟踪官方 ZCode，用于差异审查。已有 `main` 只用作上游镜像。 |

## 切换开发主线

1. 维护者从 GitHub 的 `kaying-code-dev` 新建 clone。旧工作区的本地分支和旧 Gitee refs 继续用于查阅。迁移尚未交付的改动时，从 GitHub dev 创建 feature，逐项审查并重新应用所需变更，再提交 GitHub PR。
2. 在 GitHub 先核对首轮 Actions。通过后保护 dev，要求 PR、至少一位评审及 `Source checks (Windows)`，限制强推和删除。公开前复核可见性及待办。第一次发布时，在 GitHub 建立并保护 release，限制正式标签写入，确保版本变更和标签引用的是已验收提交。
3. 创建一个空的 Gitee 备份仓库。完成私有验收前，Gitee 的可见性和访问范围与授权的源码范围一致。验证镜像一致后，设置 Gitee 默认分支为 `kaying-code-dev`，仓库说明指向 GitHub 的 Issues、PR 和 Releases。

旧 Gitee dev 和 GitHub dev 没有共同祖先。新库从 GitHub 的已审查历史初始化。旧仓库的提交、refs 和归档标签继续留在档案中。

## 同步到 Gitee

在维护者的 GitHub clone 中配置 `gitee` 指向已确认的空备份库。每次同步先从 GitHub 取 ref，确认预演结果，再执行实际推送。以下命令使用 Git Bash，`GITEE_MIRROR_URL` 由维护者设置为新镜像地址。

```bash
git remote add gitee "$GITEE_MIRROR_URL"
git remote -v

git fetch --no-tags origin refs/heads/kaying-code-dev:refs/remotes/origin/kaying-code-dev &&
  git push --dry-run --no-follow-tags gitee refs/remotes/origin/kaying-code-dev:refs/heads/kaying-code-dev
```

预演通过后执行同步并比对 SHA：

```bash
git push --no-follow-tags gitee refs/remotes/origin/kaying-code-dev:refs/heads/kaying-code-dev &&
  git ls-remote origin refs/heads/kaying-code-dev &&
  git ls-remote gitee refs/heads/kaying-code-dev
```

GitHub 建立 release 后，用同样的步骤同步 `kaying-code-release`。发布标签按次同步。在 GitHub 核对标签及其目标提交，确认目标属于 release，再用精确 refspec 推送该标签，例如 `refs/tags/kaying-code-v0.1.1:refs/tags/kaying-code-v0.1.1`。相同 SHA 的重试可直接执行。遇到分叉、拒绝或 SHA 不一致时，核对两端仓库和 refs，再决定修复方式。

开始时由维护者手动同步。验收通过后可配置 GitHub 单向镜像任务，使用仅能写入新 Gitee 镜像的凭据，限制并发，按相同 ref 范围同步和比对 SHA。GitHub Releases 附件、Issues、PR 和 Actions 记录保留在 GitHub，下载加速按实际制品另行验收。

## 从 Gitee 加速后参与开发

仅获取源码时，可克隆新的 Gitee 镜像。维护者需要提交改动时，在新克隆中把 GitHub 设为 `origin`，让 dev 跟踪 GitHub。

```bash
git remote rename origin gitee
git remote add origin git@github.com:kaying-ai/KayingCode.git
git fetch --no-tags origin &&
  git branch --set-upstream-to=origin/kaying-code-dev kaying-code-dev &&
  git config --local remote.pushDefault origin &&
  node scripts/check-workspace-freshness.mjs
```

外部贡献者可直接从 GitHub fork 开发并向产品 dev 提交 PR。项目的分支约定及来源校验见 [分支治理规范](../../scripts/spec/branch-policy.md)。
