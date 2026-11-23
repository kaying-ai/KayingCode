import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isRemoteWorkspaceIdentity,
  type TapMakerProject,
  type TapMakerProjectsRequest,
} from "@zcode/shared";
import type { VirtualProject } from "@zcode/services";
import {
  collectTapMakerCandidateDirectories,
  ensureTapMakerLocalProject,
  type TapMakerOpenProjectTarget,
} from "@/game-features/tapMakerProjectAssociation.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { asLocalrunServiceAccessor } from "@/lib/localrunServiceSurface.js";
import { logger } from "@/logger.js";
import { useOptionalProjectDirectory } from "@/project-sidebar/index.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";

export function useTapMakerProjects(onOpenProject: (target: TapMakerOpenProjectTarget) => void) {
  const services = useBaseWorkspaceServices();
  const service = services.kayingcodeAgentService;
  const projectDirectory = useOptionalProjectDirectory();
  const projectService = useMemo(() => {
    if (projectDirectory?.service) return projectDirectory.service;
    // 旧侧栏回退时没有目录 Provider，直接复用窗口项目服务的同一装配规则。
    const surface = asLocalrunServiceAccessor(services);
    return (surface.windowProjectDirectory ?? surface).projectService;
  }, [projectDirectory?.service, services]);
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
    const tabDirectories = tabStore
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
      // 原因：只从打开的 tab 取候选目录时，关闭 tab 或手动创建的项目永远关联不上远端游戏。
      // 修复依据：项目库是项目行的唯一事实源，roots 同样代表本地可检查目录。
      let projects: VirtualProject[] = [];
      if (projectService) {
        try {
          projects = await projectService.readProjects();
        } catch (cause) {
          logger.warn("[TapMakerProjects] 读取本地项目目录失败，仅使用已打开的工作区", {
            error: cause,
          });
        }
      }
      if (generation.current !== current) return;
      const result = await service.manageTapMakerProjects({
        action: "list",
        candidateDirectories: collectTapMakerCandidateDirectories({
          tabDirectories,
          projects,
        }),
      });
      if (generation.current !== current) return;
      if (result.action !== "list") throw new Error("Unexpected TapMaker list response");
      setProjects(result.projects);
    } catch (cause) {
      if (generation.current === current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [projectService, service, tabStore]);
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
          // 原因：新项目侧栏只渲染 Host 项目库，恢复后仅 addTab 不会生成项目行。
          // 修复依据：先在项目库按目录原子复用/登记，再带着项目身份打开工作区；登记失败按恢复失败提示。
          const registered = projectService
            ? await ensureTapMakerLocalProject(projectService, {
                projectRoot: result.projectRoot,
              })
            : null;
          // 原因：主区允许切到其它菜单，恢复回包不能抢走新页面；仍登记实际目录以免丢失结果。
          if (mounted.current) {
            tabStore.getState().addTab(result.projectRoot, { workspacePurpose: "project" });
            onOpenProject({ path: result.projectRoot, projectId: registered?.id });
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
    [service, onOpenProject, projectService, refresh, tabStore],
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
    async (project: TapMakerProject) => {
      if (!project.localDirectory || running.current) return;
      const localDirectory = project.localDirectory;
      running.current = true;
      let projectId: string | undefined;
      try {
        if (projectService) {
          try {
            projectId = (
              await ensureTapMakerLocalProject(projectService, { projectRoot: localDirectory })
            ).id;
          } catch (cause) {
            // 打开已有目录不因项目库写失败被阻断；退化为仅按工作区打开。
            logger.warn("[TapMakerProjects] 打开本地项目时登记失败", { error: cause });
          }
        }
        tabStore.getState().addTab(localDirectory, { workspacePurpose: "project" });
        onOpenProject({ path: localDirectory, projectId });
      } finally {
        running.current = false;
      }
    },
    [onOpenProject, projectService, tabStore],
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
