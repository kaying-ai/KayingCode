import { z } from "zod";
import type { TaskStreamMirrorableEvent } from "./kayingcode-task-types-core.js";
import { kayingcodePermissionResponseSchema } from "./kayingcode-protocol-legacy-types.js";

const text = z.string();
const numeric = z.number().finite();
const fields = {
  taskId: text.trim().min(1),
  traceId: text.trim().min(1),
  inputId: text.optional(),
};
const usage = z
  .object({ inputTokens: numeric, outputTokens: numeric, totalTokens: numeric })
  .passthrough();
const planStep = z
  .object({ id: text, title: text, status: z.enum(["pending", "in_progress", "completed"]) })
  .passthrough();
const permissionOption = z
  .object({ optionId: text, kind: text, name: text, response: kayingcodePermissionResponseSchema })
  .passthrough();

// 原 mirror schema 只校验信封，缺失 content 的 chunk 会在 Main 分批时访问 .length。
// 按现行已知事件验证必需业务字段；passthrough 保留上游可选元数据与扩展字段。
export const taskStreamMirrorableEventSchema: z.ZodType<TaskStreamMirrorableEvent> =
  z.discriminatedUnion("type", [
    z.object({ ...fields, type: z.literal("agent_message_chunk"), content: text }).passthrough(),
    z.object({ ...fields, type: z.literal("agent_thought_chunk"), content: text }).passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("tool_call"),
        toolId: text,
        input: z.unknown(),
        kind: text,
        title: text,
        raw: z.unknown(),
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("tool_call_update"),
        toolId: text,
        status: z.enum(["pending", "in_progress", "completed", "failed", "denied", "stopped"]),
        raw: z.unknown(),
      })
      .passthrough(),
    z.object({ ...fields, type: z.literal("plan"), steps: z.array(planStep) }).passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("permission_request"),
        requestId: text,
        description: text,
        kind: text,
        options: z.array(permissionOption),
        raw: z.unknown(),
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("permission_response"),
        requestId: text,
        optionId: text,
        response: kayingcodePermissionResponseSchema,
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("elicitation_request"),
        requestId: text,
        message: text,
        options: z.array(z.object({ value: text, label: text }).passthrough()),
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("elicitation_response"),
        requestId: text,
        action: z.enum(["accept", "decline", "cancel"]),
      })
      .passthrough(),
    z.object({ ...fields, type: z.literal("task_complete"), stopReason: text }).passthrough(),
    z.object({ ...fields, type: z.literal("task_run_started"), startedAt: numeric }).passthrough(),
    z.object({ ...fields, type: z.literal("task_warning"), warning: text }).passthrough(),
    z.object({ ...fields, type: z.literal("task_error"), error: text }).passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("config_option_update"),
        configOptions: z.array(
          z
            .object({
              id: text,
              name: text,
              type: z.enum(["select", "boolean"]),
              currentValue: z.union([text, z.boolean()]),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("available_commands_update"),
        commands: z.array(z.object({ name: text, description: text }).passthrough()),
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("mode_update"),
        currentModeId: text,
        availableModes: z.array(z.object({ id: text, name: text }).passthrough()),
      })
      .passthrough(),
    z.object({ ...fields, type: z.literal("session_info_update") }).passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("glm_agent_model_state_update"),
        version: z.literal(1),
        sessionId: text,
        reason: z.enum(["session_initialized", "model_changed", "thought_level_changed"]),
        model: z.object({ currentValue: text }).passthrough(),
        thoughtLevel: z
          .object({
            enabled: z.boolean(),
            options: z.array(z.object({ value: text, name: text }).passthrough()),
          })
          .passthrough(),
        contextWindow: z.object({ tokens: numeric }).passthrough(),
      })
      .passthrough(),
    z
      .object({ ...fields, type: z.literal("goal_iteration_started"), startedAt: numeric })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("turn_steer_queued"),
        pendingInputId: text,
        source: z.enum(["plan_approval_feedback", "workflow_refine_feedback"]),
        content: text,
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("turn_steer_status"),
        status: z.enum(["drained", "discarded", "rejected"]),
      })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("goal_verification_update"),
        verification: z.object({ passed: z.boolean(), reason: text }).passthrough(),
      })
      .passthrough(),
    z
      .object({ ...fields, type: z.literal("task_token_usage_delta"), eventKey: text, usage })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("task_network_debug_status"),
        eventKey: text,
        statusType: z.enum([
          "model_request_started",
          "model_request_completed",
          "model_request_failed",
          "model_retry_scheduled",
          "model_stream_stalled",
        ]),
        requestHeaders: z.record(text, text),
        responseHeaders: z.record(text, text),
        requestHeaderCount: numeric,
        responseHeaderCount: numeric,
      })
      .passthrough(),
    z
      .object({ ...fields, type: z.literal("usage_update"), size: numeric, used: numeric })
      .passthrough(),
    z
      .object({
        ...fields,
        type: z.literal("background_bash_jobs_update"),
        jobs: z.array(
          z
            .object({
              jobId: text,
              command: text,
              taskKind: z.enum(["agent", "bash"]),
              status: z.enum(["pending", "running", "completed", "failed", "killed", "lost"]),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  ]);
