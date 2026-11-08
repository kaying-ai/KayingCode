/** Consolidated discovery and execution entry point for native game commands. */

import {
  describeGameOperation,
  executeGameOperation,
  listGameOperations,
  prepareGameOperation,
} from "./kaying-for-taptap-cli";
import type { KayingForTaptapTool } from "./tool-types";

export const gameCommandTool: KayingForTaptapTool = {
  name: "kaying-for-taptap_game_command",
  description:
    "Search, describe, prepare, or execute TapTap game-development commands through one entry point. Mutating and remote commands retain prepared-effect confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["search", "describe", "prepare", "execute"] },
      projectRoot: { type: "string", description: "Absolute game project root." },
      operation: { type: "string", description: "Operation ID returned by action=search." },
      domain: { type: "string", description: "Optional command-domain filter for search." },
      query: { type: "string", description: "Optional text query for search." },
      limit: { type: "number", description: "Search result limit, maximum 250." },
      arguments: {
        type: "object",
        additionalProperties: true,
        description:
          "Operation arguments from describe.input_schema. project_root is injected automatically.",
      },
      timeoutMs: { type: "number" },
      planId: { type: "string", description: "Plan ID returned by action=prepare." },
      effectDigest: { type: "string", description: "Effect digest returned by action=prepare." },
      planExpiresAt: { type: "string", description: "Expiry returned by action=prepare." },
      confirmEffects: {
        type: "boolean",
        description: "Confirm the exact prepared effects when action=execute.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const value = input as {
      action: "search" | "describe" | "prepare" | "execute";
      projectRoot?: string;
      operation?: string;
      domain?: string;
      query?: string;
      limit?: number;
      arguments?: Record<string, unknown>;
      timeoutMs?: number;
      planId?: string;
      effectDigest?: string;
      planExpiresAt?: string;
      confirmEffects?: boolean;
    };
    if (!["search", "describe", "prepare", "execute"].includes(value.action)) {
      throw new Error("action must be search, describe, prepare, or execute");
    }
    if (value.action === "search") {
      assertString(value.projectRoot, "projectRoot");
      return await listGameOperations({
        ...(value as { projectRoot: string }),
        signal: context?.signal,
      });
    }
    assertString(value.projectRoot, "projectRoot");
    assertString(value.operation, "operation");
    const prepared = value.planId ? preparedArguments.get(value.planId) : undefined;
    if (
      prepared &&
      (prepared.projectRoot !== value.projectRoot || prepared.operation !== value.operation)
    ) {
      throw new Error(
        "Prepared command belongs to a different project or operation; prepare again",
      );
    }
    const commandInput = {
      projectRoot: value.projectRoot,
      operation: value.operation,
      arguments: prepared?.arguments ?? normalizeArguments(value.projectRoot, value.arguments),
      timeoutMs: value.timeoutMs,
      planId: value.planId,
      effectDigest: value.effectDigest,
      planExpiresAt: value.planExpiresAt,
      confirmEffects: value.confirmEffects,
      signal: context?.signal,
    };
    if (value.action === "describe") return await describeGameOperation(commandInput);
    if (value.action === "prepare") {
      const result = await prepareGameOperation(commandInput);
      const planId = readPlanId(result);
      if (planId)
        rememberArguments(planId, {
          projectRoot: value.projectRoot,
          operation: value.operation,
          arguments: structuredClone(commandInput.arguments),
        });
      return result;
    }
    try {
      return await executeGameOperation(commandInput);
    } finally {
      if (value.planId) preparedArguments.delete(value.planId);
    }
  },
};

interface PreparedArguments {
  projectRoot: string;
  operation: string;
  arguments: Record<string, unknown>;
}

const preparedArguments = new Map<string, PreparedArguments>();

function readPlanId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const plan = (value as { plan?: unknown }).plan;
  if (!plan || typeof plan !== "object") return null;
  const planId = (plan as { plan_id?: unknown }).plan_id;
  return typeof planId === "string" && planId ? planId : null;
}

function rememberArguments(planId: string, args: PreparedArguments): void {
  if (preparedArguments.size >= 100) {
    const oldest = preparedArguments.keys().next().value;
    if (typeof oldest === "string") preparedArguments.delete(oldest);
  }
  preparedArguments.set(planId, args);
}

function normalizeArguments(
  projectRoot: string,
  value?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...value, project_root: projectRoot };
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}
