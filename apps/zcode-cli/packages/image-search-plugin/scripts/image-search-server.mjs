#!/usr/bin/env node
/**
 * image-search 插件的本地 stdio MCP server（零依赖，Node >= 18）。
 *
 * 数据源：Openverse 公开 API（https://api.openverse.org/v1/images/，开放接口，匿名可用），
 * 返回可自由使用的图片及其许可信息；本插件不代理、不缓存任何图片内容。
 *
 * 协议：MCP stdio 传输——每行一个 JSON-RPC 2.0 消息；实现 initialize / ping /
 * tools/list / tools/call 四个方法即可被宿主装配。任何未捕获异常都不能杀掉进程，
 * 否则宿主会把整个 server 标记为 failed 并影响同会话其他插件。
 */
import { createInterface } from "node:readline";

const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";
const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 20;

const TOOL_DEFINITIONS = [
  {
    name: "search_images",
    description:
      "Search openly licensed images (Openverse) for illustrations and reference pictures. " +
      "Returns direct image URLs with license, dimensions and source page. Use before placing " +
      "any stock/illustrative image into a deliverable, and keep the license attribution in the final output.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords, e.g. 'mountain sunrise landscape'." },
        count: {
          type: "integer",
          minimum: 1,
          maximum: MAX_PAGE_SIZE,
          description: `Number of results to return (1-${MAX_PAGE_SIZE}, default ${DEFAULT_PAGE_SIZE}).`,
        },
        license_type: {
          type: "string",
          enum: ["all", "commercial", "modification"],
          description:
            "Restrict to licenses suitable for commercial use (commercial) or commercial use with modification (modification). Default all.",
        },
        extension: {
          type: "string",
          enum: ["jpg", "png", "svg"],
          description: "Filter by image file extension. Optional.",
        },
      },
      required: ["query"],
    },
  },
];

function logError(message) {
  // stderr 是 MCP stdio 的日志通道，绝不污染 stdout 的协议流。
  process.stderr.write(`[image-search] ${message}\n`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "kayingcode-image-search-plugin/0.1.1" },
    });
  } finally {
    clearTimeout(timer);
  }
}

function pickNumber(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function normalizeLicenseType(value) {
  if (value === "commercial" || value === "modification") return value;
  return undefined;
}

async function searchImages(args) {
  const query = typeof args?.query === "string" ? args.query.trim() : "";
  if (!query) {
    return { isError: true, content: [{ type: "text", text: "query is required" }] };
  }
  const params = new URLSearchParams({
    q: query,
    page_size: String(pickNumber(args?.count, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)),
    mature: "false",
  });
  const licenseType = normalizeLicenseType(args?.license_type);
  if (licenseType) params.set("license_type", licenseType);
  if (typeof args?.extension === "string" && args.extension) {
    params.set("extension", args.extension);
  }

  let payload;
  try {
    const response = await fetchWithTimeout(`${OPENVERSE_ENDPOINT}?${params.toString()}`);
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const detail = retryAfter ? ` (retry after ${retryAfter}s)` : "";
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Openverse API returned HTTP ${response.status}${detail}. ` +
              "Anonymous access is rate limited; wait a moment and retry with fewer calls.",
          },
        ],
      };
    }
    payload = await response.json();
  } catch (error) {
    logError(`fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      isError: true,
      content: [
        { type: "text", text: `Image search request failed: ${error instanceof Error ? error.message : String(error)}` },
      ],
    };
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const images = results.map((item) => ({
    title: typeof item?.title === "string" ? item.title : "(untitled)",
    image_url: typeof item?.url === "string" ? item.url : undefined,
    thumbnail_url: typeof item?.thumbnail === "string" ? item.thumbnail : undefined,
    source_page: typeof item?.foreign_landing_url === "string" ? item.foreign_landing_url : undefined,
    creator: typeof item?.creator === "string" ? item.creator : undefined,
    license: [item?.license, item?.license_version].filter(Boolean).join(" ").toUpperCase() || undefined,
    width: Number.isFinite(item?.width) ? item.width : undefined,
    height: Number.isFinite(item?.height) ? item.height : undefined,
    provider: typeof item?.source === "string" ? item.source : undefined,
  }));

  const summary = images.length
    ? images
        .map(
          (image, index) =>
            `${index + 1}. ${image.title}\n   image: ${image.image_url ?? "(missing)"}\n` +
            `   page: ${image.source_page ?? "(unknown)"} | license: ${image.license ?? "unknown"} | ` +
            `${image.width ?? "?"}x${image.height ?? "?"} | provider: ${image.provider ?? "?"}`,
        )
        .join("\n")
    : "No results. Try broader keywords or a different license_type.";

  return {
    content: [
      {
        type: "text",
        text:
          `${images.length} result(s) for "${query}" from Openverse (openly licensed).\n\n${summary}\n\n` +
          "Embedding guidance: hotlinking may break; prefer downloading the image into the workspace, " +
          "and keep a license/creator attribution line next to the image in the deliverable.",
      },
    ],
  };
}

async function dispatch(request) {
  const { id, method, params } = request;
  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kayingcode-image-search", version: "0.1.1" },
      });
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, { tools: TOOL_DEFINITIONS });
    case "tools/call": {
      const name = params?.name;
      if (name !== "search_images") {
        return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
      }
      const result = await searchImages(params?.arguments);
      return jsonRpcResult(id, result);
    }
    default:
      // 通知（无 id）不需要也不应回复错误。
      if (id === undefined || id === null) return undefined;
      return jsonRpcError(id, -32601, `Method not supported: ${method}`);
  }
}

function main() {
  const readline = createInterface({ input: process.stdin, terminal: false });
  readline.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      logError(`dropping malformed message: ${trimmed.slice(0, 120)}`);
      return;
    }
    dispatch(request)
      .then((response) => {
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      })
      .catch((error) => {
        logError(`handler failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        if (request && request.id !== undefined && request.id !== null) {
          process.stdout.write(
            `${JSON.stringify(jsonRpcError(request.id, -32603, "Internal error"))}\n`,
          );
        }
      });
  });
  // stdin 结束（宿主关闭管道）时自然退出；不主动 process.exit，给在途响应留时间。
  readline.on("close", () => process.exit(0));
}

main();
