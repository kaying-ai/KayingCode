/** Minimal newline-delimited JSON-RPC client for the bundled Maker MCP server. */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { KayingForTaptapOperationLogger } from "../operations/logging";
import { getKayingForTaptapVersion } from "../version";
import { createMakerEnvironmentForTarget, resolveMakerBundle } from "./launcher";
import { getNodeCommand, type MakerEnvironment } from "./paths";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export interface MakerMcpProgress {
  message?: string;
  progress?: number;
  total?: number;
}

export interface MakerMcpCallResult {
  command: string[];
  value: unknown;
  progress: MakerMcpProgress[];
  stderr: string;
}

export interface MakerMcpCallInput {
  cwd: string;
  name: string;
  arguments: Record<string, unknown>;
  timeoutMs: number;
  logger?: Pick<KayingForTaptapOperationLogger, "info" | "error">;
  onProgress?: (progress: MakerMcpProgress) => void;
  command?: string[];
  env?: NodeJS.ProcessEnv;
  makerEnvironment?: MakerEnvironment;
  signal?: AbortSignal;
}

export async function callMakerMcpTool(input: MakerMcpCallInput): Promise<MakerMcpCallResult> {
  const makerBundlePath = resolveMakerBundle("maker");
  const command = input.command ?? [getNodeCommand(), makerBundlePath];
  if (!command[0]) throw new Error("Maker MCP command is empty");
  if (!input.command) {
    try {
      await access(makerBundlePath);
    } catch {
      const error = new Error(`Bundled Maker runtime is missing: ${makerBundlePath}`);
      input.logger?.error("runtime_after", error.message, { makerBundlePath });
      throw error;
    }
  }
  return await new Promise((resolve, reject) => {
    input.logger?.info("runtime_before", "Starting bundled Maker operation", {
      command,
      cwd: input.cwd,
      operation: input.name,
      timeoutMs: input.timeoutMs,
    });
    const child = spawn(command[0], command.slice(1), {
      cwd: input.cwd,
      env: createMakerEnvironmentForTarget(input.makerEnvironment, input.env),
      signal: input.signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const progress: MakerMcpProgress[] = [];
    let settled = false;
    let nextId = 1;
    let initializeId = 0;
    let callId = 0;

    const timer = setTimeout(() => {
      settleReject(new Error(`Maker operation timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);

    function settleResolve(value: unknown): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      const output = { command, value, progress, stderr: summarize(stderr) };
      input.logger?.info("runtime_after", "Bundled Maker operation completed", output);
      resolve(output);
    }

    function settleReject(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      input.logger?.error("runtime_after", "Bundled Maker operation failed", {
        error: error.message,
        stderr: summarize(stderr),
      });
      reject(error);
    }

    function sendRequest(method: string, params: unknown): number {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return id;
    }

    function sendNotification(method: string, params: unknown): void {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    }

    function handleMessage(line: string): void {
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch (error) {
        settleReject(new Error(`Invalid Maker MCP message: ${String(error)}`));
        return;
      }
      if (message.method === "notifications/progress") {
        const item = readProgress(message.params);
        progress.push(item);
        input.onProgress?.(item);
        input.logger?.info("progress", item.message ?? "Maker progress", item);
        return;
      }
      if (message.error) {
        settleReject(new Error(message.error.message ?? `Maker MCP error ${message.error.code}`));
        return;
      }
      if (message.id === initializeId) {
        sendNotification("notifications/initialized", {});
        callId = sendRequest("tools/call", {
          name: input.name,
          arguments: input.arguments,
          _meta: { progressToken: `${input.name}-${Date.now()}` },
        });
        return;
      }
      if (message.id === callId) settleResolve(message.result);
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      let newlineIndex = stdout.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdout.slice(0, newlineIndex).trim();
        stdout = stdout.slice(newlineIndex + 1);
        if (line) handleMessage(line);
        newlineIndex = stdout.indexOf("\n");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => settleReject(error));
    child.on("close", (code) => {
      if (!settled) {
        settleReject(new Error(summarize(stderr) || `Maker MCP exited with code ${code}`));
      }
    });
    child.on("spawn", () => {
      initializeId = sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "kaying-for-taptap", version: getKayingForTaptapVersion() },
      });
    });
  });
}

function readProgress(value: unknown): MakerMcpProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    message: typeof record.message === "string" ? record.message : undefined,
    progress: typeof record.progress === "number" ? record.progress : undefined,
    total: typeof record.total === "number" ? record.total : undefined,
  };
}

function summarize(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 12_000 ? trimmed : `${trimmed.slice(0, 12_000)}\n...[truncated]`;
}
