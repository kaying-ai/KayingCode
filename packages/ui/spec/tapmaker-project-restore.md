# TapMaker 恢复到本地与项目登记

## 行为规则

- 恢复以 `manageTapMakerProjects({ action: "restore" })` 返回的 `projectRoot` 为唯一目录事实，不使用用户选择的父目录或卡片名称推断实际路径。
- 恢复成功后、打开工作区之前，必须把 `projectRoot` 登记进 Host 项目库：
  `saveProject({ reuseExistingRoot: true, roots: [projectRoot] })`。
  - 该模式在同一写事务内按目录查找未删除项目：命中即复用，不修改名称、roots、排序或置顶；未命中才创建。
  - 该模式只接受目录字段（项目服务 schema 限制）；新项目名称按目录基准名生成，与“打开目录”一致。
  - 项目库（Host `projectService`）是侧栏项目行的唯一事实源；`tabStore.addTab` 只负责工作区入口，不产生项目行。
- 登记完成后沿用原导航，但必须同时携带登记得到的项目 ID：页面到 Shell 用对象 `onOpenProject({ path, projectId })`，Shell 再适配到侧栏入口的 `(path, workspaceIdentity, projectId)`。Shell 以项目身份走 Host `prepareSession` 并 `startDraft({ projectId })`，输入框项目选择器与 Agent 交互区才会自动切到该项目。
- 项目 ID 绝不能传进 `workspaceIdentity`：那会让本地 tab 被判定为远端身份，服务切成断连代理，主区黑屏并报 `KAYINGCODE_REMOTE_WORKSPACE_DISCONNECTED`。只按目录 `addTab` 则会让输入框停在“选择项目”。
- 页面已卸载时只 `ensureWorkspaceTab`，不抢占新页面。
- “打开本地项目”复用同一规则：先按目录原子复用/登记，再带项目 ID 打开；登记失败只记录 warn 并退化为仅按工作区打开，不阻断已有目录。
- 登记失败作为恢复失败处理：显示错误，不导航。已下载的文件保留在磁盘，重试恢复会复用目录。
- 项目库服务不可用（旧侧栏/受限壳层）时跳过登记，仅保留原有 tab 行为。

## 本地关联候选目录

- 列表请求的 `candidateDirectories` 来自两处：当前窗口本地 workspace tab 目录，以及本地项目库的 roots。
- 合并后去重，最多 500 个；排除远程 tab、远程 workspace 与远程项目 roots。
- 读取项目库失败只记录 warn，列表退化为 tab 目录，远端游戏继续展示；不能因为本地关联失败中断列表。
- 本地目录是否属于远端游戏由插件按目录内标记判定（见 kaying-for-taptap `spec/project-local-association.md`），UI 不按名称猜测归属。

## 所有权与顺序

```text
恢复请求 → Host 下载代码 → projectRoot
                              ↓
     Host projectService.saveProject(reuseExistingRoot) → projectId   ← 项目行唯一所有者
                              ↓ state:projects
     tabStore.addTab(projectRoot)
                              ↓ onOpenProject({ path: projectRoot, projectId })
     onCreateTask({ projectId }) → Host prepareSession → startDraft({ projectId })
```

UI 只发送目录登记命令并等待结果；草稿项目归属只由 `startDraft({ projectId })` 写入，不维护第二份项目缓存，也不按目录反推项目 ID。

## 验收

- 恢复到空目录：下载完成后侧栏出现项目行；输入框项目选择器自动显示该项目（不是“选择项目”），再进入游戏中心显示“打开本地项目”，卡片路径为该 `projectRoot`。
- “打开本地项目”：同样自动选中对应项目并打开草稿。
- 恢复后的新 tab 不带 `workspaceIdentity`；聊天主区正常渲染，不得出现 `KAYINGCODE_REMOTE_WORKSPACE_DISCONNECTED`。
- 目标目录已登记为项目：复用原项目，不产生重复行、不改名、不改排序。
- 手动创建或打开项目后关闭相关 tab，再进入游戏中心仍显示“打开本地项目”。
- 项目库读取失败：列表照常展示远端游戏，刷新不报错。
- 恢复后页面已切走：项目仍登记成功，工作区 tab 以后台方式补入，不改变当前页面。
