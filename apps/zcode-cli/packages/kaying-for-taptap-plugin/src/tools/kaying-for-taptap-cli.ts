/** Process bridge from bundled KayingForTaptap Agent tools to the unified kaying-for-taptap-core binary. */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rankDiscovery } from "./command-discovery";
import { createPluginChildEnvironment, getNodeCommand } from "../maker/paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GameOperationSpec {
  id: string;
  domain: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  effects: string[];
  stability: string;
  idempotent: boolean;
  requires_runtime: boolean;
  implementation_tier?: "runtime_backed" | "project_backed" | "scaffold_only";
  verified_on?: string[];
  known_limitations?: string[];
  success_criteria?: string[];
  evidence_capabilities?: string[];
  fallback_reason?: string | null;
}

interface CliEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: { code: string; message: string; hint?: string } | null;
}

interface OperationList {
  provider: string;
  operations: GameOperationSpec[];
}

export interface KayingForTaptapCommandInput {
  projectRoot: string;
  operation: string;
  arguments?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ConfirmedKayingForTaptapCommandInput extends KayingForTaptapCommandInput {
  planId?: string;
  effectDigest?: string;
  planExpiresAt?: string;
  confirmEffects?: boolean;
}

export interface PreparedGameOperation {
  confirmation_required: boolean;
  plan: {
    plan_id: string;
    effect_digest: string;
    expires_at: string;
  };
}

export interface ExecutedGameOperation {
  kind: "result";
  data: {
    success: boolean;
    output: unknown;
  };
}

export async function listGameOperations(input: {
  projectRoot: string;
  domain?: string;
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<OperationList & { total: number; filtered: number }> {
  const result = await runKayingForTaptapCli<OperationList>(
    ["list", "operations", "taptap", input.projectRoot],
    undefined,
    input.signal,
  );
  const candidates = result.operations.filter((operation) => {
    if (input.domain && operation.domain !== input.domain) return false;
    return true;
  });
  const ranked = rankDiscovery(candidates, input.query, (operation) => ({
    id: operation.id,
    domain: operation.domain,
    description: operation.description,
  }));
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 250);
  return {
    ...result,
    operations: ranked.slice(0, limit),
    total: result.operations.length,
    filtered: ranked.length,
  };
}

export async function describeGameOperation(input: KayingForTaptapCommandInput): Promise<unknown> {
  await ensureCanonicalKayingForTaptapCli(input.projectRoot, input.signal);
  return await runKayingForTaptapCli(commandArgs("describe", input), undefined, input.signal);
}

export async function prepareGameOperation(input: KayingForTaptapCommandInput): Promise<unknown> {
  await ensureCanonicalKayingForTaptapCli(input.projectRoot, input.signal);
  return await runKayingForTaptapCli(commandArgs("prepare", input), undefined, input.signal);
}

export async function executeGameOperation(
  input: ConfirmedKayingForTaptapCommandInput,
): Promise<unknown> {
  await ensureCanonicalKayingForTaptapCli(input.projectRoot, input.signal);
  const args = commandArgs("execute", input);
  if (input.planId) args.push("--plan-id", input.planId);
  if (input.effectDigest) args.push("--effect-digest", input.effectDigest);
  if (input.planExpiresAt) args.push("--plan-expires-at", input.planExpiresAt);
  if (input.confirmEffects) args.push("--confirm-effects");
  return await runKayingForTaptapCli(args, undefined, input.signal);
}

/** Prepare and apply one operation while preserving the CLI effect-confirmation contract. */
export async function applyGameOperation(input: KayingForTaptapCommandInput): Promise<{
  prepared: PreparedGameOperation;
  result: ExecutedGameOperation;
}> {
  const prepared = (await prepareGameOperation(input)) as PreparedGameOperation;
  const result = (await executeGameOperation({
    ...input,
    ...(prepared.confirmation_required
      ? {
          planId: prepared.plan.plan_id,
          effectDigest: prepared.plan.effect_digest,
          planExpiresAt: prepared.plan.expires_at,
          confirmEffects: true,
        }
      : {}),
  })) as ExecutedGameOperation;
  return { prepared, result };
}

/**
 * Refactor semantics are part of the CLI contract, not just Agent guidance.
 * Reject an installed/stale binary that does not expose the canonical
 * refactor operation instead of silently letting the Agent use a different
 * implementation.
 */
async function ensureCanonicalKayingForTaptapCli(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await runKayingForTaptapCli<OperationList>(
    ["list", "operations", "taptap", projectRoot],
    undefined,
    signal,
  );
  const operationIds = new Set(result.operations.map((operation) => operation.id));
  if (!operationIds.has("project.refactor_to_modular")) {
    throw new Error(
      "kaying-for-taptap-core is stale: project.refactor_to_modular is unavailable. Rebuild and sync the KayingForTaptap core binary before starting a refactor.",
    );
  }
}

function commandArgs(
  action: "describe" | "prepare" | "execute",
  input: KayingForTaptapCommandInput,
) {
  const args = [
    "command",
    action,
    input.operation,
    "--path",
    input.projectRoot,
    "--engine",
    "taptap",
  ];
  if (action !== "describe") {
    args.push("--arguments", JSON.stringify(input.arguments ?? {}));
    if (input.timeoutMs !== undefined) args.push("--timeout-ms", String(input.timeoutMs));
  }
  return args;
}

export async function runKayingForTaptapCli<T>(
  args: string[],
  cwd?: string,
  signal?: AbortSignal,
): Promise<T> {
  const command = await resolveKayingForTaptapCli();
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: createPluginChildEnvironment({
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        KAYING_FOR_TAPTAP_NODE: getNodeCommand(),
        KAYING_FOR_TAPTAP_PACKAGE_ROOT:
          process.env.KAYINGCODE_PLUGIN_ROOT ?? path.resolve(__dirname, "..", ".."),
      }),
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const envelope = JSON.parse(stdout.trim()) as CliEnvelope<T>;
        if (!envelope.ok || envelope.data === null) {
          const error = envelope.error;
          reject(
            new Error(
              `[${error?.code ?? "KAYING_FOR_TAPTAP_CLI_ERROR"}] ${error?.message ?? stderr}`,
            ),
          );
          return;
        }
        resolve(envelope.data);
      } catch (error) {
        const detail =
          stderr.trim() || stdout.trim() || `kaying-for-taptap-core exited with code ${code}`;
        reject(error instanceof SyntaxError ? new Error(detail) : error);
      }
    });
  });
}

async function resolveKayingForTaptapCli(): Promise<string> {
  if (process.env.KAYING_FOR_TAPTAP_CORE) return process.env.KAYING_FOR_TAPTAP_CORE;
  const name =
    process.platform === "win32" ? "kaying-for-taptap-core.exe" : "kaying-for-taptap-core";
  const pluginRoot = process.env.KAYINGCODE_PLUGIN_ROOT ?? path.resolve(__dirname, "..", "..");
  const platformArch = `${process.platform}-${process.arch}`;
  const candidates = [
    path.join(pluginRoot, "bin", platformArch, name),
    path.join(pluginRoot, "native", "core", "target", "release", name),
    path.join(pluginRoot, "native", "core", "target", "debug", name),
  ];
  const availability = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await access(candidate);
        return candidate;
      } catch {
        return null;
      }
    }),
  );
  const resolved = availability.find((candidate): candidate is string => candidate !== null);
  if (resolved) return resolved;
  throw new Error(
    `kaying-for-taptap-core binary not found for ${platformArch}. Rebuild the official plugin native artifact.`,
  );
}
