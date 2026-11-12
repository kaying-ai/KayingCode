import { fileURLToPath } from "node:url";
import { buildPluginBrowserCompareTabGroup, TAPMAKER_PROJECTS_MCP_TOOL } from "@zcode/shared";
import { manageMakerProjects } from "../maker/project-management.js";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { INVALID_PARAMS, Server, type Tool } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { KAYING_FOR_TAPTAP_PUBLIC_TOOLS } from "../tools/public-tools.js";
import { KAYING_FOR_TAPTAP_VERSION } from "../version.js";
import { writeTapTapPreviewPublication } from "./publication.js";
import { PREPARE_VISUAL_COMPARISON_TOOL, prepareVisualComparison } from "./visual-comparison.js";

export function createTapTapMakerMcpServer(): Server {
  const server = new Server(
    { name: "kaying_for_taptap", version: KAYING_FOR_TAPTAP_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Use the built-in kaying-for-taptap tools for TapTap Maker projects and three.js/Canvas transcription. Mutating game commands must be prepared before execution. After publishing, prefer KayingCode's automatically opened right-side TapTap Game Preview (taptap-preview:* guest) for gameplay and viewport screenshots through Browser Use; do not open a replacement ordinary browser tab. Local simulator preview is a fallback only when that panel is unavailable or has clearly failed and remote diagnostics are insufficient, or the user explicitly requests local execution. Transcription uses its source/target comparison pane.",
    },
  );

  server.setRequestHandler("tools/list", async () => ({
    tools: [
      ...KAYING_FOR_TAPTAP_PUBLIC_TOOLS.map(
        (tool): Tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Tool["inputSchema"],
        }),
      ),
      PREPARE_VISUAL_COMPARISON_TOOL as unknown as Tool,
    ],
  }));
  server.setRequestHandler("tools/call", async (request, extra) => {
    const meta = toRecord(extra.mcpReq._meta);
    // 此管理能力只由 Host UI 请求调用，不进入 Agent 的公开工具目录。
    if (request.params.name === TAPMAKER_PROJECTS_MCP_TOOL) {
      try {
        if (meta.client_mode !== "tapmaker-management")
          throw new Error("TapMaker management requires a Host UI request");
        const input = toRecord(request.params.arguments);
        if (input.action === "restore") {
          await assertWorkspaceScope({ projectRoot: input.selectedDirectory }, meta);
        }
        const result = await manageMakerProjects(input, extra.mcpReq.signal);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
          ],
          isError: true,
        };
      }
    }
    if (request.params.name === PREPARE_VISUAL_COMPARISON_TOOL.name) {
      try {
        const result = await prepareVisualComparison(request.params.arguments, meta);
        const { pluginId, contributionId, sessionId } = result.publication;
        const tabGroup = buildPluginBrowserCompareTabGroup(pluginId, contributionId, sessionId);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
            {
              type: "text" as const,
              // 恢复的任务曾沿用旧版本的 Browser Use 错误，跳过了新版本的双 guest 探测。
              text: [
                "For automated comparison, run agent.browsers.list() in the current Desktop session even if Browser Use failed in an earlier run.",
                `Select the IAB backend. Match tabs.list() by ID prefix (${tabGroup}:source: or ${tabGroup}:target:) and user.openTabs() by tabGroup (${tabGroup}).`,
                "Verify one source and one target with the receipt URLs. Use tabs.get(id) for claimed guests and user.claimTab(id) for unclaimed guests. Set both to the receipt viewport, then emit ordinary viewport screenshots serially from source to target.",
                "Copy the original PNG artifacts into the current workspace evidence directory, then run t3m compare through kaying-for-taptap_transcription on those copies. If discovery fails, report the current tool error or missing guest for this revision.",
              ].join(" "),
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    }
    const tool = KAYING_FOR_TAPTAP_PUBLIC_TOOLS.find(
      (candidate) => candidate.name === request.params.name,
    );
    if (!tool) {
      const error = new Error(`Tool ${request.params.name} not found`) as Error & { code?: number };
      error.code = INVALID_PARAMS;
      throw error;
    }

    try {
      const args = request.params.arguments ?? {};
      await assertWorkspaceScope(args, meta);
      const result = await tool.execute(args, {
        sessionId: readString(meta.session_id),
        workspacePath: readString(meta.workspace_path),
        signal: extra.mcpReq.signal,
      });
      const enriched =
        tool.name === "kaying-for-taptap_publish"
          ? await attachPublication(result, args, meta)
          : result;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
        structuredContent: toStructuredContent(enriched),
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  });
  return server;
}

async function assertWorkspaceScope(args: unknown, meta: Record<string, unknown>): Promise<void> {
  const projectRootValue = readString(toRecord(args).projectRoot);
  if (!projectRootValue) return;
  const workspacePathValue = readString(meta.workspace_path);
  if (!workspacePathValue) {
    throw new Error("TapTap tools require the Host workspace_path metadata");
  }

  const workspacePath = resolve(workspacePathValue);
  const projectRoot = resolve(projectRootValue);
  assertPathInside(
    workspacePath,
    projectRoot,
    "projectRoot must stay inside the current workspace",
  );

  const [realWorkspacePath, realProjectAncestor] = await Promise.all([
    realpath(workspacePath),
    resolveExistingAncestor(projectRoot),
  ]);
  // 修复依据：仅做字符串前缀判断会被工作区内的目录符号链接绕过，导致工具读写工作区外文件。
  assertPathInside(
    realWorkspacePath,
    realProjectAncestor,
    "projectRoot resolves outside the current workspace",
  );
}

async function resolveExistingAncestor(filePath: string): Promise<string> {
  let candidate = filePath;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function assertPathInside(root: string, target: string, message: string): void {
  const relativePath = relative(root, target);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error(message);
}

async function attachPublication(
  result: unknown,
  args: unknown,
  meta: Record<string, unknown>,
): Promise<unknown> {
  const output = toRecord(result);
  const input = toRecord(args);
  const previewUrl = readString(output.previewUrl);
  const projectRoot = readString(output.projectRoot) ?? readString(input.projectRoot);
  if (output.ok !== true || !previewUrl || !projectRoot) return result;
  await assertWorkspaceScope({ projectRoot }, meta);
  const workspaceKey =
    readString(meta.workspace_key) ??
    readString(meta.workspace_identity)?.trim() ??
    readString(meta.workspace_path) ??
    projectRoot;
  const workspacePath = readString(meta.workspace_path);
  const publication = await writeTapTapPreviewPublication({
    previewUrl,
    projectRoot,
    receiptRoot: workspacePath,
    workspaceKey,
    // 修复依据：发布完成时用户可能已切换任务，归属必须取调用时 Host 冻结的 session，不能由 UI 猜测。
    sessionId: readString(meta.session_id),
  });
  return { ...output, publication };
}

function toStructuredContent(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function main(): Promise<void> {
  const handle = serveStdio(() => createTapTapMakerMcpServer(), {
    legacy: "reject",
    onerror: (error) => {
      process.stderr.write(`kaying-for-taptap MCP protocol error: ${error.message}\n`);
    },
  });
  const shutdown = () => {
    void handle
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entryPath = process.argv[1];
// 修复依据：macOS 的临时目录会以 /var 与 /private/var 两种等价路径出现，直接比较 URL 会让
// 已打包 MCP 被误判为“不是入口文件”并静默退出；入口判定必须比较 realpath。
if (entryPath && (await realpath(entryPath)) === (await realpath(fileURLToPath(import.meta.url)))) {
  void main().catch((error) => {
    process.stderr.write(
      `kaying-for-taptap MCP server failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
