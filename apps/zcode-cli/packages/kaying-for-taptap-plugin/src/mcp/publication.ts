import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  normalizeTrustedTapTapPreviewUrl,
  TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH,
  type TapTapPreviewPublicationV1,
} from "@zcode/shared";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";

export async function writeTapTapPreviewPublication(input: {
  previewUrl: string;
  projectRoot: string;
  receiptRoot?: string;
  workspaceKey: string;
  sessionId?: string;
}): Promise<TapTapPreviewPublicationV1> {
  const previewUrl = normalizeTrustedTapTapPreviewUrl(input.previewUrl);
  if (!previewUrl) throw new Error("TapTap publish returned an untrusted preview URL");

  const projectRoot = resolve(input.projectRoot);
  const receiptRoot = resolve(input.receiptRoot ?? projectRoot);
  const previewMode = await resolvePreviewMode(projectRoot, receiptRoot);
  const receiptPath = join(receiptRoot, ...TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH.split("/"));
  return withFileLock(receiptPath, async () => {
    // 同一 Host 中并发 publish 若在锁外读取 revision，会产生两个相同版本并丢失一次刷新；
    // read + atomic replace 必须共享同一把跨进程文件锁。
    const revision = await readNextRevision(receiptPath);
    const receipt: TapTapPreviewPublicationV1 = {
      schemaVersion: 1,
      operationId: randomUUID(),
      workspaceKey: input.workspaceKey,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      previewMode,
      projectRoot,
      previewUrl,
      publishedAt: new Date().toISOString(),
      revision,
    };
    await atomicWritePrivateTextFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  });
}

async function resolvePreviewMode(
  projectRoot: string,
  workspaceRoot: string,
): Promise<NonNullable<TapTapPreviewPublicationV1["previewMode"]>> {
  // 首轮发布尚无 compare receipt；沿工作区内祖先读取 t3m 自有元数据，按 dest 精确确认归属。
  let candidate = projectRoot;
  while (true) {
    const pathInWorkspace = relative(workspaceRoot, candidate);
    if (
      isAbsolute(pathInWorkspace) ||
      pathInWorkspace === ".." ||
      pathInWorkspace.startsWith(`..${sep}`)
    )
      break;
    try {
      const info = JSON.parse(await readFile(join(candidate, "project-info.json"), "utf8")) as {
        t3m_version?: unknown;
        source_url?: unknown;
        paths?: { dest?: unknown };
      } | null;
      if (
        typeof info?.t3m_version === "string" &&
        info.t3m_version.trim() &&
        typeof info.source_url === "string" &&
        info.source_url.trim() &&
        typeof info.paths?.dest === "string" &&
        info.paths.dest.trim() &&
        resolve(candidate, info.paths.dest) === projectRoot
      )
        return "transcription-compare";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error;
    }
    if (candidate === workspaceRoot) break;
    candidate = dirname(candidate);
  }
  return "standalone";
}

async function readNextRevision(receiptPath: string): Promise<number> {
  try {
    const value = JSON.parse(await readFile(receiptPath, "utf8")) as { revision?: unknown };
    return typeof value.revision === "number" && Number.isSafeInteger(value.revision)
      ? value.revision + 1
      : 1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 1;
    return 1;
  }
}
