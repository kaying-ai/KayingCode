import type { AppTrustedContext } from "@zcode/session-control/contracts";
import { describe, expect, it } from "vitest";
import {
  appControlCommandId,
  resolveAppCreationDirectories,
} from "../../src/app-control/execution.js";

const context = {
  caller: "client",
  callerId: "local:client:extension:demo",
  rootSession: null,
  scopes: [{ kind: "app", sourceServerId: "local" }],
  grants: [],
} as unknown as AppTrustedContext;

describe("app-control execution helpers", () => {
  it("derives a stable command id from caller and request identity", () => {
    const first = appControlCommandId(context, "request-1");
    const retry = appControlCommandId(context, "request-1");
    const otherCaller = appControlCommandId(
      { ...context, callerId: "local:client:extension:other" } as unknown as AppTrustedContext,
      "request-1",
    );

    expect(first).toMatch(/^app-control-[a-f0-9]{64}$/);
    expect(retry).toBe(first);
    expect(otherCaller).not.toBe(first);
  });

  it("keeps local creation directories without an identity resolver", async () => {
    await expect(
      resolveAppCreationDirectories(
        "local",
        {
          projectId: "project-1",
          workspacePath: "/workspace",
          additionalDirectories: [],
          workspaceIdentity: "/workspace",
        },
        undefined,
      ),
    ).resolves.toEqual({
      projectId: "project-1",
      workspacePath: "/workspace",
      additionalDirectories: [],
      workspaceIdentity: "/workspace",
    });
  });

  it("requires a canonical identity for remote creation and rejects identity drift", async () => {
    await expect(
      resolveAppCreationDirectories(
        "server-1",
        {
          projectId: "project-1",
          workspacePath: "/workspace",
          additionalDirectories: [],
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "unavailable" });

    await expect(
      resolveAppCreationDirectories(
        "server-1",
        {
          projectId: "project-1",
          workspacePath: "/workspace",
          additionalDirectories: [],
          workspaceIdentity: "old-identity",
        },
        async () => "new-identity",
      ),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("uses the resolver identity for remote creation", async () => {
    await expect(
      resolveAppCreationDirectories(
        "server-1",
        {
          projectId: "project-1",
          workspacePath: "/workspace",
          additionalDirectories: [],
        },
        async () => "canonical-identity",
      ),
    ).resolves.toMatchObject({
      projectId: "project-1",
      workspaceIdentity: "canonical-identity",
    });
  });
});
