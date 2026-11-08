import type {
  HostPreparedProjectWorkspace,
  HostProjectWorkspaceNavigationInput,
  WindowHostRemoteWorkspaceDescriptor,
  WorkspaceConnectionTarget,
} from "@zcode/shared";
import type { IProjectService, IRemoteProjectService } from "@zcode/services";
import { createProjectWorkspaceNavigation } from "@zcode/services/node";

type ProjectServicePort = Pick<
  IProjectService,
  "readProjects" | "readTree" | "prepareSession" | "resolveSessionDirectories"
>;
type RemoteProjectServicePort = Pick<IRemoteProjectService, "readDirectory">;

export interface HostProjectWorkspaceNavigationDependencies {
  projectService: ProjectServicePort;
  remoteProjectService: RemoteProjectServicePort;
  readConnectionOwner(hostId: string): object | undefined;
  buildWorkspaceIdentity(hostId: string, workspacePath: string): string;
  connectRemoteWorkspace(input: {
    requestId: string;
    target: WorkspaceConnectionTarget;
    workspacePath: string;
    workspaceIdentity: string;
  }): Promise<WindowHostRemoteWorkspaceDescriptor>;
  bindRemoteWorkspace(input: {
    remoteSessionId: string;
    workspacePath: string;
    workspaceIdentity: string;
  }): Promise<void>;
  disposeRemoteSession(remoteSessionId: string): Promise<void>;
  /** Host 在任意 await 后都必须重新确认仍服务同一窗口，迟到结果不能写入新 Host。 */
  assertHost(): void;
}

/**
 * 手机 project 导航的 Host 侧入口：本地目录由 ProjectService 唯一准备；
 * 远端只复用/建立窗口连接 registry 的 logical session，并等待 workspace 可附着。
 */
export function createHostProjectWorkspaceNavigation(
  dependencies: HostProjectWorkspaceNavigationDependencies,
) {
  return {
    prepare(
      request: HostProjectWorkspaceNavigationInput,
      requestId: string,
    ): Promise<HostPreparedProjectWorkspace> {
      const navigation = createProjectWorkspaceNavigation({
        projectService: dependencies.projectService,
        remoteProjectService: dependencies.remoteProjectService,
        readConnectionOwner: (hostId) => dependencies.readConnectionOwner(hostId),
        openRemoteWorkspace: async ({ host, directories, owner, assertCurrent }) => {
          dependencies.assertHost();
          if (!host.target) throw new Error("project.host-offline");
          const workspaceIdentity =
            directories.workspaceIdentity ??
            dependencies.buildWorkspaceIdentity(host.id, directories.workspacePath);
          const descriptor = await dependencies.connectRemoteWorkspace({
            requestId,
            target: host.target,
            workspacePath: directories.workspacePath,
            workspaceIdentity,
          });
          try {
            dependencies.assertHost();
            if (dependencies.readConnectionOwner(host.id) !== owner)
              throw new Error("project.navigation-stale");
            await assertCurrent();
            dependencies.assertHost();
            await dependencies.bindRemoteWorkspace({
              remoteSessionId: descriptor.remoteSessionId,
              workspacePath: directories.workspacePath,
              workspaceIdentity,
            });
            dependencies.assertHost();
            return descriptor;
          } catch (error) {
            await dependencies
              .disposeRemoteSession(descriptor.remoteSessionId)
              .catch(() => undefined);
            throw error;
          }
        },
      });
      return navigation.prepare(request);
    },
  };
}
