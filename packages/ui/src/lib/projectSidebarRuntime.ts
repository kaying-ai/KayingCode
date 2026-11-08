import type { IProjectService, IRemoteProjectService, IServiceAccessor } from "@zcode/services";
import { readSafeLocalStorage } from "@/lib/browserEnvironment.js";

/**
 * 项目侧栏（ProjectSidebar）的运行时开关。
 *
 * 默认启用新侧栏；`KAYINGCODE_UI_SIDEBAR_V2=0` 或本地存储
 * `kayingcode:ui:sidebar-v2=0` 回退到旧 `WorkspaceSidebar`。环境变量优先于本地存储，
 * 便于构建/发布时强制回退；本地存储只用于运行期验证与排障。
 */
export const PROJECT_SIDEBAR_V2_ENV = "KAYINGCODE_UI_SIDEBAR_V2";
export const PROJECT_SIDEBAR_V2_STORAGE_KEY = "kayingcode:ui:sidebar-v2";

const DISABLED_FLAG_VALUES = new Set(["0", "false", "off", "no"]);

function readViteEnv(): Record<string, unknown> | undefined {
  try {
    return (import.meta as unknown as { env?: Record<string, unknown> }).env;
  } catch {
    return undefined;
  }
}

function readProcessEnv(name: string): string | undefined {
  const processLike = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = processLike.process?.env?.[name];
  return typeof value === "string" ? value : undefined;
}

function readFlagValue(): string | undefined {
  const env = readViteEnv();
  const candidates = [
    env?.[PROJECT_SIDEBAR_V2_ENV],
    env?.[`VITE_${PROJECT_SIDEBAR_V2_ENV}`],
    readProcessEnv(PROJECT_SIDEBAR_V2_ENV),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function parseFlag(value: string | null | undefined): boolean | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return DISABLED_FLAG_VALUES.has(normalized) ? false : true;
}

/** 新侧栏是否启用；默认 true，只有显式关闭值才回退旧侧栏。 */
export function isProjectSidebarV2Enabled(): boolean {
  const fromEnv = parseFlag(readFlagValue());
  if (fromEnv !== undefined) return fromEnv;
  const fromStorage = parseFlag(readSafeLocalStorage(PROJECT_SIDEBAR_V2_STORAGE_KEY));
  return fromStorage ?? true;
}

export type ProjectSidebarRuntimeReason =
  | "enabled"
  | "flag-disabled"
  | "project-service-unavailable";

export interface ProjectSidebarRuntime {
  mode: "project-sidebar" | "legacy";
  reason: ProjectSidebarRuntimeReason;
  /** 侧栏实际会使用的窗口目录组；远端 bridge 未提供时回退到 base 服务。 */
  projectService?: IProjectService;
  remoteProjectService?: IRemoteProjectService;
}

/**
 * 选择侧栏实现。项目目录是项目行的唯一事实源：没有 `projectService` 时不能渲染空树，
 * 必须回退旧侧栏并让调用方记录原因。
 */
export function resolveProjectSidebarRuntime(
  services: IServiceAccessor,
  enabled = isProjectSidebarV2Enabled(),
): ProjectSidebarRuntime {
  if (!enabled) {
    return { mode: "legacy", reason: "flag-disabled" };
  }
  const directory = services.windowProjectDirectory ?? services;
  if (!directory.projectService) {
    return {
      mode: "legacy",
      reason: "project-service-unavailable",
      remoteProjectService: directory.remoteProjectService,
    };
  }
  return {
    mode: "project-sidebar",
    reason: "enabled",
    projectService: directory.projectService,
    remoteProjectService: directory.remoteProjectService,
  };
}
