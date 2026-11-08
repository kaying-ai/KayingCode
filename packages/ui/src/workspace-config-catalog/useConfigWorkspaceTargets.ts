import { useEffect, useMemo, useState } from "react";
import { type ConfigCatalogSnapshot } from "@/workspace-config-catalog/contract.js";
import { readConfigCatalog, projectConfigTargets } from "@/workspace-config-catalog/catalog.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { filterWorkspaceTabsForSettingsSource } from "@/settings/settingsSourceWorkspace.js";
import { logger } from "@/logger.js";

const EMPTY: ConfigCatalogSnapshot = { projects: [], directory: { hosts: [], entries: [] } };

export interface ConfigWorkspaceTargetsOptions {
  /**
   * 非 Source 设置页传 false 时不读取项目目录、不返回任何目标，
   * 调用方保留原有 tab 推导（行为与接入前一致）。缺省 true。
   */
  enabled?: boolean;
}

export function useConfigWorkspaceTargets(
  sourceServerId?: string | null,
  options?: ConfigWorkspaceTargetsOptions,
) {
  const enabled = options?.enabled ?? true;
  const services = useBaseWorkspaceServices();
  const tabs = useTabStore((state) => state.tabs);
  const [snapshot, setSnapshot] = useState(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let serial = 0;
    const refresh = async () => {
      const request = ++serial;
      try {
        if (!services.projectService) throw new Error("project.service-unavailable");
        const result = await readConfigCatalog({
          projectService: services.projectService,
          remoteProjectService: services.remoteProjectService,
        });
        if (serial === request) setSnapshot(result);
      } catch (error) {
        if (serial !== request) return;
        setSnapshot(EMPTY);
        logger.error("[workspace-config-catalog] 读取配置目录失败", error);
      }
    };
    void refresh();
    const listener = services.broadcastService.onMessage((event) => {
      if (event.channel === "state:projects") void refresh();
    });
    return () => {
      ++serial;
      listener.dispose();
    };
  }, [enabled, services]);
  return useMemo(() => {
    if (!enabled) return [];
    const targets = projectConfigTargets(snapshot, tabs.filter(isWorkspaceTab));
    return sourceServerId === undefined
      ? targets
      : filterWorkspaceTabsForSettingsSource(targets, sourceServerId);
  }, [enabled, snapshot, sourceServerId, tabs]);
}
