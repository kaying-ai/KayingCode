import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRemoteWorkspaceIdentity,
  type TapMakerProject,
  type TapMakerProjectsRequest,
} from "@zcode/shared";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";

export function useTapMakerProjects(onOpenProject: (path: string) => void) {
  const service = useBaseWorkspaceServices().kayingcodeAgentService;
  const platform = usePlatform();
  const tabStore = useTabStoreApi();
  const [projects, setProjects] = useState<TapMakerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    const candidateDirectories = tabStore
      .getState()
      .tabs.filter(isWorkspaceTab)
      .filter(
        (tab) =>
          !tab.remoteSessionId &&
          !tab.remoteTarget &&
          !(tab.workspaceIdentity && isRemoteWorkspaceIdentity(tab.workspaceIdentity)),
      )
      .map((tab) => tab.workspacePath);
    try {
      const result = await service.manageTapMakerProjects({ action: "list", candidateDirectories });
      if (generation.current !== current) return;
      if (result.action !== "list") throw new Error("Unexpected TapMaker list response");
      setProjects(result.projects);
    } catch (cause) {
      if (generation.current === current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [service, tabStore]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, [refresh]);

  const operate = useCallback(
    async (key: string, input: TapMakerProjectsRequest) => {
      if (running.current) return;
      running.current = true;
      ++generation.current;
      setLoading(false);
      setWorking(key);
      setError(null);
      try {
        const result = await service.manageTapMakerProjects(input);
        if (result.action === "restore") {
          // 原因：主区允许切到其它菜单，恢复回包不能抢走新页面；仍登记实际目录以免丢失结果。
          if (mounted.current) {
            tabStore.getState().addTab(result.projectRoot, { workspacePurpose: "project" });
            onOpenProject(result.projectRoot);
          } else
            tabStore
              .getState()
              .ensureWorkspaceTab(result.projectRoot, { workspacePurpose: "project" });
        } else if (mounted.current) await refresh();
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        running.current = false;
        if (mounted.current) setWorking(null);
      }
    },
    [service, onOpenProject, refresh, tabStore],
  );

  const restore = useCallback(
    async (project: TapMakerProject) => {
      if (running.current) return;
      running.current = true;
      setWorking(project.id);
      let directory: string | null = null;
      try {
        directory = await platform.selectDirectory();
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        running.current = false;
        if (mounted.current) setWorking(null);
      }
      if (directory && mounted.current)
        await operate(project.id, {
          action: "restore",
          appId: project.id,
          projectName: project.name,
          selectedDirectory: directory,
        });
    },
    [platform, operate],
  );
  const openLocal = useCallback(
    (project: TapMakerProject) => {
      if (!project.localDirectory || running.current) return;
      tabStore.getState().addTab(project.localDirectory, { workspacePurpose: "project" });
      onOpenProject(project.localDirectory);
    },
    [onOpenProject, tabStore],
  );
  return {
    projects,
    loading,
    error,
    working,
    refresh,
    restore,
    openLocal,
    authorize: () => operate("authorize", { action: "authorize" }),
  };
}
