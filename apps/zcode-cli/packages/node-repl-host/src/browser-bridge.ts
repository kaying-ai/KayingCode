import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import type { BrowserClientTransport } from "@zcode/core/browser-client";
import type { NodeReplRequestMeta, NodeReplSession } from "@zcode/core/repl";
import type { BrowserCommand, BrowserCommandResult } from "@zcode/shared";
// 只加载 broker 协议；shared 总入口会在每个 Worker 中初始化无关领域的 schema。
import {
  NODE_REPL_BROWSER_BROKER_SOCKET_ENV,
  NODE_REPL_BROWSER_BROKER_TOKEN_ENV,
  nodeReplBrowserBrokerResponseSchema,
} from "@zcode/shared/node-repl-browser-broker";
import { NODE_REPL_BROWSER_BRIDGE_SYMBOL } from "./runtime-bridge.js";

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
type BrokerResponse = ReturnType<typeof nodeReplBrowserBrokerResponseSchema.parse>;
type SuccessfulBrokerResponse = Extract<BrokerResponse, { ok: true }>;

export interface ActiveNodeReplCall {
  generation: number;
  requestMeta: NodeReplRequestMeta;
  signal: AbortSignal;
}

/** Worker 连主线程浏览器代理 broker 用的地址和本次调用的 token（由主线程账本签发）。 */
export interface NodeReplBrowserBrokerConnection {
  socketPath: string;
  token: string;
}

interface BrowserBrokerRequestContext {
  runtimeScope: "main" | "subagent";
  sessionId: string;
  turnId?: string;
  trace?: { traceId: string; spanId?: string; parentSpanId?: string };
}

function brokerFromEnvironment(): NodeReplBrowserBrokerConnection | undefined {
  const socketPath = process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV]?.trim();
  const token = process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV]?.trim();
  return socketPath && token ? { socketPath, token } : undefined;
}

/**
 * 浏览器 broker 的会话信息必须来自 core 写入的 request-context。
 * 缺 session_id 时直接拒绝，避免把调用记到另一个会话或让对端返回难以诊断的 schema 错误。
 */
function browserRequestContext(meta: NodeReplRequestMeta): BrowserBrokerRequestContext {
  const sessionId = stringMeta(meta, "session_id");
  if (!sessionId) throw new Error("node_repl browser request is missing session_id metadata");
  const turnId = stringMeta(meta, "turn_id");
  const traceId = stringMeta(meta, "trace_id");
  const spanId = stringMeta(meta, "span_id");
  const parentSpanId = stringMeta(meta, "parent_span_id");
  return {
    runtimeScope: meta.runtime_scope === "subagent" ? "subagent" : "main",
    sessionId,
    ...(turnId ? { turnId } : {}),
    ...(traceId
      ? {
          trace: {
            traceId,
            ...(spanId ? { spanId } : {}),
            ...(parentSpanId ? { parentSpanId } : {}),
          },
        }
      : {}),
  };
}

