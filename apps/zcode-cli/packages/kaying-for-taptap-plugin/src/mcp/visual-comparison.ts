import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  parseTapTapPreviewPublicationV1,
  TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH,
  toTapTapGamePreviewUrl,
  type PluginBrowserComparePublicationV1,
} from "@zcode/shared";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";

export const TRANSCRIPTION_COMPARE_CONTRIBUTION_ID = "transcription-compare";
export const TRANSCRIPTION_COMPARE_RECEIPT_RELATIVE_PATH =
  ".maker/threejs-to-taptapmaker/compare-publication.v1.json";

export const PREPARE_VISUAL_COMPARISON_TOOL = {
  name: "prepare_visual_comparison",
  description:
    "After a successful built-in TapTap publication, open or update the KayingCode source/target comparison pane for a staged three.js/Canvas transcription checkpoint.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectRoot", "sourceUrl"],
    properties: {
      projectRoot: {
        type: "string",
        description: "Absolute or workspace-relative path of the converted TapTap project.",
      },
      sourceUrl: {
        type: "string",
        description: "Final playable http(s) URL of the original game, not a portal wrapper.",
      },
      viewport: {
        type: "object",
        additionalProperties: false,
        required: ["width", "height"],
        properties: {
          width: { type: "integer", minimum: 320, maximum: 3840 },
          height: { type: "integer", minimum: 320, maximum: 2160 },
        },
      },
    },
  },
} as const;

export async function prepareVisualComparison(
  args: unknown,
  meta: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  ok: true;
  publication: PluginBrowserComparePublicationV1;
  receiptPath: string;
}> {
  const input = toRecord(args);
  const workspacePathValue = readRequiredString(meta.workspace_path, "workspace_path metadata");
  const sessionId = readRequiredString(meta.session_id, "session_id metadata");
  const workspaceKey =
    readString(meta.workspace_key) ??
    readString(meta.workspace_identity)?.trim() ??
    workspacePathValue;
  const pluginId = readRequiredString(env.KAYINGCODE_PLUGIN_ID, "KAYINGCODE_PLUGIN_ID");

  const workspaceRealPath = await realpath(resolve(workspacePathValue));
  const projectRootValue = readRequiredString(input.projectRoot, "projectRoot");
  const projectRealPath = await realpath(resolve(workspaceRealPath, projectRootValue));
  assertPathInside(
    workspaceRealPath,
    projectRealPath,
    "projectRoot resolves outside the current workspace",
  );

  const sourceUrl = normalizeSourceUrl(readRequiredString(input.sourceUrl, "sourceUrl"));
  const viewport = normalizeViewport(input.viewport);
  const targetReceiptPath = join(
    workspaceRealPath,
    ...TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH.split("/"),
  );
  const targetReceiptRealPath = await realpath(targetReceiptPath);
  assertPathInside(
    workspaceRealPath,
    targetReceiptRealPath,
    "TapTap publication path resolves outside the current workspace",
  );
  const targetPublication = parseTapTapPreviewPublicationV1(
    JSON.parse(await readFile(targetReceiptRealPath, "utf8")),
  );
  if (targetPublication.workspaceKey !== workspaceKey) {
    throw new Error("TapTap publication belongs to a different workspace");
  }
  const targetProjectRealPath = await realpath(
    resolve(workspaceRealPath, targetPublication.projectRoot),
  );
  if (targetProjectRealPath !== projectRealPath) {
    throw new Error("TapTap publication belongs to a different projectRoot");
  }

  const receiptPath = join(
    workspaceRealPath,
    ...TRANSCRIPTION_COMPARE_RECEIPT_RELATIVE_PATH.split("/"),
  );
  const receiptAncestor = await resolveExistingAncestor(dirname(receiptPath));
  assertPathInside(
    workspaceRealPath,
    receiptAncestor,
    "Comparison receipt path resolves outside the current workspace",
  );
  const publication = await withFileLock(receiptPath, async () => {
    const revision = await readNextRevision(receiptPath);
    const value: PluginBrowserComparePublicationV1 = {
      schemaVersion: 1,
      pluginId,
      contributionId: TRANSCRIPTION_COMPARE_CONTRIBUTION_ID,
      operationId: randomUUID(),
      workspaceKey,
      sessionId,
      projectRoot: projectRealPath,
      sourceUrl,
      targetUrl: toTapTapGamePreviewUrl(targetPublication.previewUrl),
      viewport,
      targetPublication: {
        operationId: targetPublication.operationId,
        revision: targetPublication.revision,
      },
      publishedAt: new Date().toISOString(),
      revision,
    };
    await atomicWritePrivateTextFile(receiptPath, `${JSON.stringify(value, null, 2)}\n`);
    return value;
  });
  return { ok: true, publication, receiptPath };
}

function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("sourceUrl must be an http(s) URL without embedded credentials");
  }
  return url.toString();
}

function normalizeViewport(value: unknown): { width: number; height: number } {
  if (value === undefined) return { width: 1280, height: 720 };
  const viewport = toRecord(value);
  const unknownKeys = Object.keys(viewport).filter((key) => key !== "width" && key !== "height");
  if (unknownKeys.length > 0) {
    throw new Error(`Unexpected viewport field(s): ${unknownKeys.join(", ")}`);
  }
  const { width, height } = viewport;
  if (
    !Number.isSafeInteger(width) ||
    (width as number) < 320 ||
    (width as number) > 3840 ||
    !Number.isSafeInteger(height) ||
    (height as number) < 320 ||
    (height as number) > 2160
  ) {
    throw new Error("viewport is outside the supported 320..3840 × 320..2160 range");
  }
  return { width: width as number, height: height as number };
}

async function readNextRevision(receiptPath: string): Promise<number> {
  try {
    const value = JSON.parse(await readFile(receiptPath, "utf8")) as { revision?: unknown };
    return Number.isSafeInteger(value.revision) && (value.revision as number) > 0
      ? (value.revision as number) + 1
      : 1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError)
      return 1;
    throw error;
  }
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

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRequiredString(value: unknown, name: string): string {
  const result = readString(value)?.trim();
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}
