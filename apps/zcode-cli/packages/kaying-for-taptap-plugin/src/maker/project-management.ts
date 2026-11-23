import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  tapMakerProjectsRequestSchema,
  tapMakerProjectsResultSchema,
  type TapMakerProjectsResult,
} from "@zcode/shared";
import { listMakerRemoteProjects, restoreMakerRemoteProject } from "./remote-projects.js";
import { authorizeTapTap } from "./setup.js";

export async function readLocalMakerAppId(directory: string): Promise<string | null> {
  // Bug 原因：`.project/project.json` 的 project_id 是 Maker 引擎侧 id（如 m_jarj、p_nfyc），
  // 与远端列表和恢复使用的 app id 不是同一命名空间；先读它会让本地目录永远关联不上远端游戏。
  // 修复依据：`.maker-mcp/config.json` 由 maker init 写入，与 `maker apps --json` 同源，
  // 是远端 id 的权威来源；仅在缺失或损坏时回退到引擎侧配置。
  for (const config of [".maker-mcp/config.json", ".project/project.json"]) {
    try {
      const value: unknown = JSON.parse(await readFile(path.join(directory, config), "utf8"));
      if (
        value &&
        typeof value === "object" &&
        "project_id" in value &&
        typeof value.project_id === "string" &&
        value.project_id.trim()
      )
        return value.project_id.trim();
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
        continue;
      throw error;
    }
  }
  return null;
}

export async function manageMakerProjects(
  raw: unknown,
  signal?: AbortSignal,
): Promise<TapMakerProjectsResult> {
  const input = tapMakerProjectsRequestSchema.parse(raw);
  if (input.action === "list") {
    const projects = await listMakerRemoteProjects({ signal });
    const associations = await Promise.all(
      input.candidateDirectories.map(
        async (directory) => [await readLocalMakerAppId(directory), directory] as const,
      ),
    );
    const local = new Map(associations.filter(([id]) => id !== null));
    return tapMakerProjectsResultSchema.parse({
      action: "list",
      projects: projects.map((project) => ({
        ...project,
        localDirectory: local.get(project.id) ?? null,
      })),
    });
  }
  if (input.action === "authorize") {
    const result = await authorizeTapTap({ env: "production", signal });
    if (!result.ok) throw new Error(result.error ?? result.stderr ?? "TapTap authorization failed");
    return { action: "authorize" };
  }
  const result = await restoreMakerRemoteProject({ ...input, env: "production", signal });
  if (!result.ok) throw new Error(result.error ?? result.stderr ?? "TapMaker restore failed");
  return tapMakerProjectsResultSchema.parse({
    action: "restore",
    projectRoot: result.data.projectRoot,
  });
}
