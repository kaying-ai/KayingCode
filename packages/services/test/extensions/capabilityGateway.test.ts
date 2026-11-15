import { Emitter } from "@zcode/rpc";
import {
  type ExtensionGrant,
  type ExtensionProtocols,
} from "@zcode/shared/extension-host";
import { describe, expect, it, vi } from "vitest";
import {
  createCapabilityGateway,
  type CapabilityGrantFacts,
  type CapabilityHandlerMap,
} from "../../src/extensions/capabilityGateway.js";

const PLUGIN_ID = "demo@inline";
const SESSION_ID = "sess_1";

function createFacts(input?: {
  grants?: ExtensionGrant[];
  protocols?: ExtensionProtocols;
  granted?: boolean;
}) {
  const changed = new Emitter<void>();
  let granted = input?.granted ?? true;
  const facts: CapabilityGrantFacts = {
    declared: () => ({
      grants: input?.grants ?? ["sessions.read"],
      protocols: input?.protocols ?? { sessions: 1 },
    }),
    granted: () => granted,
    onDidChange: changed.event,
  };
  return {
    facts,
    changed,
    revoke() {
      granted = false;
      changed.fire();
    },
  };
}

function createGateway(
  facts: CapabilityGrantFacts,
  handlers: Partial<CapabilityHandlerMap>,
  gen = 1,
) {
  return createCapabilityGateway(
    handlers as CapabilityHandlerMap,
    facts,
    { debug: vi.fn() },
    gen,
  );
}

const readSessionInput = {
  session: {
    kind: "app",
    sourceServerId: "local",
    workspacePath: "/workspace",
    sessionId: SESSION_ID,
  },
  view: "summary",
} as const;

describe("extension capability gateway", () => {
  it("rejects a capability missing from the manifest declaration", async () => {
    const gateway = createGateway(createFacts({ grants: [] }).facts, {
      "sessions.readSession": vi.fn(),
    });

    await expect(
      gateway.call({
        pluginId: PLUGIN_ID,
        capabilityId: "sessions.readSession",
        input: readSessionInput,
      }),
    ).rejects.toMatchObject({ code: "not-declared" });
  });

  it("rejects a mismatched projection protocol", async () => {
    const gateway = createGateway(
      createFacts({ grants: ["sessions.read"], protocols: { sessions: 2 } }).facts,
      { "sessions.readSession": vi.fn() },
    );

    await expect(
      gateway.call({
        pluginId: PLUGIN_ID,
        capabilityId: "sessions.readSession",
        input: readSessionInput,
      }),
    ).rejects.toMatchObject({ code: "incompatible" });
  });

  it("rejects a declared but ungranted capability", async () => {
    const gateway = createGateway(createFacts({ granted: false }).facts, {
      "sessions.readSession": vi.fn(),
    });

    await expect(
      gateway.call({
        pluginId: PLUGIN_ID,
        capabilityId: "sessions.readSession",
        input: readSessionInput,
      }),
    ).rejects.toMatchObject({ code: "not-granted" });
  });

  it("passes plugin identity and extension generation to the handler", async () => {
    const handler = vi.fn(async () => null);
    const gateway = createGateway(
      createFacts({ grants: ["sessions.read"] }).facts,
      {
        "sessions.readSession": handler as unknown as CapabilityHandlerMap["sessions.readSession"],
      },
      7,
    );

    await expect(
      gateway.call({
        pluginId: PLUGIN_ID,
        capabilityId: "sessions.readSession",
        input: readSessionInput,
      }),
    ).resolves.toBeNull();
    expect(handler).toHaveBeenCalledWith(readSessionInput, { pluginId: PLUGIN_ID, gen: 7 });
  });

  it("validates capability input before dispatch", async () => {
    const gateway = createGateway(createFacts().facts, {
      "sessions.readSession": vi.fn(),
    });

    await expect(
      gateway.call({
        pluginId: PLUGIN_ID,
        capabilityId: "sessions.readSession",
        input: { session: { sessionId: "not-a-session" }, view: "summary" },
      }),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("ends an open subscription when the grant is revoked", () => {
    const facts = createFacts();
    const gateway = createGateway(facts.facts, {
      "sessions.onDidChangeConversation": () => () => ({ dispose: vi.fn() }),
    });
    const messages: unknown[] = [];
    const subscription = gateway.onDynamicSubscribe({
      pluginId: PLUGIN_ID,
      capabilityId: "sessions.onDidChangeConversation",
      input: { sessionId: SESSION_ID },
    })((message) => messages.push(message));

    facts.revoke();

    expect(messages).toEqual([
      {
        kind: "error",
        code: "not-granted",
        message: expect.stringContaining("sessions.onDidChangeConversation"),
      },
    ]);
    subscription.dispose();
  });

  it("maps backend failures to a stable internal error instead of leaking text", () => {
    const gateway = createGateway(createFacts().facts, {
      "sessions.onDidChangeConversation": () => () => {
        throw new Error("secret path /home/user");
      },
    });
    const messages: unknown[] = [];
    gateway.onDynamicSubscribe({
      pluginId: PLUGIN_ID,
      capabilityId: "sessions.onDidChangeConversation",
      input: { sessionId: SESSION_ID },
    })((message) => messages.push(message));

    expect(messages).toEqual([
      {
        kind: "error",
        code: "internal",
        message: "sessions.onDidChangeConversation failed",
      },
    ]);
  });
});
