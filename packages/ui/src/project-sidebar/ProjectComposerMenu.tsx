/* eslint-disable max-lines -- 聊天项目菜单同时编排候选搜索、当前项目编辑与创建表单；拆分前须先抽出候选项组件。 */
import { RemoteIdentityHoverCard } from "@/project-sidebar/RemoteIdentityHoverCard.js";
import { remoteHostLabel } from "@/project-sidebar/RemoteHostSection.js";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group.js";
import {
  ChevronDownIcon,
  Cloud,
  Folder,
  FolderPlus,
  MessageCircle,
  Plus,
  SearchIcon,
  X,
} from "lucide-react";
import { useKayingCodeIntl } from "@/i18n/IntlProvider.js";
import { useRemoteConnectionEntryVisibility } from "@/hooks/useRemoteConnectionEntryVisibility.js";
import { cn } from "@/components/lib/utils.js";
import { logger } from "@/logger.js";
import {
  TID_COMPOSER_PROJECT_DETACH,
  TID_COMPOSER_REMOTE_CONNECTION,
  TID_COMPOSER_WORK_OUTSIDE_PROJECT,
  TID_COMPOSER_WORKSPACE_TRIGGER,
} from "@zcode/shared/test-ids";
import { runUserAction, runUserActionAsync } from "@/lib/userActionTelemetry.js";

import type { ProjectSidebarProps } from "@/project-sidebar/contract.js";
import { remoteHostIdFromWorkspaceIdentity } from "@/project-sidebar/contract.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { ProjectEditor } from "@/project-sidebar/ProjectEditor.js";
import { ProjectCreation } from "@/project-sidebar/ProjectCreation.js";
import { ProjectFolderIcon } from "@/project-sidebar/ProjectFolderIcon.js";
import {
  filterProjectComposerProjects,
  projectKey,
  projectSourceServerId,
} from "@/project-sidebar/view.js";
import { useProjectSelectionDirectory } from "@/project-sidebar/ProjectDirectoryProvider.js";
import { useKayingCodeSessionStore } from "@/store/kayingcodeSessionStore.js";

