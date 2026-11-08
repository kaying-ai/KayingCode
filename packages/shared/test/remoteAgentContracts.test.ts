import assert from "node:assert/strict";
import { test } from "vitest";
import {
  SERVER_REMOTE_PROTOCOL_VERSION,
  buildRemoteAgentWorkspaceIdentity,
  parseRemoteAgentWorkspaceIdentity,
  parseRemoteWorkspaceIdentity,
  remoteAgentTargetSchema,
  serverRemoteInfoSchema,
  stripRemoteAgentTargetSecrets,
} from "../src/index.js";

test("remote Agent target 与受管 remote target 隔离并删除 secret", () => {
  const target = remoteAgentTargetSchema.parse({
    kind: "server",
    transport: "ssh-tunnel",
    serverPort: 39393,
    ssh: {
      host: "agent.example.test",
      port: 22,
      username: "dev",
      password: "secret",
      privateKeyPassphrase: "passphrase",
    },
  });

  assert.deepEqual(stripRemoteAgentTargetSecrets(target), {
    kind: "server",
    transport: "ssh-tunnel",
    serverPort: 39393,
    ssh: {
      host: "agent.example.test",
      port: 22,
      username: "dev",
    },
  });
});

test("remote Agent target 拒绝 direct transport 与受管部署字段", () => {
  assert.equal(
    remoteAgentTargetSchema.safeParse({
      kind: "server",
      transport: "ssh-tunnel",
      ssh: { host: "example.test", username: "dev" },
    }).success,
    true,
  );
  assert.equal(
    remoteAgentTargetSchema.safeParse({
      kind: "server",
      transport: "direct",
      serverPort: 39393,
      ssh: { host: "example.test", username: "dev" },
    }).success,
    false,
  );
  assert.equal(
    remoteAgentTargetSchema.safeParse({
      kind: "server",
      transport: "ssh-tunnel",
      serverPort: 39393,
      ssh: {
        host: "example.test",
        username: "dev",
        assetInstallMode: "remote-download",
      },
    }).success,
    false,
  );
});

test("server-info v2 要求 generation、workspace identity 与显式能力", () => {
  const parsed = serverRemoteInfoSchema.parse({
    serverId: "server:one",
    instanceGeneration: 7,
    name: "Build agent",
    version: "3.15.0",
    protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
    minimumClientProtocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
    authRequired: false,
    auth: { methods: ["ssh-tunnel"], tlsRequired: false },
    workspaces: [
      {
        workspaceId: "workspace:one",
        path: "/srv/project",
        label: "project",
        workspaceIdentity: "remote-agent:server%3Aone:workspace%3Aone:%2Fsrv%2Fproject",
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
      processResourceTelemetry: true,
    },
  });

  assert.equal(
    parsed.workspaces[0]?.workspaceIdentity,
    "remote-agent:server%3Aone:workspace%3Aone:%2Fsrv%2Fproject",
  );
});

test("remote Agent workspace identity round-trips opaque ids", () => {
  const identity = buildRemoteAgentWorkspaceIdentity(
    "server:one",
    "workspace:/srv/project",
    "/srv/project",
  );
  assert.deepEqual(parseRemoteAgentWorkspaceIdentity(identity), {
    serverId: "server:one",
    workspaceId: "workspace:/srv/project",
    workspacePath: "/srv/project",
  });
  assert.deepEqual(parseRemoteWorkspaceIdentity(identity), {
    kind: "server",
    workspacePath: "/srv/project",
  });
  assert.equal(parseRemoteAgentWorkspaceIdentity("remote:ssh:host:22:user:/srv/project"), null);
});
