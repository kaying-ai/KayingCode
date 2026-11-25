import type { SettingsSectionId } from "@/lib/settingsNavigation.js";

/**
 * 设置行可见性条件。产品只有 Desktop / macOS / Windows / win32 Host 四类差异，
 * 没有上游的托盘、Dynamic Workflow 与 Computer Use 灰度，因此保持最小集合。
 */
export interface SettingsSearchAvailability {
  desktop: boolean;
  macDesktop: boolean;
  windowsDesktop: boolean;
  windowsHost: boolean;
  notWindows: boolean;
}

interface SettingsSearchItemDefinition {
  id: string;
  section: SettingsSectionId;
  description: string;
  visibility: "all" | keyof SettingsSearchAvailability;
}

/**
 * 翻译 key 同时作为稳定定位 id；索引只描述入口，不持有任何配置值。
 * 只登记产品当前实际渲染的固定设置行；动态用户资源（插件 / MCP / Memory 文件等）
 * 由原页面管理，搜索只负责把用户带到分区。
 */
export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "settings.locale",
    section: "general",
    description: "settings.localeDescription",
    visibility: "all",
  },
  {
    id: "settings.replyLanguage",
    section: "general",
    description: "settings.replyLanguageDescription",
    visibility: "all",
  },
  {
    id: "settings.interfaceMode",
    section: "general",
    description: "settings.interfaceMode.description",
    visibility: "all",
  },
  {
    id: "settings.terminalProfile",
    section: "general",
    description: "settings.terminalProfileDescription",
    visibility: "all",
  },
  {
    id: "settings.terminalFontFamily",
    section: "general",
    description: "settings.terminalFontFamilyDescription",
    visibility: "all",
  },
  {
    id: "settings.integratedTerminalShell",
    section: "general",
    description: "settings.integratedTerminalShellDescription",
    visibility: "windowsHost",
  },
  {
    id: "settings.nativeSearchEnhancements",
    section: "general",
    description: "settings.nativeSearchEnhancementsDescription",
    visibility: "all",
  },
  {
    id: "settings.httpProxy",
    section: "general",
    description: "settings.httpProxyDescription",
    visibility: "all",
  },
  {
    id: "settings.httpProxyNoProxy",
    section: "general",
    description: "settings.httpProxyNoProxyDescription",
    visibility: "all",
  },
  {
    id: "settings.httpProxyCaCertPath",
    section: "general",
    description: "settings.httpProxyCaCertPathDescription",
    visibility: "all",
  },
  {
    id: "settings.desktopChromiumHardwareAcceleration",
    section: "general",
    description: "settings.desktopChromiumHardwareAccelerationDescription",
    visibility: "desktop",
  },
  {
    id: "settings.receivePreviewUpdates",
    section: "general",
    description: "settings.receivePreviewUpdatesDescription",
    visibility: "desktop",
  },
  {
    id: "settings.autoDownloadAndInstallUpdates",
    section: "general",
    description: "settings.autoDownloadAndInstallUpdatesDescription",
    visibility: "desktop",
  },
  {
    id: "settings.notification",
    section: "general",
    description: "settings.notificationDescription",
    visibility: "all",
  },
  {
    id: "settings.notificationSound",
    section: "general",
    description: "settings.notificationSoundDescription",
    visibility: "all",
  },
  {
    id: "settings.taskUnreadBadge",
    section: "general",
    description: "settings.taskUnreadBadgeDescription",
    visibility: "desktop",
  },
  {
    id: "settings.closeToTrayOnWindows",
    section: "general",
    description: "settings.closeToTrayOnWindowsDescription",
    visibility: "windowsDesktop",
  },
  {
    id: "settings.keepAwakeWhileRunning",
    section: "general",
    description: "settings.keepAwakeWhileRunningDescription",
    visibility: "desktop",
  },
  {
    id: "settings.kayingcodeInteractionBehavior",
    section: "general",
    description: "settings.kayingcodeInteractionBehaviorDescription",
    visibility: "all",
  },
  {
    id: "settings.askUserQuestionAutoResolution",
    section: "general",
    description: "settings.askUserQuestionAutoResolutionDescription",
    visibility: "all",
  },
  {
    id: "settings.modelIoFullRetention",
    section: "general",
    description: "settings.modelIoFullRetentionDescription",
    visibility: "all",
  },
  {
    id: "settings.messageStreamShowReasoning",
    section: "general",
    description: "settings.messageStreamShowReasoningDescription",
    visibility: "all",
  },
  {
    id: "settings.messageStreamShowTodos",
    section: "general",
    description: "settings.messageStreamShowTodosDescription",
    visibility: "all",
  },
  {
    id: "settings.totalTokensReminder",
    section: "general",
    description: "settings.totalTokensReminderDescription",
    visibility: "all",
  },
  {
    id: "settings.agentAlwaysBackground",
    section: "general",
    description: "settings.agentAlwaysBackgroundDescription",
    visibility: "all",
  },
  {
    id: "settings.toolGroupingExplore",
    section: "general",
    description: "settings.toolGroupingExploreDescription",
    visibility: "all",
  },
  {
    id: "settings.toolGroupingTerminal",
    section: "general",
    description: "settings.toolGroupingTerminalDescription",
    visibility: "all",
  },
  {
    id: "settings.toolGroupingChanges",
    section: "general",
    description: "settings.toolGroupingChangesDescription",
    visibility: "all",
  },
  {
    id: "settings.taskAutoArchive",
    section: "general",
    description: "settings.taskAutoArchiveDescription",
    visibility: "all",
  },
  {
    id: "settings.taskAutoArchiveDays",
    section: "general",
    description: "settings.taskAutoArchiveDaysDescription",
    visibility: "all",
  },
  {
    id: "settings.dataBaseDir",
    section: "general",
    description: "settings.dataBaseDirDescription",
    visibility: "all",
  },
  {
    id: "settings.onboarding",
    section: "general",
    description: "settings.onboardingDescription",
    visibility: "all",
  },
  {
    // 主动任务推荐只在 Office 模式出现；搜索结果仍指向 General，由该行自身决定是否可改。
    id: "chat.officeSuggestions.setting",
    section: "general",
    description: "chat.officeSuggestions.settingDescription",
    visibility: "all",
  },
  {
    id: "settings.themeMode",
    section: "appearance",
    description: "settings.themeModeDescription",
    visibility: "all",
  },
  {
    id: "settings.uiFontSize",
    section: "appearance",
    description: "settings.uiFontSizeDescription",
    visibility: "all",
  },
  {
    id: "settings.fontSmoothing",
    section: "appearance",
    description: "settings.fontSmoothingDescription",
    visibility: "macDesktop",
  },
  {
    id: "settings.lightTheme",
    section: "appearance",
    description: "settings.lightThemeDescription",
    visibility: "all",
  },
  {
    id: "settings.darkTheme",
    section: "appearance",
    description: "settings.darkThemeDescription",
    visibility: "all",
  },
  {
    id: "settings.showLineNumbers",
    section: "appearance",
    description: "settings.showLineNumbersDescription",
    visibility: "all",
  },
  {
    id: "settings.wrapLongLines",
    section: "appearance",
    description: "settings.wrapLongLinesDescription",
    visibility: "all",
  },
  {
    id: "settings.fontSize",
    section: "appearance",
    description: "settings.fontSizeDescription",
    visibility: "all",
  },
  {
    id: "settings.browser.control.title",
    section: "browser",
    description: "settings.browser.control.description",
    visibility: "all",
  },
  {
    id: "settings.browser.import.title",
    section: "browser",
    description: "settings.browser.import.description",
    visibility: "notWindows",
  },
  {
    id: "settings.embeddedBrowserAllowInsecureCertificates",
    section: "browser",
    description: "settings.embeddedBrowserAllowInsecureCertificatesDescription",
    visibility: "desktop",
  },
  {
    id: "settings.browser.clearCache.title",
    section: "browser",
    description: "settings.browser.clearCache.description",
    visibility: "all",
  },
  {
    id: "settings.browser.clearAll.title",
    section: "browser",
    description: "settings.browser.clearAll.description",
    visibility: "all",
  },
  {
    id: "settings.memory.workspaceMemory",
    section: "memory",
    description: "settings.memoryDescription",
    visibility: "all",
  },
] as const satisfies readonly SettingsSearchItemDefinition[];

export type SettingsSearchId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

export type SettingsSearchItem = (typeof SETTINGS_SEARCH_ITEMS)[number];

export function isSettingsSearchItemVisible(
  item: Pick<SettingsSearchItem, "visibility">,
  availability: SettingsSearchAvailability,
): boolean {
  return item.visibility === "all" || availability[item.visibility];
}
