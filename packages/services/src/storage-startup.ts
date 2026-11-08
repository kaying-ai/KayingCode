// 与上游 project-storage/startup-entry 对齐：project-storage/startup.ts 接受可选的旧设置
// （lastWorkspaceSession / recentProjects / sourceServers / connectionProfiles）用于项目种子迁移。
export { prepareTasksIndexStorage } from "#src/project-storage/startup.js";
export { markTasksStoragePrepared } from "#src/session/tasksDatabase/prepared.js";
export { getTasksIndexDatabasePath } from "#src/paths.js";
export { resolveDefaultKayingCodeAgentCommand } from "#src/kayingcode-agent/kayingcodeAgentProcessManager.js";
export { resolveKayingCodeAgentSpawnCwd } from "#src/kayingcode-agent/kayingcodeAgentSpawnCwd.js";

// Desktop main 在 open RPC 前需要同一套设置读取；与上游 storage-startup 入口保持一致。
export { createSettingService } from "#src/setting/settingService.js";
