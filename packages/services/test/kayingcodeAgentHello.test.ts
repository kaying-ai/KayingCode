import { describe, expect, it, vi } from "vitest";
import { V4_WIRE_PROTOCOL_VERSION } from "@zcode/shared/kayingcode-protocol-v4";
import type { IKayingCodeAgentService } from "../src/kayingcode-agent/kayingcodeAgent.js";
import {
  createKayingCodeAgentConnectionScope,
  readTrustedKayingCodeAgentV4Connection,
} from "../src/kayingcode-agent/kayingcodeAgentConnectionScope.js";

function createBase(capture: (params: unknown) => void) {
  return {
    onAgentRuntimeLifecycle: undefined,
    onAgentRuntimeRestarted: undefined,
    sendConversationCommandV4: vi.fn(async (params: unknown) => {
      capture(params);
      return {} as never;
    }),
  } as unknown as IKayingCodeAgentService;
}

function clientHello(capabilities?: { workflowRunDeltas?: boolean; historyFirst?: boolean }) {
  return {
    kind: "clientHello" as const,
    protocolVersion: V4_WIRE_PROTOCOL_VERSION,
    clientId: "client-1",
    appVersion: "test",
    ...(capabilities ? { capabilities } : {}),
  };
}

function envelope() {
  return {
    clientId: "client-1",
    sessionId: "session-1",
    type: "sendText" as const,
    payload: { text: "hello" },
    issuedAt: Date.now(),
  };
}

describe("agent connection hello capabilities", () => {
  it("advertises the upstream web capabilities", async () => {
    const scope = createKayingCodeAgentConnectionScope(
      createBase(() => undefined),
      {
        connectionId: "conn-1",
        clientMode: "web-remote-replayable",
      },
    );
    const hello = await scope.service.helloConversationV4();
    expect(hello.capabilities).toMatchObject({
      genUiContext: true,
      workflowRunDeltas: true,
      historyFirst: true,
    });
    await scope.dispose();
  });

  it("forwards clientHello incremental flags through the trusted connection", async () => {
    let captured: unknown;
    const scope = createKayingCodeAgentConnectionScope(
      createBase((params) => (captured = params)),
      {
        connectionId: "conn-2",
        clientMode: "web-remote-replayable",
      },
    );
    await scope.service.helloConversationV4();
    await scope.service.initializeConversationV4(
      clientHello({ workflowRunDeltas: true, historyFirst: true }),
    );
    await scope.service.sendConversationCommandV4({ envelope: envelope() } as never);

    expect(readTrustedKayingCodeAgentV4Connection(captured)).toMatchObject({
      connectionId: "conn-2",
      clientMode: "web-remote-replayable",
      workflowRunDeltas: true,
      historyFirst: true,
    });
    await scope.dispose();
  });

  it("does not invent flags the client did not declare", async () => {
    let captured: unknown;
    const scope = createKayingCodeAgentConnectionScope(
      createBase((params) => (captured = params)),
      {
        connectionId: "conn-3",
        clientMode: "web-remote-replayable",
      },
    );
    await scope.service.helloConversationV4();
    await scope.service.initializeConversationV4(clientHello());
    await scope.service.sendConversationCommandV4({ envelope: envelope() } as never);

    const trusted = readTrustedKayingCodeAgentV4Connection(captured);
    expect(trusted?.workflowRunDeltas).toBeUndefined();
    expect(trusted?.historyFirst).toBeUndefined();
    await scope.dispose();
  });
});