export function ProjectComposerMenu({
  workspacePath,
  workspaceIdentity,
  compactForRemoteControl = false,
  allowConversationWorkspaceSelection = true,
  allowConversationWorkspaceDetach = allowConversationWorkspaceSelection,
  onCreateTask,
  onSelectConversationWorkspace,
  allowRemoteWorkspace = true,
  onOpenRemoteWorkspace,
  onOpenFolder,
  containerClassName,
  triggerClassName,
  triggerIndicator,
  showEditProject = false,
  children,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  compactForRemoteControl?: boolean;
  allowConversationWorkspaceSelection?: boolean;
  /** 是否显示项目 chip 的快捷脱离按钮；默认跟随非项目工作区选择能力。 */
  allowConversationWorkspaceDetach?: boolean;
  onCreateTask: ProjectSidebarProps["onCreateTask"];
  onSelectConversationWorkspace: () => void | Promise<void>;
  allowRemoteWorkspace?: boolean;
  onOpenRemoteWorkspace?: ProjectSidebarProps["onOpenRemoteWorkspace"];
  /** 保留本地“打开文件夹”入口；项目候选本身不按 tab/cwd 生成。 */
  onOpenFolder?: () => void;
  /** 调用方局部调整 workspace chip 外层视觉，不改变普通会话默认样式。 */
  containerClassName?: string;
  /** 调用方局部调整 workspace trigger 视觉，不改变普通会话默认样式。 */
  triggerClassName?: string;
  /** 调用方局部替换尾部 indicator；普通会话继续使用默认 Lucide chevron。 */
  triggerIndicator?: ReactNode;
  /** 聊天头部启用当前项目编辑，其他项目选择器保持原有入口。 */
  showEditProject?: boolean;
  /** 分支等控件位于项目选择器与编辑按钮之间。 */
  children?: ReactNode;
}) {
  const { intl } = useKayingCodeIntl();
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const showRemoteConnectionEntry = useRemoteConnectionEntryVisibility();
  // Bugfix: Web 普通模式没有完整远程 workspace 会话链路，不能只依赖全局 feature visibility。
  // 这里叠加壳层能力开关，确保本地 Web 模式的空态菜单不会露出必然失败的远程连接入口。
  const canUseRemoteWorkspace =
    allowRemoteWorkspace && showRemoteConnectionEntry && Boolean(onOpenRemoteWorkspace);
  const {
    allProjects,
    projects,
    availability,
    directory,
    deviceNames,
    error,
    service,
    remoteService,
    refresh,
  } = useProjectSelectionDirectory();
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const projectId = useKayingCodeSessionStore(
    (state) => state.workspaces[workspaceKey]?.draftProjectId,
  );
  const activeTaskId = useKayingCodeSessionStore(
    (state) => state.workspaces[workspaceKey]?.activeTaskId,
  );
  const createProjectTask: ProjectSidebarProps["onCreateTask"] = (request) =>
    onCreateTask(
      typeof request === "object"
        ? {
            ...request,
            // 远程目录确认曾遗漏草稿分组；两个项目入口必须从同一草稿 owner 读取组织意图。
            taskGroupId: !activeTaskId
              ? useKayingCodeSessionStore
                  .getState()
                  .getWorkspaceState(workspacePath, workspaceIdentity).draftTaskGroupId
              : null,
          }
        : request,
    );
  const draftVersion = useKayingCodeSessionStore(
    (state) => state.workspaces[workspaceKey]?.draftFocusVersion,
  );
  // 草稿重建和聊天切换都会使旧返回意图失效，即使后来又回到同一路径也不能复活旧操作。
  const chatKey = JSON.stringify([workspaceKey, activeTaskId, projectId, draftVersion]);
  // 项目编辑弹窗只在当前聊天未切换时有效；键值变化即关闭旧草稿，避免同 cwd 误编辑。
  const chat = chatKey;
  const trigger = useRef<HTMLButtonElement>(null);
  const [creating, setCreating] = useState(false);
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const hostId = workspaceIdentity ? remoteHostIdFromWorkspaceIdentity(workspaceIdentity) : null;
  // 原因：目录可以属于多个项目，tab/cwd 不能决定归属；只读草稿的项目身份。
  const currentProject = projects.find(
    (project) =>
      project.id === projectId &&
      (hostId ? project.hostId === hostId : !availability.get(projectKey(project))?.entryId),
  );
  const canEditProject =
    showEditProject &&
    currentProject &&
    !currentProject.legacySingleRoot &&
    (availability.get(projectKey(currentProject))?.online ?? true) &&
    Boolean(service);
  const isConversationWorkspace = !currentProject;
  const canDetachProject =
    !hostId &&
    allowConversationWorkspaceSelection &&
    allowConversationWorkspaceDetach &&
    !isConversationWorkspace;
  const visibleProjects = useMemo(
    () =>
      filterProjectComposerProjects(projects, workspaceSearchQuery, (project) => {
        const deviceName = deviceNames?.get(projectSourceServerId(project) ?? "");
        if (deviceName) return deviceName;
        const host = directory.hosts.find((candidate) => candidate.id === project.hostId);
        return host ? remoteHostLabel(host) : undefined;
      }),
    [projects, workspaceSearchQuery, deviceNames, directory.hosts],
  );
  const currentWorkspaceTitle =
    currentProject?.name ?? intl.formatMessage({ id: "chat.empty.selectProject" });
  const currentWorkspaceIconClassName = cn(
    "size-4 text-foreground-subtle transition-opacity",
    // Bugfix: 关闭按钮和项目图标占用同一位置。只有允许脱离项目时才隐藏底层图标，
    // 否则 X 会直接叠在图标上；定时任务禁用该能力时则让项目图标保持可见。
    canDetachProject &&
      "group-hover/workspace-chip:opacity-0 group-focus-within/workspace-chip:opacity-0",
  );

  const menu = (
    <DropdownMenu>
      <div
        className={cn(
          "group/workspace-chip relative flex min-w-0 items-center rounded-full hover:bg-surface-hover focus-within:bg-surface-hover",
          containerClassName,
        )}
      >
        {canDetachProject ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-none absolute left-1.5 z-10 rounded-full text-foreground-subtle opacity-0 transition-opacity group-hover/workspace-chip:pointer-events-auto group-hover/workspace-chip:opacity-100 group-focus-within/workspace-chip:pointer-events-auto group-focus-within/workspace-chip:opacity-100"
            aria-label={intl.formatMessage({ id: "chat.empty.detachProject" })}
            data-testid={TID_COMPOSER_PROJECT_DETACH}
            onClick={(event) => {
              event.stopPropagation();
              void runUserActionAsync({
                input: {
                  featureId: "workspace.project_binding",
                  action: "detach",
                  trigger: "button",
                },
                operation: () => Promise.resolve(onSelectConversationWorkspace()),
                completed: { resultSource: "optimistic_projection" },
                failureStage: "project_detach",
              });
            }}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="default"
            className={cn(
              "min-w-0 rounded-full bg-transparent text-ui-base/relaxed hover:bg-transparent",
              // Bugfix: 远程控制页面空态文案区域更窄，workspacePath 过长会把同一行挤坏。
              // 这里在远控模式收紧菜单触发按钮宽度，让超长路径在按钮内走省略号。
              compactForRemoteControl ? "max-w-44 pl-3 pr-2" : "max-w-[15rem] pl-3 pr-2",
              triggerClassName,
            )}
            ref={trigger}
            aria-label={intl.formatMessage({ id: "chat.empty.workspaceMenu" })}
            data-testid={TID_COMPOSER_WORKSPACE_TRIGGER}
          >
            {hostId ? (
              <Cloud className={currentWorkspaceIconClassName} />
            ) : (
              <ProjectFolderIcon
                rootCount={currentProject?.roots.length ?? 0}
                className={currentWorkspaceIconClassName}
              />
            )}
            <span className="block max-w-full truncate">{currentWorkspaceTitle}</span>
            {triggerIndicator ?? <ChevronDownIcon className="size-3.5 text-foreground-subtle" />}
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        data-testid="composer-project-menu"
        align="start"
        side="top"
        className="flex w-72 max-w-[calc(100vw-2rem)] flex-col p-0"
      >
        <div
          data-slot="command-input-wrapper"
          className="shrink-0 p-1 border-b border-border"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <InputGroup className="h-8 border-0 !bg-transparent hover:border-input-border-hover ">
            <input
              data-slot="command-input"
              value={workspaceSearchQuery}
              placeholder={intl.formatMessage({
                id: "chat.empty.workspaceSearchPlaceholder",
              })}
              onChange={(event) => setWorkspaceSearchQuery(event.target.value)}
              className="w-full text-ui-base/relaxed text-foreground outline-hidden placeholder:text-foreground-subtlest disabled:cursor-not-allowed disabled:opacity-50"
            />
            <InputGroupAddon>
              <SearchIcon className="size-4 shrink-0 text-foreground-subtlest" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div className="flex min-h-0 flex-col p-1">
          {error ? (
            <div role="alert" className="px-2 py-2 text-ui-base text-destructive">
              {error}
            </div>
          ) : null}
          <div className="min-h-0 max-h-60 overflow-y-auto">
            {visibleProjects.map((project) => {
              const state = availability.get(projectKey(project));
              const isRemoteWorkspace =
                Boolean(state?.entryId) || Boolean(hostId && hostId === project.hostId);
              const disabled = state?.online === false;
              const remoteHost = directory.hosts.find((host) => host.id === project.hostId);
              const deviceName =
                deviceNames?.get(projectSourceServerId(project) ?? "") ||
                (remoteHost ? remoteHostLabel(remoteHost) : undefined);
              return (
                <RemoteIdentityHoverCard
                  key={projectKey(project)}
                  host={remoteHost}
                  title={project.name}
                  projectName={project.name}
                  deviceName={deviceName}
                  paths={project.roots.map((root) => root.rootPath)}
                  anchorToMenu
                  contentClassName="z-[60] max-w-(--radix-hover-card-content-available-width)"
                >
                  <span className="block min-w-0">
                    <DropdownMenuCheckboxItem
                      data-project-id={project.id}
                      data-project-host={project.hostId}
                      data-project-name={project.name}
                      checked={currentProject === project}
                      disabled={disabled}
                      onSelect={() => {
                        logger.info("[ProjectComposerMenu] 选择项目", {
                          projectId: project.id,
                          hostId: project.hostId,
                        });
                        runUserAction({
                          input: {
                            featureId: "workspace.project_binding",
                            action: isConversationWorkspace ? "attach" : "switch",
                            trigger: "menu",
                            workspaceKind: isRemoteWorkspace ? "remote" : "local",
                          },
                          // 同侧栏项目新建入口：由 Root/Host 解析主要目录及远程 attachment。
                          operation: () =>
                            createProjectTask({
                              projectId: project.id,
                              ...(compactForRemoteControl ||
                              directory.hosts.some((host) => host.id === project.hostId)
                                ? { hostId: project.hostId }
                                : {}),
                            }),
                          completed: { resultSource: "local_commit" },
                          failureStage: "project_switch",
                        });
                      }}
                    >
                      {isRemoteWorkspace ? (
                        <Cloud className="size-4 text-foreground-subtle" />
                      ) : (
                        <ProjectFolderIcon
                          rootCount={project.roots.length}
                          className="size-4 text-foreground-subtle"
                        />
                      )}
                      {/* 不同字号按框居中会让设备名基线上浮；文字单独对齐基线，外层图标仍居中。 */}
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        {deviceName ? (
                          <span
                            data-testid="composer-project-device"
                            className="max-w-36 truncate text-ui-sm text-remote-foreground-muted"
                          >
                            {deviceName}
                          </span>
                        ) : null}
                      </span>
                      {disabled ? (
                        <span className="text-ui-xs text-foreground-subtlest">
                          {intl.formatMessage({ id: "project.offline" })}
                        </span>
                      ) : null}
                    </DropdownMenuCheckboxItem>
                  </span>
                </RemoteIdentityHoverCard>
              );
            })}
            {visibleProjects.length === 0 && !error ? (
              <div className="px-2 py-2 text-ui-base text-foreground-subtlest">
                {intl.formatMessage({ id: "chat.empty.workspaceSearchEmpty" })}
              </div>
            ) : null}
          </div>

          <div className="shrink-0">
            <DropdownMenuSeparator />
            {/* 项目创建依赖共享服务，不能受本机原生打开文件夹的能力开关限制。 */}
            <DropdownMenuItem
              data-testid="composer-create-project"
              disabled={!service || !remoteService}
              onSelect={() => setCreating(true)}
            >
              <FolderPlus className="size-4 text-foreground-subtle" />
              <span>{intl.formatMessage({ id: "project.create" })}</span>
            </DropdownMenuItem>
            {onOpenFolder ? (
              <DropdownMenuItem data-testid="composer-open-folder" onSelect={() => onOpenFolder()}>
                <Folder className="size-4 text-foreground-subtle" />
                <span>{intl.formatMessage({ id: "workspace.openFolder" })}</span>
              </DropdownMenuItem>
            ) : null}
            {canUseRemoteWorkspace ? (
              <DropdownMenuItem
                data-testid={TID_COMPOSER_REMOTE_CONNECTION}
                onSelect={() => {
                  // Bugfix: 打开远程弹窗时必须让 DropdownMenu 执行默认关闭流程。
                  // 阻止默认 select 会让父菜单与 modal 同时保持打开，浮层层级调整后父菜单会覆盖弹窗。
                  logger.info(
                    `[ProjectComposerMenu] open remote dialog from workspace menu workspace=${workspacePath}`,
                  );
                  // 连接流程由 Root 唯一持有；聊天只打开入口，不持有连接状态。
                  runUserAction({
                    input: {
                      featureId: "workspace.remote.lifecycle",
                      action: "open_dialog",
                      trigger: "menu",
                      workspaceKind: "remote",
                    },
                    operation: () => onOpenRemoteWorkspace?.(),
                    completed: { resultSource: "local_commit" },
                    failureStage: "dialog_open",
                  });
                }}
              >
                <Cloud className="size-4 text-foreground-subtle" />
                <span>{intl.formatMessage({ id: "chat.empty.newRemoteConnection" })}</span>
              </DropdownMenuItem>
            ) : null}
            {allowConversationWorkspaceSelection && !hostId ? (
              <DropdownMenuCheckboxItem
                data-testid={TID_COMPOSER_WORK_OUTSIDE_PROJECT}
                checked={isConversationWorkspace}
                onSelect={() =>
                  void runUserActionAsync({
                    input: {
                      featureId: "workspace.project_binding",
                      action: "work_outside_project",
                      trigger: "menu",
                    },
                    operation: () => Promise.resolve(onSelectConversationWorkspace()),
                    completed: { resultSource: "optimistic_projection" },
                    failureStage: "project_detach",
                  })
                }
              >
                <MessageCircle className="size-4 text-foreground-subtle" />
                <span>{intl.formatMessage({ id: "chat.empty.workOutsideProject" })}</span>
              </DropdownMenuCheckboxItem>
            ) : null}
          </div>
        </div>
      </DropdownMenuContent>
      {/* 连接后的目录流程由 Root/远程向导持有；这里只复用项目创建表单。 */}
      {creating && service && remoteService ? (
        <ProjectCreation
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          onCreateTask={createProjectTask}
          projects={allProjects}
          directory={directory}
          service={service}
          remoteService={remoteService}
          defaultDeviceId={activeTaskId && hostId ? hostId : "local"}
          allowDeviceManagement={Boolean(onOpenRemoteWorkspace)}
          onOpenRemoteWorkspace={onOpenRemoteWorkspace}
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      ) : null}
    </DropdownMenu>
  );
  return (
    <>
      {menu}
      {children}
      {canEditProject ? (
        <ControlHintTooltip title={intl.formatMessage({ id: "project.edit" })}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-foreground-subtle"
            aria-label={intl.formatMessage({ id: "project.edit" })}
            data-testid="composer-edit-project"
            onClick={() => setEditingChat(chat)}
          >
            <Plus className="size-4" />
          </Button>
        </ControlHintTooltip>
      ) : null}
      {/* 项目身份沿用菜单；聊天切换使旧编辑器失效，避免同 cwd 的项目被误编辑。 */}
      {editingChat === chat && canEditProject && currentProject && service ? (
        <ProjectEditor
          key={projectKey(currentProject)}
          project={currentProject}
          host={directory.hosts.find((host) => host.id === currentProject.hostId)}
          projects={allProjects.filter(
            (project) => !availability.get(projectKey(project))?.entryId,
          )}
          service={service}
          onClose={() => setEditingChat(null)}
          onSaved={refresh}
          onDeleted={refresh}
        />
      ) : null}
    </>
  );
}
