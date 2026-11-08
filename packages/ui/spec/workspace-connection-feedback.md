# 项目行连接反馈

- 项目连接状态仍由 Host owner/lease 和既有远程连接 store 提供；项目行仅投影视图，不因动画写入 React 或业务状态。
- 本地、已连接、断开和重连中的项目共用稳定 DOM。重连使用既有 `workspace-remote-connecting-breathe` CSS、状态图标和日志提示；不挂载带内部状态同步的 BorderBeam。
- 流式任务刷新、hover、焦点、展开/收起和连接状态切换不能形成更新循环或重建任务列表。
- 回归：真实 WorkspaceSidebarItem 连续刷新、鼠标进出、展开/收起；远端断开→重连→已连接时提示正确，列表可继续操作且无 React 异常。
