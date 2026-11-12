import type { IProjectService } from "@zcode/services";
import type { CreateTaskRequest } from "@/app-shell/types.js";
import { readComposerWorkspaceScope } from "@/v4/composer/composerDraftStore.js";

export function resolveNewTaskDraftProjectId(
  request: CreateTaskRequest | undefined,
  target: { workspacePath: string; workspaceIdentity: string | null },
  clientNamespace: string,
): string | null | undefined {
  if (typeof request !== "object" || !request) return undefined;
  if (request.projectId !== undefined) return request.projectId;
  if (request.targetWorkspace) return request.targetWorkspace.projectId;
  if (!request.initialPrompt?.trim() && !request.initialPromptMention) return undefined;

  // 插件试用只传预填内容。若先写入空 scope，startDraft 会丢掉已选项目。
  // 从已解析工作区的 scope 继承归属，显式选择的目录仍由 Host 准备。
  return (
    readComposerWorkspaceScope(
      target.workspacePath,
      target.workspaceIdentity ?? undefined,
      clientNamespace,
    )?.projectId || undefined
  );
}

export interface PreparedProjectNewTaskTarget {
  projectId: string | undefined;
  workspaceIdentity: string | null;
  workspacePath: string;
}

/**
 * 项目选择器只传 projectId/hostId，不传 cwd；必须让 Host prepareSession 解析主目录。
 * 原因：零 root 项目需要 Host 创建默认目录，多 root/远程项目需要 Host 返回权威主目录与身份；
 * 直接把当前 workspace 当作新任务 cwd 会让首发预留报 project.cwd-not-in-roots。
 */
export async function resolvePreparedProjectNewTaskTarget(input: {
  request: CreateTaskRequest | undefined;
  projectService: Pick<IProjectService, "prepareSession"> | undefined;
}): Promise<PreparedProjectNewTaskTarget | null> {
  // 显式 targetWorkspace 已由调用方解析过目录（侧栏项目/工作流恢复），不再重复准备。
  if (typeof input.request !== "object" || !input.request || input.request.targetWorkspace) {
    return null;
  }
  const projectId = input.request.projectId ?? undefined;
  const hostId = input.request.hostId;
  if (!projectId && !hostId) return null;
  if (!input.projectService) throw new Error("project.service-unavailable");
  const prepared = await input.projectService.prepareSession({
    ...(projectId ? { projectId } : {}),
    ...(hostId ? { hostId } : {}),
  });
  return {
    projectId: prepared.projectId ?? projectId,
    workspaceIdentity: prepared.workspaceIdentity ?? null,
    workspacePath: prepared.workspacePath,
  };
}
