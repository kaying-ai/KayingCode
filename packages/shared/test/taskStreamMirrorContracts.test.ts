import assert from "node:assert/strict";
import { test } from "vitest";
import { taskStreamMirrorPublishOpSchema } from "../src/task-realtime-core.js";
import type { TaskStreamMirrorableEvent } from "../src/kayingcode-task-types-core.js";

const validPayloads = {
  agent_message_chunk: { type: "agent_message_chunk", content: "hi" },
  agent_thought_chunk: { type: "agent_thought_chunk", content: "thinking" },
  tool_call: { type: "tool_call", toolId: "tool", kind: "test", title: "Test", input: {}, raw: {} },
  tool_call_update: { type: "tool_call_update", toolId: "tool", status: "completed", raw: {} },
  plan: { type: "plan", steps: [{ id: "step", title: "Step", status: "pending" }] },
  permission_request: {
    type: "permission_request",
    requestId: "p",
    description: "request",
    kind: "tool",
    options: [{ optionId: "allow", kind: "allow", name: "Allow", response: { decision: "allow" } }],
    raw: {},
  },
  permission_response: {
    type: "permission_response",
    requestId: "p",
    optionId: "allow",
    response: { decision: "allow" },
  },
  elicitation_request: {
    type: "elicitation_request",
    requestId: "e",
    message: "question",
    options: [{ value: "yes", label: "Yes" }],
  },
  elicitation_response: { type: "elicitation_response", requestId: "e", action: "accept" },
  task_complete: { type: "task_complete", stopReason: "end_turn" },
  task_run_started: { type: "task_run_started", startedAt: 1 },
  task_warning: { type: "task_warning", warning: "warning" },
  task_error: { type: "task_error", error: "error" },
  config_option_update: {
    type: "config_option_update",
    configOptions: [{ id: "option", name: "Option", type: "boolean", currentValue: true }],
  },
  available_commands_update: {
    type: "available_commands_update",
    commands: [{ name: "command", description: "Command" }],
  },
  mode_update: {
    type: "mode_update",
    currentModeId: "build",
    availableModes: [{ id: "build", name: "Build" }],
  },
  session_info_update: { type: "session_info_update", title: "Title", target: null },
  goal_verification_update: {
    type: "goal_verification_update",
    verification: { passed: true, reason: "done" },
  },
  task_token_usage_delta: {
    type: "task_token_usage_delta",
    eventKey: "usage",
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
  task_network_debug_status: {
    type: "task_network_debug_status",
    eventKey: "network",
    statusType: "model_request_started",
    requestHeaders: {},
    responseHeaders: {},
    requestHeaderCount: 0,
    responseHeaderCount: 0,
  },
  usage_update: { type: "usage_update", size: 100, used: 10 },
  background_bash_jobs_update: {
    type: "background_bash_jobs_update",
    jobs: [{ jobId: "job", command: "echo test", taskKind: "bash", status: "running" }],
  },
  glm_agent_model_state_update: {
    type: "glm_agent_model_state_update",
    version: 1,
    sessionId: "session",
    reason: "model_changed",
    model: { currentValue: "test" },
    thoughtLevel: { enabled: false, options: [] },
    contextWindow: { tokens: 100 },
  },
  goal_iteration_started: { type: "goal_iteration_started", startedAt: 1 },
  turn_steer_queued: {
    type: "turn_steer_queued",
    pendingInputId: "input",
    source: "workflow_refine_feedback",
    content: "continue",
  },
  turn_steer_status: { type: "turn_steer_status", status: "drained" },
} satisfies {
  [K in TaskStreamMirrorableEvent["type"]]: Omit<
    Extract<TaskStreamMirrorableEvent, { type: K }>,
    "taskId" | "traceId"
  >;
};

test("all current Host mirror event variants retain payload and extension metadata", () => {
  for (const payload of Object.values(validPayloads)) {
    const event = { ...payload, taskId: "task", traceId: "trace", futureField: { value: 1 } };
    const op = taskStreamMirrorPublishOpSchema.parse({ kind: "stream_event", event });
    assert.equal(op.kind, "stream_event");
    if (op.kind === "stream_event") assert.deepEqual(op.event, event);
  }
});

test("mirror transport rejects malformed text before batching and preserves extension metadata", () => {
  const base = { type: "agent_message_chunk", taskId: "task", traceId: "trace" };
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({ kind: "stream_event", event: base }).success,
    false,
  );
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({
      kind: "stream_event",
      event: { ...base, content: 42 },
    }).success,
    false,
  );
  const event = { ...base, content: "", parentToolUseId: null, futureField: { example: true } };
  const op = taskStreamMirrorPublishOpSchema.parse({ kind: "stream_event", event });
  assert.equal(op.kind, "stream_event");
  if (op.kind === "stream_event") assert.deepEqual(op.event, event);
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({
      kind: "stream_event",
      event: { ...base, type: "unsupported_future_event", content: "text" },
    }).success,
    false,
  );
});

test("mirror transport validates terminal and permission payloads", () => {
  const base = { taskId: "task", traceId: "trace" };
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({
      kind: "stream_event",
      event: { ...base, type: "task_complete" },
    }).success,
    false,
  );
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({
      kind: "stream_event",
      event: { ...base, type: "task_complete", stopReason: "end_turn" },
    }).success,
    true,
  );
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({
      kind: "stream_event",
      event: {
        ...base,
        type: "permission_response",
        requestId: "p",
        optionId: "allow",
        response: { decision: "allow" },
      },
    }).success,
    true,
  );
  assert.equal(
    taskStreamMirrorPublishOpSchema.safeParse({
      kind: "stream_event",
      event: {
        ...base,
        type: "permission_response",
        requestId: "p",
        optionId: "allow",
        response: { decision: "unknown" },
      },
    }).success,
    false,
  );
});
