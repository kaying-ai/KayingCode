import type {
  KayingCodeAgentMcpServer,
  KayingCodeAutomationScheduleRule,
  KayingCodeMcpListMode,
  ModelSelection,
} from "@zcode/shared";

export interface KayingCodeAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}

export interface KayingCodeAgentPluginViewParams extends KayingCodeAgentWorkspaceTarget {
  configScope?: "user" | "workspace";
}

export interface KayingCodeAgentListMcpServerStatusesParams extends KayingCodeAgentWorkspaceTarget {
  mcpServers?: KayingCodeAgentMcpServer[];
  mode?: KayingCodeMcpListMode;
}

export interface KayingCodeAgentAddPluginMarketplaceParams extends KayingCodeAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  source: string;
}

export interface KayingCodeAgentRemovePluginMarketplaceParams extends KayingCodeAgentWorkspaceTarget {
  marketplace: string;
}

export interface KayingCodeAgentUpdatePluginMarketplaceParams extends KayingCodeAgentWorkspaceTarget {
  marketplace?: string;
  operationId?: string;
}

export interface KayingCodeAgentInstallPluginParams extends KayingCodeAgentWorkspaceTarget {
  dryRun?: boolean;
  marketplace: string;
  operationId?: string;
  pluginName: string;
  scope?: "user" | "workspace";
}

/** KayingCode.localrun：从本地路径安装插件。 */
export interface KayingCodeAgentInstallLocalPluginParams extends KayingCodeAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  path: string;
  scope?: "user" | "workspace";
}

export interface KayingCodeAgentCancelPluginOperationParams {
  operationId: string;
}

export interface KayingCodeAgentUninstallPluginParams extends KayingCodeAgentWorkspaceTarget {
  marketplace?: string;
  pluginId?: string;
  pluginName?: string;
  removeCache?: boolean;
}

export interface KayingCodeAgentUpdatePluginParams extends KayingCodeAgentWorkspaceTarget {
  pluginId?: string;
  marketplace?: string;
}

export interface KayingCodeAgentRestoreBuiltinPluginParams extends KayingCodeAgentWorkspaceTarget {
  pluginId: string;
}

export interface KayingCodeAgentConfigurePluginParams extends KayingCodeAgentWorkspaceTarget {
  clearOptionKeys?: string[];
  dryRun?: boolean;
  options: Record<string, unknown>;
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface KayingCodeAgentResetPluginConfigParams extends KayingCodeAgentWorkspaceTarget {
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface KayingCodeAgentValidatePluginParams extends KayingCodeAgentWorkspaceTarget {
  marketplace?: string;
  pluginName?: string;
  source?: string;
}

export interface KayingCodeAgentDescribePluginParams extends KayingCodeAgentWorkspaceTarget {
  marketplace: string;
  pluginName: string;
}

export interface KayingCodeAgentSetPluginEnabledParams extends KayingCodeAgentWorkspaceTarget {
  enabled: boolean;
  operationId?: string;
  pluginId: string;
  scope?: "user" | "workspace";
}

// Plugin 对话引用 catalog：
// 带 sessionId → session-owned 冻结 catalog（必须路由到持有该 session 的 workspace client）；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。
export interface KayingCodeAgentPluginReferenceCatalogParams extends KayingCodeAgentWorkspaceTarget {
  sessionId?: string;
}

// Composer Skill catalog：与 Plugin 引用相同，以 sessionId 区分 workspace 当前目录和
// resident Session runtime 快照；不参与 Settings 管理目录。
export interface KayingCodeAgentSkillReferenceCatalogParams extends KayingCodeAgentWorkspaceTarget {
  sessionId?: string;
}
export interface KayingCodeAgentResolveSuggestedPluginReferenceParams extends KayingCodeAgentWorkspaceTarget {
  stableId: string;
  operationId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryKind: "desktop-continuous" | "web-remote-replayable";
}

// ---- 定时任务(automation)管理参数 ----

export interface KayingCodeAgentCreateAutomationParams extends KayingCodeAgentWorkspaceTarget {
  title: string;
  cronExpr: string;
  relativeDelayMinutes?: number;
  prompt: string;
  modelSelection?: ModelSelection;
  mode?: string;
  recurring?: boolean;
  maxRuns?: number;
  endAt?: number;
  scheduleRule?: KayingCodeAutomationScheduleRule;
}

export interface KayingCodeAgentUpdateAutomationParams extends KayingCodeAgentWorkspaceTarget {
  automationId: string;
  title?: string;
  cronExpr?: string;
  prompt?: string;
  modelSelection?: ModelSelection | null;
  mode?: string | null;
  recurring?: boolean;
  maxRuns?: number | null;
  endAt?: number | null;
  scheduleRule?: KayingCodeAutomationScheduleRule | null;
  scheduleEditedByUser?: boolean;
}

export interface KayingCodeAgentAutomationIdParams extends KayingCodeAgentWorkspaceTarget {
  automationId: string;
}

export interface KayingCodeAgentSetAutomationEnabledParams extends KayingCodeAgentWorkspaceTarget {
  automationId: string;
  enabled: boolean;
}

export interface KayingCodeAgentDeleteAutomationRunParams extends KayingCodeAgentWorkspaceTarget {
  runId: string;
}
