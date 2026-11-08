import assert from "node:assert/strict";
import { test } from "vitest";
import type { RemoteAgentTarget, ServerRemoteInfo } from "@zcode/shared";
import { buildRemoteWorkspaceSessionMutation } from "../src/lib/remoteWorkspaceHistory.js";

const target: RemoteAgentTarget = {
  kind: "server",
  transport: "ssh-tunnel",
  serverPort: 39_393,
  ssh: {
    host: "agent.example.test",
    username: "dev",
    password: "secret",
    privateKeyPassphrase: "passphrase",
    privateKeyPath: "/keys/id_ed25519",
  },
};

const serverInfo: ServerRemoteInfo = {
  serverId: "server-one",
  name: "Agent One",
  instanceGeneration: 4,
  version: "3.15.0",
  protocolVersion: 2,
  minimumClientProtocolVersion: 2,
  authRequired: false,
  auth: { methods: ["ssh-tunnel"], tlsRequired: false },
  workspaces: [
    {
      workspaceId: "workspace-one",
      path: "/srv/project",
      label: "Project",
      workspaceIdentity: "remote-agent:server-one:workspace-one:%2Fsrv%2Fproject",
      access: "read-write",
    },
  ],
  capabilities: {
    desktopContinuous: true,
    trustedHostCapability: true,
    workspaceCatalog: true,
    conversationV4: true,
    attachmentChunkUpload: true,
    file: true,
    git: true,
    terminal: true,
    providerSettings: true,
    browserControl: false,
    cua: false,
    automationScheduler: false,
    websocketRpc: true,
  },
};

test("remote Agent workspace snapshot stores server identity and credential references only", () => {
  const mutation = buildRemoteWorkspaceSessionMutation({
    remoteSessions: [],
    workspacePath: "/srv/project",
    workspaceIdentity: "remote-agent:server-one:workspace-one:%2Fsrv%2Fproject",
    target,
    serverInfo,
    lastConnectionStatus: "connected",
    touchOpenedAt: true,
  });

  assert.equal(mutation.entry.target.kind, "server");
  assert.equal(
    mutation.entry.target.kind === "server" && mutation.entry.target.serverId,
    "server-one",
  );
  const persistedSsh =
    mutation.entry.target.kind === "server"
      ? (mutation.entry.target.ssh as unknown as Record<string, unknown>)
      : {};
  assert.equal("password" in persistedSsh, false);
  assert.equal("privateKeyPassphrase" in persistedSsh, false);
  assert.deepEqual(mutation.credentialsToSave.map(({ value }) => value).sort(), [
    "passphrase",
    "secret",
  ]);
});

test("failed remote Agent reconnect preserves the existing server snapshot without server-info", () => {
  const connected = buildRemoteWorkspaceSessionMutation({
    remoteSessions: [],
    workspacePath: "/srv/project",
    workspaceIdentity: "remote-agent:server-one:workspace-one:%2Fsrv%2Fproject",
    target,
    serverInfo,
    lastConnectionStatus: "connected",
    touchOpenedAt: true,
  });

  const failed = buildRemoteWorkspaceSessionMutation({
    remoteSessions: connected.nextRemoteSessions,
    workspacePath: "/srv/project",
    workspaceIdentity: "remote-agent:server-one:workspace-one:%2Fsrv%2Fproject",
    target,
    lastConnectionStatus: "failed",
    lastConnectionError: "offline",
    touchOpenedAt: false,
  });

  assert.deepEqual(failed.entry.target, connected.entry.target);
  assert.equal(failed.entry.lastConnectionStatus, "failed");
  assert.equal(failed.entry.lastConnectionError, "offline");
});
