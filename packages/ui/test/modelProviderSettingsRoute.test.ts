import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveModelProviderSettingsRoute } from "../src/lib/modelProviderSettingsRoute.js";
import { resolveWorkspaceServiceIsRemoteTarget } from "../src/hooks/useWorkspaceServices.js";

const remoteAgentTarget = {
  kind: "server" as const,
  transport: "ssh-tunnel" as const,
  ssh: {
    host: "agent.example.test",
    port: 22,
    username: "dev",
  },
};

test("Remote Agent Provider settings stay on the remote workspace authority", () => {
  assert.deepEqual(
    resolveModelProviderSettingsRoute({
      activeWorkspacePath: "/srv/project",
      captionWorkspacePath: "/srv/project",
      localConnectivityWorkspacePath: undefined,
      activeWorkspaceTab: {
        workspacePath: "/srv/project",
        workspaceIdentity: "remote-agent:server:workspace:/srv/project",
        remoteAgentTarget,
      },
    }),
    {
      authority: "workspace",
      workspacePath: "/srv/project",
      connectivityWorkspacePath: "/srv/project",
      connectivityWorkspaceRequired: false,
    },
  );
});

test("disconnected Remote Agent Provider settings do not fall back to the local host", () => {
  const route = resolveModelProviderSettingsRoute({
    activeWorkspacePath: "/srv/project",
    captionWorkspacePath: "/srv/project",
    localConnectivityWorkspacePath: "C:\\local-project",
    activeWorkspaceTab: {
      workspacePath: "/srv/project",
      workspaceIdentity: "remote-agent:server:workspace:/srv/project",
      remoteAgentTarget,
    },
  });

  assert.equal(route.authority, "workspace");
  assert.equal(route.connectivityWorkspacePath, "/srv/project");
  assert.equal(route.connectivityWorkspaceRequired, false);
});

test("local and managed remote workspaces preserve Local Host Provider settings", () => {
  assert.deepEqual(
    resolveModelProviderSettingsRoute({
      activeWorkspacePath: "C:\\code\\local-project",
      captionWorkspacePath: "C:\\code\\local-project",
      localConnectivityWorkspacePath: "C:\\code\\local-project",
      activeWorkspaceTab: {
        workspacePath: "C:\\code\\local-project",
      },
    }),
    {
      authority: "local-host",
      workspacePath: "C:\\code\\local-project",
      connectivityWorkspacePath: "C:\\code\\local-project",
      connectivityWorkspaceRequired: false,
    },
  );

  assert.deepEqual(
    resolveModelProviderSettingsRoute({
      activeWorkspacePath: "/home/dev/managed",
      captionWorkspacePath: "/home/dev/managed",
      localConnectivityWorkspacePath: undefined,
      activeWorkspaceTab: {
        workspacePath: "/home/dev/managed",
        workspaceIdentity: "ssh:managed",
        remoteSessionId: "managed-session",
        remoteTarget: { kind: "ssh" },
      },
    }),
    {
      authority: "local-host",
      workspacePath: "/home/dev/managed",
      connectivityWorkspacePath: undefined,
      connectivityWorkspaceRequired: true,
    },
  );
});

test("path-only Remote Agent metadata remains remote and cannot use Local Host fallback", () => {
  assert.equal(
    resolveWorkspaceServiceIsRemoteTarget({
      workspacePath: "/srv/project",
      activeWorkspacePath: "/srv/project",
      activeWorkspaceIdentity: null,
      activeTab: {
        workspacePath: "/srv/project",
        remoteAgentTarget,
      },
    }),
    true,
  );
  assert.equal(
    resolveWorkspaceServiceIsRemoteTarget({
      workspacePath: "C:\\code\\local-project",
      activeWorkspacePath: "C:\\code\\local-project",
      activeWorkspaceIdentity: null,
      activeTab: {
        workspacePath: "C:\\code\\local-project",
      },
    }),
    false,
  );
});
