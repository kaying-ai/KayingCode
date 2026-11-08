# 分支治理与开发基线

- GitHub 的 `kaying-ai/KayingCode` 负责产品 PR、集成和发布。`main` 是产品默认分支，改动经 PR 审查和源码校验后合入。功能、修复和文档使用简短、可读的主题分支名，例如 `project-drag`、`fix/session-reconnect`，合并后清理。外部贡献者可从 fork 提交 PR。
- `zcode-main` 是官方 ZCode `main` 的镜像。维护者从 `https://github.com/zai-org/ZCode.git` 获取 `upstream/main`，将该 ref 原样快进推送至 GitHub 的 `zcode-main`，并对比两端 SHA。出现分叉时保留目标并排查。产品 PR 一律以产品 `main` 为目标。
- 上游采纳从产品 `main` 开短期适配分支，按模块比较 `UPSTREAM_BASE.json.commit` 到 `upstream/main` 的变化。全部差异经审阅和验证后才更新采纳基线。两条长期分支各自保留历史。缺少固定上游对象时从官方远端获取。

## 发布

- `release/<版本>` 是从产品 `main` 创建的短期分支。根 `pnpm run release` 只在该分支生成版本和变更日志提交，供 PR 审查。命令本身不打标签、不推送。紧急修复同样通过短期分支和 PR 进入 `main`。
- 维护者从已通过发布验收的 GitHub `main` 提交创建 `kaying-code-v<版本>` 标签。标签源码检查验证目标是 GitHub `main` 的祖先，通过后再发布制品。产品签名、制品上传与部署由独立发布流程负责。
- GitHub Actions 对发往 `main` 的 PR、`main` 推送和正式标签推送执行产品源码检查。工作流使用固定 Node/pnpm、冻结锁文件和只读权限。维护者将 `Source checks (Windows)` 配置为 `main` 的合并检查。

## 开工检查

- `scripts/check-workspace-freshness.mjs` 先获取 `origin` 和当前跟踪远端，拒绝落后于 tracking ref 的分支。产品分支和 `origin/main` 比较，缺少基线或缺少共同祖先时退出 1。共享历史时保留现有落后阈值和告警规则。
- `zcode-main` 只检查其跟踪 ref。浅克隆需先补齐历史，旧产品工作区应从 GitHub 重建分支，再逐项迁移已审查改动。`--no-fetch` 用于离线验证，`--dev-ref` 显式指定基线，`--max-behind-dev` 默认 50。
- 验收覆盖同源和无共同祖先的分支、缺失基线、落后 tracking、镜像豁免、发布准备配置和产品 CI 触发条件。运行 `node --test scripts/check-workspace-freshness.test.mjs scripts/branch-policy.test.mjs`。

## Gitee 与迁移

- 维护者 clone 的 `origin` 指 GitHub，`upstream` 指官方 ZCode，`gitee` 指独立的备份库，`legacy` 按需指向原产品库。镜像从 GitHub 获取产品 `main` 和明确选定的产品标签，再快进推送并核对 SHA。
- 原 Gitee 开发历史留作档案。GitHub 使用同一产品历史把旧默认分支迁移为 `main`，独立建立 `zcode-main`。旧克隆的本地 `main` 可能属于 ZCode，应先验证历史或重新克隆。切换及镜像步骤见 [仓库同步指南](../../docs/deploy/github-gitee-repository.md)。
