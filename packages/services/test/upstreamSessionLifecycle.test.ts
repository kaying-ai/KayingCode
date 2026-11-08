import { expect, it, vi } from "vitest";
import { Emitter } from "@zcode/rpc";
import { createKayingCodeAgentConnectionScope } from "../src/kayingcode-agent/kayingcodeAgentConnectionScope.js";
import type { IKayingCodeAgentService } from "../src/kayingcode-agent/kayingcodeAgent.js";
import type { SessionLifecycleSnapshot } from "@zcode/shared";
it("forwards authoritative lifecycle and disposes the attachment event subscription", async () => {
  const events = new Emitter<SessionLifecycleSnapshot>();
  const base = {
    onDynamicSessionLifecycle: vi.fn(() => events.event),
    getSessionLifecycle: vi.fn(async () => null),
    ensureSessionReady: vi.fn(async () => {}),
    stopSessionRuntime: vi.fn(async () => {}),
    restartSessionRuntime: vi.fn(async () => {}),
  } as unknown as IKayingCodeAgentService;
  const scope = createKayingCodeAgentConnectionScope(base, {
    connectionId: "test-web",
    clientMode: "web-remote-replayable",
  });
  const target = { workspacePath: "/project", workspaceIdentity: "isolated", sessionId: "s" };
  await scope.service.getSessionLifecycle(target);
  expect(base.getSessionLifecycle).toHaveBeenCalledWith(target);
  const listener = vi.fn();
  scope.service.onDynamicSessionLifecycle(target)(listener);
  const snapshot = {
    sessionId: "s",
    state: "stopping",
    generation: 1,
  } as unknown as SessionLifecycleSnapshot;
  events.fire(snapshot);
  expect(listener).toHaveBeenCalledWith(snapshot);
  await scope.dispose();
  events.fire(snapshot);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(() => scope.service.onDynamicSessionLifecycle(target)(listener)).toThrow("closed");
});
