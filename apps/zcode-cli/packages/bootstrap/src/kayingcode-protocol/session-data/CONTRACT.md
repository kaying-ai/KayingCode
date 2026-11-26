# cli-session-data

`v4/storage/sessionData/measure` / `purge` 的 CLI 执行面。通过 `SessionDataHost` 窄接口使用 session store、会话文件端口与本进程的会话驻留事实。规格见 `docs/superpowers/specs/2026-10-24-project-management.md`「彻底删除数据」，存储细节见 `apps/zcode-cli/docs/design/v2/session-persistence.md`「彻底删除」。

不变量：

- 以会话根为单位：根与其自有后代（不含 fork）组成一棵树，整棵删或整棵留。
- 树中任一会话在本进程忙（在途 turn、待处理交互或排队命令）时整棵保留，返回 `kept`（`running`）；树中任一会话的附件仍被本次不删除的未删除会话引用（part 中的 `kayingcode-artifact://<sid>/…`）时整棵保留（`referenced`），按不动点传递。空闲已加载的会话只做驻留去激活（与 resident 容量去激活同一路径），**不**发 `session.removed`。
- 先删文件再删行：文件删除失败时保留行并返回 `failed`，重试仍能按会话找到文件。文件与行都删除后才从本进程所有 sessions-index 投影中移除，防止下次快照复活；失败时列表与 Host 镜像不变。
- Host 负责把会话交给持有其运行态的进程（该 cwd 已有 Agent 进程时）；其余进程只能看到自己加载的会话。

## 归档永久删除

`v4/storage/sessionData/deletionPreview`、`deletionPreviewBatch` 与 `deletionExecute` 使用 `SessionDeletionHost`，与项目数据 `purge` 分离；不改变 `purge` 的整树 `referenced` 语义。

- 预检返回 revision、将删除的 owned tree、保留 fork、保留附件与 blocked 原因。运行中、其他进程持有运行态、待处理输入或目标不存在分别映射为 `running` / `in-use` / `running` / `not-found`；已有删除凭据但尚未完成时 `incomplete=true`，已完成时 `completed=true` 且执行幂等返回 `deleted`。
- 批量预检一次接收 1–100 个根，结果按入参顺序；单项失败只返回该根的 `{ error: { code } }`。整批存储调用抛错时逐根重查，只把仍失败的根记为单项错误。
- 存储层一次调用对整批只做一次 fork 扫描、一次 runtime presence 读取和至多一轮引用 SQL：先按 `scanArtifactReferences=false` 拿到 owned tree，有 artifact 文件的根再整批查一轮引用。预检、执行与写锁内复检必须使用同一扫描判定，revision 才可比。
- 执行必须携带完整 workspace 身份、revision 与 operationId。身份不符或 revision 变化返回 `blocked`（`changed`）；准入后文件或数据库失败返回 `incomplete`，持久删除凭据留下写屏障，重试续删，旧 create/upsert 不能复活同一 ID。
- 共享附件只保留实际存在的文件（供其他会话的 URI 继续读取），会话正文、执行日志和其他独占文件仍整棵删除；附件被其他会话引用不阻止正文删除。
