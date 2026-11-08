# 分支治理与开发基线

- GitHub 的 `kaying-ai/KayingCode` 是产品仓库，负责 PR、集成、发布和产品标签。贡献者可从各自 fork 提交 PR，合入目标以 GitHub 产品仓库为准。
- `kaying-code-dev` 是默认集成分支。`kaying-code-release` 从经过验收的 GitHub dev 提交建立，承载发布准备和稳定修复。产品标签 `kaying-code-v*` 必须可从 GitHub release 到达。
- feature 命名为 `kaying-code-feature-<主题>`，从同步后的 dev 建立。hotfix 命名为 `kaying-code-hotfix-<主题>`，从 release 建立并回合 release 与 dev。短期分支合入后可清理，历史归档标签留在所属归档库。
- ZCode 官方远端为 `https://github.com/zai-org/ZCode.git`，本地称为 `upstream`。`upstream/main` 用于差异审查。有维护 `main` 镜像的 clone 只从 `upstream/main` 快进，产品提交进入 dev。
- 上游采纳在 dev 派生的 `kaying-code-feature-upstream-<版本>` 上按模块进行。比较 `UPSTREAM_BASE.json.commit` 与 `upstream/main`，全部差异经审阅和验证后才更新采纳基线。GitHub 产品分支采用独立的已审查历史，缺少固定上游对象时从官方远端获取。

## 备份镜像与旧历史

- 维护者 clone 的 `origin` 指 GitHub 产品库，`gitee` 指独立的 Gitee 备份库，`legacy` 仅用于按需查阅原产品历史。镜像作业以 GitHub 为源，同步 dev、已建立的 release 和显式选定的正式产品标签。
- 镜像顺序为 GitHub 通过检查并合入 → 拉取对应 GitHub ref → 快进推送到 Gitee → 对比两端 SHA。镜像失败时保留目标 ref，确认目标库、分支和提交关系后重试。旧 Gitee 同名 dev/release 属于迁移前历史，保留现有仓库作为档案，使用空库初始化备份。
- 从 Gitee 加速克隆的贡献者将 GitHub 或自己的 GitHub fork 设为日常推送目的地。源代码镜像与 GitHub Issues、PR、Actions、Release 附件分别管理。操作步骤见 [GitHub 与 Gitee 仓库同步](../../docs/deploy/github-gitee-repository.md)。

## 开工检查

- `scripts/check-workspace-freshness.mjs` 先更新 `origin` 和当前跟踪远端，拒绝落后于 tracking ref 的分支。开发分支与 `origin/kaying-code-dev` 比较。有本地分叉但共享历史时保留现有落后阈值与告警规则。
- 开发分支与指定开发基线缺少共同祖先时退出 1。迁移前的 clone 应从 GitHub 重建开发分支，再逐项迁移已审查的改动。浅克隆应先补齐必要历史。
- `--no-fetch` 用于离线验证，`--dev-ref` 显式指定开发基线，`--max-behind-dev` 默认 50。`main` 和 release 不按 dev 的落后量判过期。脚本只读取或获取 refs。
- 验收覆盖同源分支、缺少共同历史、落后 tracking、缺开发 ref、main/release 豁免和参数校验。运行 `node --test scripts/check-workspace-freshness.test.mjs scripts/branch-policy.test.mjs`。

## GitHub 公开协作

- GitHub CI 对目标为 `kaying-code-dev` 或 `kaying-code-release` 的 PR 及这两条分支的推送执行源码校验。`main` 仍只作为上游镜像。
- GitHub Actions 使用固定 Node/pnpm 和冻结锁文件，复用仓库的公开快照、源码结构、版本、类型、lint 和测试入口。在干净检出中对全树执行架构检查。
- 校验工作流只需读取仓库。外部 PR 与源码校验任务无需发布凭据；签名、制品上传及生产部署由独立发布流程负责。
- GitHub 仓库设置由维护者管理。dev/release 的合并检查绑定 `Source checks (Windows)`，私密漏洞报告与 `SECURITY.md` 的安全邮箱共同提供入口。
- 桌面登录恢复的测试数据使用明确的占位值和本地生成的过期 JWT。过期场景仍以 `exp=1` 检验启动清理，测试无需签发真实 JWT。
