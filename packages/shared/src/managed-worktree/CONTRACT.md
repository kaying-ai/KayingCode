# managed-worktree-shared

受管 worktree 的共享规则，供 Host（services）与 CLI 共用。上游 4.0.0 规格为 `docs/git/worktree.md` §5.3 与
`docs/specs/workspace-hook-trust.md` D23；本仓库暂无对应文档，行为以本契约与代码为准。

- `layout`：受管根目录 `<dataBaseDir>/.kayingcode/worktrees/<bucket>/<name>` 的纯路径计算，不做 IO。
  - 产品适配：上游为 `<dataBaseDir>/.zcode/worktrees`；KayingCode 数据根与品牌为 kayingcode，默认数据目录
    `~/.kayingcode`（`packages/services/src/paths.ts`），因此路径段改为 `.kayingcode`。
- `resolveWorkspaceHookTrustIdentity`：Hook Trust identity 唯一实现。远程 identity 保留 host 命名空间、
  路径取 `workspacePath`（复用 shared 的 `remoteWorkspaceTrustIdentity`），不进入本地与 worktree 分支；
  本地受管 worktree 经 `.git` 文件、gitdir 反向链接、commondir、源仓库 `.git` 与 realpath 校验后映射到
  源仓库对应路径；任一步失败返回自身路径（不继承）。
- 文件读取只通过调用方注入的 `WorkspaceHookTrustIdentityFs` 端口完成；本模块不直接访问文件系统。
- 入口通过子路径 `@zcode/shared/managed-worktree` 导入，不进入 shared 根索引：本模块依赖 `node:path`，
  根索引被 renderer 打包，不能引入 Node 内置模块。
