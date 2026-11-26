import { expect, it } from "vitest";
import {
  createInputPreemptionAbortReason,
  isInputPreemptionAbortReason,
  type ToolExecutionContext,
} from "@zcode/contracts";
import { ToolDeadline, createInputPreemptionSlot, executeWithTimeout } from "../src/tool/executor/timeout.js";
import type { ToolEntry } from "../src/tool/types.js";

const entry = {
  metadata: {
    name: "Probe",
    description: "",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: async () => undefined,
  inputSchema: {},
  outputSchema: {},
  runtimeInputSchema: {} as never,
  runtimeOutputSchema: {} as never,
  cancellation: { supported: true, cleanup: "none", userVisibleMessage: "cancelled" },
} as unknown as ToolEntry;

it("defaults to cancel and lets the registered decision win", () => {
  const slot = createInputPreemptionSlot();
  expect(slot.decide()).toBe("cancel");
  slot.register(() => "wait");
  expect(slot.decide()).toBe("wait");
  slot.register(() => "cancel");
  expect(slot.decide()).toBe("cancel");
});

it("waits for the handler when preemption decides wait", async () => {
  const controller = new AbortController();
  const slot = createInputPreemptionSlot();
  slot.register(() => "wait");
  const context = { abortSignal: controller.signal } as ToolExecutionContext;
  const promise = executeWithTimeout(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "done";
    },
    undefined,
    context,
    new ToolDeadline(1_000),
    controller,
    entry,
    slot,
  );
  controller.abort(createInputPreemptionAbortReason("preempt"));
  await expect(promise).resolves.toBe("done");
});

it("cancels the handler without a wait decision", async () => {
  const controller = new AbortController();
  const context = { abortSignal: controller.signal } as ToolExecutionContext;
  const promise = executeWithTimeout(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "done";
    },
    undefined,
    context,
    new ToolDeadline(1_000),
    controller,
    entry,
  );
  controller.abort(createInputPreemptionAbortReason("preempt"));
  await expect(promise).rejects.toMatchObject({ type: expect.any(String) });
});

it("recognizes the preemption abort reason", () => {
  expect(isInputPreemptionAbortReason(createInputPreemptionAbortReason("x"))).toBe(true);
  expect(isInputPreemptionAbortReason(new Error("x"))).toBe(false);
});
