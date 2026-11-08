# 分支治理与开发基线

- Git refs 是提交关系的唯一事实源；README / AGENTS.md 记录命名与流程，不维护第二份分支清单。
- main 只快进同步 upstream/main 的纯 ZCode 树；开发默认分支是 kaying-code-dev；kaying-code-release 是受控发布准备线，首次初始化不代表已验收或已发布。
- feature 从 dev 建立，命名 kaying-code-feature-_；紧急修复命名 kaying-code-hotfix-_，从 release 建立后回合 dev。上游采纳也在 feature 中按模块适配，不把产品提交写回 main。
- 新鲜度检查先更新 origin 和当前跟踪远端（去重），拒绝落后当前 tracking ref；开发/功能分支与 origin/kaying-code-dev 比较。main/release 不按 dev 落后量判过期。开发基线缺失必须失败，不能回退纯上游 main。
- --no-fetch 用于离线验证；--dev-ref 显式指定开发基线；--max-behind-dev 默认为 50。只有 ahead=0 且 behind 超阈值才硬失败，已分叉的 feature 提醒人工确认合并状态。
- 脚本只读取/获取 refs，不 checkout/reset/rebase；发布工具只允许在 release 上建立 kaying-code-v\* 标签，CNB edge 从 dev 构建，产品标签必须可从 release 到达。
- 合并分支先建立 archive/branches/<日期>/<原分支> 标签并推送成功，再删除旧 ref；不更改其他仓库中的分支。origin 指当前 v2 仓库，legacy 保留旧 origin，upstream 仅跟踪 ZCode。其他已连接 remote 保留。
- 官方上游为 `https://github.com/zai-org/ZCode.git`；`upstream` 应指向该地址，派生仓库不能替代官方更新源。远端地址是每份 clone 的本地配置，文档更新不会自动修改它。
- 上游同步分为镜像更新与产品采纳：在非 main 分支获取官方 refs，检查新增提交后以非强制 refspec 快进 main，再显式推送 origin/main；main 若被其他 worktree 检出，应在对应 worktree 使用 `git merge --ff-only upstream/main`。无法快进时调查历史，禁止强推或 reset 掩盖分叉。
- 产品采纳从同步后的 dev 创建 feature，比较 `UPSTREAM_BASE.json.commit` 与 upstream/main，记录模块采纳、主动保留的产品差异和未完成项。只更新 main 不推进采纳基线；部分采纳保留原基线，待该轮差异全部审阅、采纳或明确排除并验收后才更新基线。历史 repo/commit 不因远端 URL 变更而改写。

```text
提交并验证开发快照 → 推送旧 integration（保存当前更新）
  → 归档旧 refs 并推送 tags → 建立 main/dev/release → 切换 Gitee 默认 dev
  → 核实远端 HEAD → 删除已归档的旧分支 → 更新本地 tracking/远端别名
```

验收：模拟 Git 仓库验证干净 feature、落后 tracking、过期 feature、缺开发 ref、main/release 豁免、参数校验；CI/发布配置不再把镜像 main 当产品开发线。运行 `node --test scripts/check-workspace-freshness.test.mjs scripts/branch-policy.test.mjs`。

## GitHub 公开协作

- GitHub CI 对目标为 `kaying-code-dev` 或 `kaying-code-release` 的 PR 及这两条分支的推送执行源码校验。`main` 仍只作为上游镜像。
- GitHub Actions 使用固定 Node/pnpm 和冻结锁文件，复用仓库的公开快照、源码结构、版本、类型、lint 和测试入口。在干净检出中对全树执行架构检查。
- 校验工作流只需读取仓库。外部 PR 与源码校验任务无需发布凭据；签名、制品上传及生产部署由独立发布流程负责。
- GitHub 仓库设置由维护者管理。dev/release 的合并检查绑定 `Source checks (Windows)`，私密漏洞报告与 `SECURITY.md` 的安全邮箱共同提供入口。
- 桌面登录恢复的测试数据使用明确的占位值和本地生成的过期 JWT。过期场景仍以 `exp=1` 检验启动清理，测试无需签发真实 JWT。
