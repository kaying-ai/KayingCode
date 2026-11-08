// 平台能力面收敛：设置页「插件管理」的薄服务接口。
//
// 背景：pluginManagementStore / usePluginUninstall 过去直接注入 IKayingCodeAgentService，
// UI 层因此散布 13 个 plugins/* 旧协议词的消费点。收敛为独立薄 service 后，UI 只依赖
// 本接口；plugins/* 词表的 host 侧消费点收拢到 pluginManagementService 一处（插件的
// 事实源在 kayingcode-cli 进程，服务实现仍经 agent 协议往返——plugins 词表的收口归属
// 插件能力面自身的协议演进，不在会话 v4 词表范围内）。
// 注意与既有 IPluginsService（已 retired 的 marketplace pluginStore 通道）区分：
// 那套接口按 pluginName+marketplace 寻址且方法语义过时，不复用避免签名冲突。
import type { Event } from "@zcode/rpc";
import type {
  KayingCodePluginOperationProgressNotification,
  KayingCodePluginsConfigureResult,
  KayingCodePluginsCancelOperationResult,
  KayingCodePluginsDescribeResult,
  KayingCodePluginsInstallResult,
  KayingCodePluginsListResult,
  KayingCodePluginsMarketplaceMutationResult,
  KayingCodePluginsOverviewResult,
  KayingCodePluginsReferenceCatalogResult,
  KayingCodePluginsRestoreBuiltinResult,
  KayingCodePluginsSetEnabledResult,
  KayingCodePluginsUninstallResult,
  KayingCodePluginsValidateResult,
} from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  KayingCodeAgentAddPluginMarketplaceParams,
  KayingCodeAgentConfigurePluginParams,
  KayingCodeAgentCancelPluginOperationParams,
  KayingCodeAgentDescribePluginParams,
  KayingCodeAgentInstallLocalPluginParams,
  KayingCodeAgentInstallPluginParams,
  KayingCodeAgentPluginReferenceCatalogParams,
  KayingCodeAgentResolveSuggestedPluginReferenceParams,
  KayingCodeAgentResetPluginConfigParams,
  KayingCodeAgentPluginViewParams,
  KayingCodeAgentRemovePluginMarketplaceParams,
  KayingCodeAgentRestoreBuiltinPluginParams,
  KayingCodeAgentSetPluginEnabledParams,
  KayingCodeAgentUninstallPluginParams,
  KayingCodeAgentUpdatePluginMarketplaceParams,
  KayingCodeAgentUpdatePluginParams,
  KayingCodeAgentValidatePluginParams,
} from "../kayingcode-agent/kayingcodeAgentPluginParams.js";

export interface IPluginManagementService {
  listPlugins(params: KayingCodeAgentPluginViewParams): Promise<KayingCodePluginsListResult>;
  /**
   * Plugin 对话引用 catalog：
   * 带 sessionId → session-owned 冻结 catalog；不带 → workspace 当前 catalog。
   * 实现路由到 workspace 级 agent client，不走插件管理独立进程。
   */
  getPluginReferenceCatalog(
    params: KayingCodeAgentPluginReferenceCatalogParams,
  ): Promise<KayingCodePluginsReferenceCatalogResult>;
  resolveSuggestedPluginReference(
    params: KayingCodeAgentResolveSuggestedPluginReferenceParams,
  ): Promise<import("@zcode/shared").KayingCodePluginsResolveSuggestedReferenceResult>;
  onDynamicPluginOperationProgress(
    operationId: string,
  ): Event<KayingCodePluginOperationProgressNotification>;
  getPluginsOverview(params: KayingCodeAgentPluginViewParams): Promise<KayingCodePluginsOverviewResult>;
  addLocalPluginSource(
    params: KayingCodeAgentAddPluginMarketplaceParams,
  ): Promise<KayingCodePluginsMarketplaceMutationResult>;
  removeLocalPluginSource(
    params: KayingCodeAgentRemovePluginMarketplaceParams,
  ): Promise<KayingCodePluginsMarketplaceMutationResult>;
  refreshLocalPluginSource(
    params: KayingCodeAgentUpdatePluginMarketplaceParams,
  ): Promise<KayingCodePluginsMarketplaceMutationResult>;
  installPlugin(params: KayingCodeAgentInstallPluginParams): Promise<KayingCodePluginsInstallResult>;
  installLocalPlugin(
    params: KayingCodeAgentInstallLocalPluginParams,
  ): Promise<KayingCodePluginsInstallResult>;
  cancelPluginOperation(
    params: KayingCodeAgentCancelPluginOperationParams,
  ): Promise<KayingCodePluginsCancelOperationResult>;
  uninstallPlugin(params: KayingCodeAgentUninstallPluginParams): Promise<KayingCodePluginsUninstallResult>;
  updatePlugin(params: KayingCodeAgentUpdatePluginParams): Promise<KayingCodePluginsInstallResult>;
  restoreBuiltinPlugin(
    params: KayingCodeAgentRestoreBuiltinPluginParams,
  ): Promise<KayingCodePluginsRestoreBuiltinResult>;
  configurePlugin(params: KayingCodeAgentConfigurePluginParams): Promise<KayingCodePluginsConfigureResult>;
  resetPluginConfig(
    params: KayingCodeAgentResetPluginConfigParams,
  ): Promise<KayingCodePluginsConfigureResult>;
  validatePlugin(params: KayingCodeAgentValidatePluginParams): Promise<KayingCodePluginsValidateResult>;
  describePlugin(params: KayingCodeAgentDescribePluginParams): Promise<KayingCodePluginsDescribeResult>;
  setPluginEnabled(params: KayingCodeAgentSetPluginEnabledParams): Promise<KayingCodePluginsSetEnabledResult>;
}

export const IPluginManagementService = createServiceDescriptor<IPluginManagementService>(
  ServiceChannels.PluginManagement,
);