function stringMeta(meta: NodeReplRequestMeta, key: string): string | undefined {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// 修复原因（MR !3207 评审 CR-01）：bridge 原来在 Worker 里自报会话信息；现在会话字段只从 core
// 写入的 request-context 派生，broker 地址和 token 只来自宿主注入的 MCP 子进程环境。
// 本产品已退役旧 CUA 调用账本，不恢复依赖 CUA 类型的主线程代理。
export function createBrowserBridgeGlobals(input: {
  broker?: NodeReplBrowserBrokerConnection;
  documentationRoot: string;
  generation: number;
  getActiveCall: () => ActiveNodeReplCall | undefined;
  session: () => NodeReplSession;
}): Record<PropertyKey, unknown> {
  const assertActive = (): ActiveNodeReplCall => {
    const active = input.getActiveCall();
    if (!active || active.generation !== input.generation) {
      throw new Error("Browser runtime binding is stale after kernel reset");
    }
    return active;
  };
  const transport: BrowserClientTransport = {
    list: async () => {
      const active = assertActive();
      const response = await sendBrokerRequest(
        input.broker,
        browserRequestContext(active.requestMeta),
        { op: "list" },
        active.signal,
      );
      assertActive();
      return response.browsers ?? [];
    },
    execute: async (browserId, browserGeneration, command) => {
      const active = assertActive();
      const response = await sendBrokerRequest(
        input.broker,
        browserRequestContext(active.requestMeta),
        { op: "execute", browserId, browserGeneration, command },
        active.signal,
      );
      assertActive();
      if (!response.result) throw new Error("Browser broker returned no command result");
      mergeBrowserResponseMeta(input.session(), command, response.result);
      return response.result;
    },
  };
  return {
    [NODE_REPL_BROWSER_BRIDGE_SYMBOL]: {
      ...transport,
      documentationRoot: input.documentationRoot,
      assertAvailable: assertActive,
    },
  };
}

async function sendBrokerRequest(
  configuredBroker: NodeReplBrowserBrokerConnection | undefined,
  context: BrowserBrokerRequestContext,
  request:
    | { op: "list" }
    | {
        op: "execute";
        browserId: string;
        browserGeneration: number;
        command: BrowserCommand;
      },
  signal: AbortSignal,
): Promise<SuccessfulBrokerResponse> {
  // 宿主进程通过 node_repl MCP 子进程的环境变量下发 broker；显式 connection 仅用于
  // 同进程嵌入/测试。两者都没有时保持原错误文案，skill 才能稳定命中不可用分支。
  const broker = configuredBroker ?? brokerFromEnvironment();
  if (!broker) {
    throw new Error("Browser control is unavailable for this node_repl session");
  }
  const { socketPath, token } = broker;
  const id = randomUUID();
  return await new Promise<SuccessfulBrokerResponse>((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const socket = createConnection(socketPath);
    const finish = (error?: unknown, value?: SuccessfulBrokerResponse) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      socket.destroy();
      if (error) reject(error);
      else if (value) resolve(value);
      else reject(new Error("Browser broker returned no response"));
    };
    const onAbort = () => finish(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => {
      // 会话字段由 request-context 元数据生成；broker schema 要求 runtimeScope/sessionId，
      // 缺 session 的调用应在发请求前失败，不能连上后由对端返回泛化 schema 错误。
      socket.write(`${JSON.stringify({ id, token, ...context, ...request })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (Buffer.byteLength(buffer) > MAX_RESPONSE_BYTES) {
        finish(new Error("Browser broker response exceeded the 32 MiB limit"));
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(buffer.slice(0, newline)) as unknown;
        const parsed = nodeReplBrowserBrokerResponseSchema.parse(response);
        if (parsed.id !== id) throw new Error("Browser broker response id mismatch");
        if (!parsed.ok) throw new Error(parsed.error);
        finish(undefined, parsed);
      } catch (error) {
        finish(error);
      }
    });
    socket.once("error", finish);
    socket.once("close", () => {
      if (!settled) finish(new Error("Browser broker closed before returning a response"));
    });
    if (signal.aborted) onAbort();
  });
}

function mergeBrowserResponseMeta(
  session: NodeReplSession,
  command: BrowserCommand,
  result: BrowserCommandResult,
): void {
  const meta = result.meta;
  // 显式 screenshot 的原始图片要进入本次 run 的 browserScreenshots，result.ts 才能把
  // emitImage 输出标记为浏览器截图（core 按 mimeType + 字节匹配下标）。
  if (result.ok && result.image) session.recordBrowserScreenshot(result.image);
  if (!meta) return;
  const finalized = result.ok && command.method === "finalizeTabs";
  const includeOpenTabs = result.ok && isBrowserSurfaceSideEffect(command);
  session.mergeResponseMeta({
    "kayingcode/browserUse": true,
    "kayingcode/toolSurface": {
      kind: "browserUse",
      backend: meta.backendType,
      browserId: meta.browserId,
      ...(includeOpenTabs || finalized ? { openTabIds: meta.openTabIds } : {}),
      ...(finalized ? { sessionEnded: true } : {}),
    },
    browser_use: meta.currentUrl ? { url: meta.currentUrl } : {},
    ...(result.ok && meta.tabId && isAutoScreenshotTriggerCommand(command)
      ? {
          "kayingcode/browserTurnScreenshot": {
            browserGeneration: meta.browserGeneration,
            browserId: meta.browserId,
            tabId: meta.tabId,
          },
        }
      : {}),
  });
}

function isAutoScreenshotTriggerCommand(command: BrowserCommand): boolean {
  if (
    command.method === "capabilities" ||
    command.method === "list" ||
    command.method === "listUserTabs" ||
    command.method === "browserVisibilityGet"
  ) {
    return false;
  }
  return !["cancelRequest", "closeSession", "finalizeTabs", "nameSession", "turnEnded"].includes(
    command.method,
  );
}

function isBrowserSurfaceSideEffect(command: BrowserCommand): boolean {
  if (command.method === "playwright" && command.action.name === "locator") {
    return [
      "click",
      "dblclick",
      "downloadMedia",
      "fill",
      "press",
      "selectOption",
      "setChecked",
    ].includes(command.action.operation);
  }
  return [
    "navigate",
    "back",
    "forward",
    "reload",
    "click",
    "fill",
    "type",
    "press",
    "scroll",
    "hover",
    "select",
    "check",
    "drag",
    "handleDialog",
    "close",
  ].includes(command.method);
}
