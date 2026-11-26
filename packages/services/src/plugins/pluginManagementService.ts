// 设置页插件管理薄服务实现——plugins/* 旧协议词的唯一 host 侧消费点。
// 插件安装/市场/启停的事实源在 kayingcode-cli 进程（读写 ~/.kayingcode 插件目录并热更新
// 运行态），host 无副本，故实现保持 agent 协议往返；收敛价值在 UI 层不再直触
// IKayingCodeAgentService，词表消费面从 UI 散点收拢到本文件一处。
import type { IKayingCodeAgentService } from "../kayingcode-agent/kayingcodeAgent.js";
import type { IPluginManagementService } from "./pluginManagement.js";

/** 插件管理变更成功的信号（Window Host 侧）。action 与遥测的动作名相同。 */
export interface PluginMutationSucceededEvent {
  /** install、uninstall、update、restore、configure、reset_config、enable、disable、source_* 等。 */
  action: string;
  pluginId?: string;
  scope?: "user" | "workspace";
}

interface PluginManagementServiceDependencies {
  /**
   * 插件清单「变了」的 Window Host 侧信号：安装、卸载、启停、配置等变更成功返回后调用。
   * 扩展进程据此重读插件清单；配置与重置还通知该插件的 settings.onDidChange。dryRun 不触发。
   */
  onMutationSucceeded?: (event: PluginMutationSucceededEvent) => void;
  kayingcodeAgentService: Pick<
    IKayingCodeAgentService,
    | "listPlugins"
    | "getPluginReferenceCatalog"
    | "resolveSuggestedPluginReference"
    | "onDynamicPluginOperationProgress"
    | "getPluginsOverview"
    | "addLocalPluginSource"
    | "removeLocalPluginSource"
    | "refreshLocalPluginSource"
    | "installPlugin"
    | "installLocalPlugin"
    | "cancelPluginOperation"
    | "uninstallPlugin"
    | "updatePlugin"
    | "restoreBuiltinPlugin"
    | "configurePlugin"
    | "resetPluginConfig"
    | "validatePlugin"
    | "describePlugin"
    | "setPluginEnabled"
    | "setWorkspacePluginTrust"
  >;
}

export function createPluginManagementService(
  dependencies: PluginManagementServiceDependencies,
): IPluginManagementService {
  const agent = dependencies.kayingcodeAgentService;
  const observe = async <R>(
    action: string,
    params: object,
    invoke: () => Promise<R>,
  ): Promise<R> => {
    const result = await invoke();
    const facts = params as {
      dryRun?: unknown;
      pluginId?: unknown;
      scope?: unknown;
    };
    if (facts.dryRun !== true) {
      // 通知方故障不能改变已成功的业务返回。
      try {
        dependencies.onMutationSucceeded?.({
          action,
          ...(typeof facts.pluginId === "string" && facts.pluginId
            ? { pluginId: facts.pluginId }
            : {}),
          ...(facts.scope === "user" || facts.scope === "workspace"
            ? { scope: facts.scope }
            : {}),
        });
      } catch {
        /* 观察者自行记录错误。 */
      }
    }
    return result;
  };
  return {
    listPlugins: (params) => agent.listPlugins(params),
    getPluginReferenceCatalog: (params) => agent.getPluginReferenceCatalog(params),
    resolveSuggestedPluginReference: (params) => agent.resolveSuggestedPluginReference(params),
    onDynamicPluginOperationProgress: (operationId) =>
      agent.onDynamicPluginOperationProgress(operationId),
    getPluginsOverview: (params) => agent.getPluginsOverview(params),
    addLocalPluginSource: (params) =>
      observe("source_add", params, () => agent.addLocalPluginSource(params)),
    removeLocalPluginSource: (params) =>
      observe("source_remove", params, () => agent.removeLocalPluginSource(params)),
    refreshLocalPluginSource: (params) =>
      observe("source_refresh", params, () => agent.refreshLocalPluginSource(params)),
    installPlugin: (params) => observe("install", params, () => agent.installPlugin(params)),
    installLocalPlugin: (params) =>
      observe("install", params, () => agent.installLocalPlugin(params)),
    cancelPluginOperation: (params) => agent.cancelPluginOperation(params),
    uninstallPlugin: (params) => observe("uninstall", params, () => agent.uninstallPlugin(params)),
    updatePlugin: (params) => observe("update", params, () => agent.updatePlugin(params)),
    restoreBuiltinPlugin: (params) =>
      observe("restore", params, () => agent.restoreBuiltinPlugin(params)),
    configurePlugin: (params) => observe("configure", params, () => agent.configurePlugin(params)),
    resetPluginConfig: (params) =>
      observe("reset_config", params, () => agent.resetPluginConfig(params)),
    validatePlugin: (params) => agent.validatePlugin(params),
    describePlugin: (params) => agent.describePlugin(params),
    setPluginEnabled: (params) =>
      observe(params.enabled ? "enable" : "disable", params, () => agent.setPluginEnabled(params)),
    setWorkspacePluginTrust: (params) =>
      observe("workspace_trust", params, () => agent.setWorkspacePluginTrust(params)),
  };
}
