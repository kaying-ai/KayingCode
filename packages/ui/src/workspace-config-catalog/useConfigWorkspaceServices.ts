import { useEffect, useState } from "react";
import {
  parseRemoteWorkspaceIdentity,
  buildRemoteWorkspaceIdentity,
  remoteTargetSchema,
  type IServiceAccessor,
} from "@/workspace-config-catalog/contract.js";
import {
  useWorkspaceServicesResolution,
  type WorkspaceServicesResolutionOptions,
} from "@/hooks/useWorkspaceServices.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import {
  ensureSourceSettingsServices,
  useSourceSettingsServices,
} from "@/store/sourceSettingsServiceStore.js";
import { logger } from "@/logger.js";

export interface ConfigWorkspaceServicesOptions {
  /**
   * 非 Source 设置页传 false 时保持基础 workspace 解析语义：不请求 Source settings
   * attachment、不写 canonical alias binding。缺省 true，与上游消费面一致。
   */
  enabled?: boolean;
  /**
   * unscoped 配置页（无 workspace 的 Source user scope）在 Source services 就绪前
   * 必须保持 remote-waiting，禁止回退本机服务产生跨 Host 读写。
   */
  requireUnscopedServices?: boolean;
}

/**
 * Source 设置页的配置 attachment：拿到 sourceServerId 就请求 Source settings
 * attachment（同一 Source 共享一次 admission），返回已注册的 Source services。
 * 未就绪或平台不支持时返回 undefined，调用方必须暂停对应 RPC。
 */
export function useSettingsSourceServices(
  sourceServerId?: string | null,
): IServiceAccessor | undefined {
  const sourceServices = useSourceSettingsServices(sourceServerId ?? undefined);
  const platform = useOptionalPlatform();
  useEffect(() => {
    if (!sourceServerId || sourceServices || !platform?.requestSourceSettingsAttachment) return;
    void ensureSourceSettingsServices(
      sourceServerId,
      platform.requestSourceSettingsAttachment,
    ).catch((error) => {
      logger.error("[workspace-config-catalog] 请求 Source 设置 attachment 失败", error);
    });
  }, [sourceServerId, sourceServices, platform]);
  return sourceServices;
}

/** 配置专用解析；不改变 conversation 的 workspace attachment / replay 边界。 */
export function useConfigWorkspaceServicesResolution(
  workspacePath: string | null | undefined,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
  remoteTarget?: unknown,
  options?: WorkspaceServicesResolutionOptions,
  configOptions?: ConfigWorkspaceServicesOptions,
) {
  const enabled = configOptions?.enabled ?? true;
  const workspace = useWorkspaceServicesResolution(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
    remoteTarget,
    options,
  );
  const parsed = workspaceIdentity && parseRemoteWorkspaceIdentity(workspaceIdentity);
  const sourceId = parsed && parsed.kind === "server" ? parsed.sourceServerId : undefined;
  const platform = useOptionalPlatform();
  const sourceServices = useSourceSettingsServices(sourceId);
  const canAttach = Boolean(platform?.requestSourceSettingsAttachment);
  const [binding, setBinding] = useState<{
    services: IServiceAccessor;
    workspaceKey: string;
  } | null>(null);
  const workspaceKey = workspaceIdentity?.trim() || workspacePath || "";
  const target = remoteTargetSchema.safeParse(remoteTarget);
  const legacyRouteHint =
    target.success && workspacePath
      ? buildRemoteWorkspaceIdentity(workspacePath, target.data)
      : undefined;
  useEffect(() => {
    if (!enabled || workspace.rpcReady || !canAttach || !sourceServices || !workspacePath) return;
    const sourceServerWorkspaceService = sourceServices.sourceServerWorkspaceService;
    if (!sourceServerWorkspaceService) {
      logger.error("[workspace-config-catalog] Source 配置服务缺少 workspace 绑定能力");
      return;
    }
    let current = true;
    // 原因：无 tab 的 Source 配置没有经历 workspace attach，直接写会绕过旧 canonical key。
    // alias admission 完成后才开放该目录的配置 RPC，迟到结果只属于原 attachment/目标。
    void sourceServerWorkspaceService.resolveWorkspace({ workspacePath, legacyRouteHint }).then(
      () => {
        if (current) setBinding({ services: sourceServices, workspaceKey });
      },
      (error) => {
        if (current) logger.error("[workspace-config-catalog] 绑定配置目录身份失败", error);
      },
    );
    return () => {
      current = false;
    };
  }, [
    enabled,
    workspace.rpcReady,
    canAttach,
    sourceServices,
    workspacePath,
    workspaceKey,
    legacyRouteHint,
  ]);
  useEffect(() => {
    if (!enabled || workspace.rpcReady || !sourceId || !platform?.requestSourceSettingsAttachment)
      return;
    void ensureSourceSettingsServices(sourceId, platform.requestSourceSettingsAttachment).catch(
      (error) => {
        logger.error("[workspace-config-catalog] 请求远端配置 attachment 失败", error);
      },
    );
  }, [enabled, workspace.rpcReady, sourceId, platform]);
  if (!enabled) return workspace;
  if (configOptions?.requireUnscopedServices && !options?.unscopedServices) {
    return {
      ...workspace,
      connectionKind: "remote-waiting" as const,
      rpcReady: false,
    };
  }
  return !workspace.rpcReady &&
    canAttach &&
    sourceServices &&
    binding?.services === sourceServices &&
    binding.workspaceKey === workspaceKey
    ? {
        ...workspace,
        services: sourceServices,
        connectionKind: "remote-ready" as const,
        rpcReady: true,
      }
    : workspace;
}

export function useConfigWorkspaceServices(
  workspacePath: string | null | undefined,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
  remoteTarget?: unknown,
  options?: WorkspaceServicesResolutionOptions,
  configOptions?: ConfigWorkspaceServicesOptions,
) {
  return useConfigWorkspaceServicesResolution(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
    remoteTarget,
    options,
    configOptions,
  ).services;
}
