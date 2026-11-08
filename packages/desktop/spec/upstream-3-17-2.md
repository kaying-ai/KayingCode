# 3.17.2 Desktop 同步边界

- 同步 Electron / updater / builder 的上游版本与适用构建修复；保留产品身份、版本来源、图标、发布分支与本地配置。
- 新增文件关联应用查询/打开 IPC，schema、preload、共享声明与 IPlatformService adapter 同步；只处理当前允许的本机文件，不把远端路径当成本机路径。
- 保留 window-scoped Local Host、附件注册表与现有 SSH/Relay 控制链，不重建第二份任务/快照状态。
- 未接入的新云遥测、设备管理及旧 CUA 功能不宣告能力、不恢复相关 UI。
- 验收：根类型检查、架构/目录检查、桌面构建和对应平台端口测试；平台专属运行测试与构建验证分别记录。
