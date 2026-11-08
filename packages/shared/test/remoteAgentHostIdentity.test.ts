import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildRemoteHostWorkspaceIdentity,
  parseRemoteWorkspaceIdentity,
  remoteHostIdFromWorkspaceIdentity,
} from "../src/remote-workspace-identity.js";

const SERVER_ID = "d55be490-6b60-41b7-9d77-d25dbcefdaf4";
const WORKSPACE_ID = "da515f84ee3e913ef8280107";
const HOST_ID = `remote-agent:${SERVER_ID}:${WORKSPACE_ID}`;
const IDENTITY = `${HOST_ID}:${encodeURIComponent("/home/ubuntu/project-a")}`;

test("remote-agent host identity round-trips encoded workspace paths", () => {
  assert.equal(remoteHostIdFromWorkspaceIdentity(IDENTITY), HOST_ID);
  const rebuilt = buildRemoteHostWorkspaceIdentity(HOST_ID, "/home/ubuntu/project-a");
  assert.equal(rebuilt, IDENTITY);
  assert.equal(remoteHostIdFromWorkspaceIdentity(rebuilt), HOST_ID);
  assert.deepEqual(parseRemoteWorkspaceIdentity(rebuilt), {
    kind: "server",
    workspacePath: "/home/ubuntu/project-a",
  });
});

test("non remote-agent identities still slice the plain posix path", () => {
  const identity = "remote:ssh:example.com:22:ubuntu:/home/ubuntu/project-a";
  assert.equal(
    remoteHostIdFromWorkspaceIdentity(identity),
    "remote:ssh:example.com:22:ubuntu",
  );
  assert.equal(
    buildRemoteHostWorkspaceIdentity("remote:ssh:example.com:22:ubuntu", "/home/ubuntu/project-a"),
    identity,
  );
});
