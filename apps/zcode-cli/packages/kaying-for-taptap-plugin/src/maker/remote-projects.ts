/** TapTap Maker remote project listing and safe local restoration. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createKayingForTaptapOperationLogger,
  type KayingForTaptapOperationLogSummary,
} from "../operations/logging";
import { ensureMakerBuildScaffold } from "./build-scaffold";
import {
  hasConverterArtifacts,
  restoreConverterArtifacts,
  snapshotConverterArtifacts,
} from "./converter-artifacts";
import { bindVerifiedConverterProject } from "./converter-handoff-binding";
import { type MakerCommandResult, runMakerCommand } from "./launcher";
import {
  type MakerRemoteProject,
  assertAppId,
  isStandardMakerDirectory,
  parseMakerCommandOutput,
  parseMakerRemoteProjects,
  prepareMakerRestoreTarget,
  readInitializedProjectRoot,
} from "./remote-project-model";
import { initMakerProject } from "./setup";

export {
  hasConverterArtifacts,
  restoreConverterArtifacts,
  snapshotConverterArtifacts,
} from "./converter-artifacts";
export {
  type MakerRemoteProject,
  assertAppId,
  isStandardMakerDirectory,
  parseMakerCommandOutput,
  parseMakerRemoteProjects,
  prepareMakerRestoreTarget,
  readInitializedProjectRoot,
} from "./remote-project-model";

export const CONVERTER_REMOTE_PROJECT_NAME = "KayingConverterProject";
export const CONVERTER_REMOTE_PROJECT_TITLE = "咖影转换Demo";

export interface MakerRestoreProjectResult extends MakerCommandResult {
  operationLog: KayingForTaptapOperationLogSummary;
  data: {
    appId: string;
    projectName: string;
    selectedDirectory: string;
    projectRoot: string;
    createdSubdirectory: boolean;
    reusedExisting: boolean;
    converterFilesRestored: string[];
    maker: unknown;
    buildScaffold: Awaited<ReturnType<typeof ensureMakerBuildScaffold>> | null;
  };
}

export interface ConverterRemoteProjectResult {
  projectRoot: string;
  projectId: string;
  projectName: string;
  projectTitle: string;
  created: boolean;
  restored: boolean;
  remoteMatch: MakerRemoteProject | null;
}

/**
 * Prepare the stable Maker checkout used by Converter development smoke tests.
 * The lookup is name-based only at the boundary; the returned Maker config is
 * the authoritative app id used by subsequent Converter/KayingForTaptap operations.
 */
export async function prepareConverterRemoteProject(input: {
  selectedDirectory: string;
  projectName?: string;
  projectTitle?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ConverterRemoteProjectResult> {
  const projectName = input.projectName?.trim() || CONVERTER_REMOTE_PROJECT_NAME;
  const projectTitle = input.projectTitle?.trim() || CONVERTER_REMOTE_PROJECT_TITLE;
  const selectedDirectory = path.resolve(input.selectedDirectory);
  const converted = await bindVerifiedConverterProject(
    selectedDirectory,
    projectName,
    projectTitle,
  );
  if (converted) return converted;
  const currentProjectId = await readMakerProjectId(selectedDirectory);
  const currentIsStandard = await isStandardMakerDirectory(selectedDirectory);
  const projects = await listMakerRemoteProjects({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  const remoteMatch = projects.find(
    (project) => project.name === projectName || project.name === projectTitle,
  );
  if (
    currentIsStandard &&
    currentProjectId &&
    (!remoteMatch || currentProjectId !== remoteMatch.id)
  ) {
    throw new Error(
      `Selected project is already bound to Maker project ${currentProjectId}; choose that project or an empty directory for ${projectName}.`,
    );
  }
  if (remoteMatch) {
    const restored = await restoreMakerRemoteProject({
      appId: remoteMatch.id,
      projectName,
      selectedDirectory,
      reuseExistingStandard: currentIsStandard,
      refreshExisting: true,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
    await setConverterProjectIdentity(restored.data.projectRoot, projectName, projectTitle);
    return {
      projectRoot: restored.data.projectRoot,
      projectId: remoteMatch.id,
      projectName,
      projectTitle,
      created: false,
      restored: true,
      remoteMatch,
    };
  }
  const initialized = await initMakerProject({
    projectRoot: selectedDirectory,
    name: projectName,
    existingDirectory: currentIsStandard ? "reuse" : "subdirectory",
    signal: input.signal,
  });
  if (!initialized.ok) {
    throw new Error(
      initialized.error ?? initialized.stderr ?? "Converter remote project creation failed",
    );
  }
  const projectRoot = readInitializedProjectRoot(initialized.data, input.selectedDirectory);
  const projectId = await readMakerProjectId(projectRoot);
  if (!projectId) throw new Error("Maker project was created without a remote project id");
  await setConverterProjectIdentity(projectRoot, projectName, projectTitle);
  return {
    projectRoot,
    projectId,
    projectName,
    projectTitle,
    created: true,
    restored: false,
    remoteMatch: null,
  };
}

export async function listMakerRemoteProjects(
  input: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<MakerRemoteProject[]> {
  const logger = await createKayingForTaptapOperationLogger("list_remote_projects");
  try {
    const result = await runMakerCommand({
      args: ["apps", "--json"],
      // 修复依据：远端列表必须与建工程同一环境（production），避免在 rnd 内网
      // 列表下误建/误绑工程。
      env: { TAPTAP_MCP_ENV: "production" },
      timeoutMs: input.timeoutMs ?? 120_000,
      logger,
      preserveStdout: true,
      signal: input.signal,
    });
    if (!result.ok) {
      throw new Error(result.error ?? result.stderr ?? "TapTap project listing failed");
    }
    const projects = parseMakerRemoteProjects(result.stdout);
    await logger.complete({ count: projects.length });
    return projects;
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

export async function restoreMakerRemoteProject(input: {
  appId: string;
  projectName: string;
  selectedDirectory: string;
  reuseExistingStandard?: boolean;
  refreshExisting?: boolean;
  env?: "rnd" | "production";
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<MakerRestoreProjectResult> {
  assertAppId(input.appId);
  const selectedDirectory = path.resolve(input.selectedDirectory);
  const logger = await createKayingForTaptapOperationLogger("restore_remote_project", {
    appId: input.appId,
    projectName: input.projectName,
    selectedDirectory,
  });
  try {
    const target = await prepareMakerRestoreTarget(
      selectedDirectory,
      input.projectName,
      input.appId,
      {
        reuseExistingStandard: input.reuseExistingStandard === true,
      },
    );
    const { projectRoot, reusedExisting } = target;
    const createdSubdirectory = projectRoot !== selectedDirectory;
    logger.info("restore_target", "Prepared local project restore target", {
      selectedDirectory,
      projectRoot,
      createdSubdirectory,
      reusedExisting,
    });
    if (reusedExisting && input.refreshExisting !== true) {
      const buildScaffold = await ensureMakerBuildScaffold(projectRoot, {
        requireProjectConfig: false,
      });
      const data = {
        appId: input.appId,
        projectName: input.projectName,
        selectedDirectory,
        projectRoot,
        createdSubdirectory,
        reusedExisting,
        converterFilesRestored: [],
        maker: null,
        buildScaffold,
      };
      return {
        ok: true,
        command: [],
        cwd: projectRoot,
        exitCode: 0,
        stdout: "",
        stderr: "",
        data,
        operationLog: await logger.complete(data),
      };
    }
    const converterArtifacts = await snapshotConverterArtifacts(projectRoot);
    let restoredConverterFiles: string[] = [];
    let result: MakerCommandResult;
    try {
      result = await runMakerCommand({
        args: [
          "init",
          "--app-id",
          input.appId,
          "--target-dir",
          projectRoot,
          // 修复依据：恢复工程同样必须钉死 production，避免 rnd 内网 Git 远端。
          "--env",
          input.env ?? "production",
          "--skip-mcp-install",
          "--skip-confirm",
          "--json",
        ],
        cwd: projectRoot,
        env: { TAPTAP_MCP_ENV: input.env ?? "production" },
        timeoutMs: input.timeoutMs ?? 20 * 60_000,
        logger,
        preserveStdout: true,
        signal: input.signal,
      });
    } finally {
      restoredConverterFiles = await restoreConverterArtifacts(projectRoot, converterArtifacts);
    }
    const maker = parseMakerCommandOutput(result.stdout);
    const buildScaffold = result.ok
      ? await ensureMakerBuildScaffold(projectRoot, { requireProjectConfig: false })
      : null;
    const data = {
      appId: input.appId,
      projectName: input.projectName,
      selectedDirectory,
      projectRoot,
      createdSubdirectory,
      reusedExisting,
      converterFilesRestored: restoredConverterFiles,
      maker,
      buildScaffold,
    };
    const operationLog = result.ok
      ? await logger.complete(data)
      : await logger.fail(result.error ?? result.stderr ?? "TapTap project restore failed", data);
    return { ...result, data, operationLog };
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

async function readMakerProjectId(projectRoot: string): Promise<string | null> {
  try {
    const value = JSON.parse(
      await readFile(path.join(projectRoot, ".maker-mcp", "config.json"), "utf8"),
    ) as Record<string, unknown>;
    return typeof value.project_id === "string" && value.project_id.trim()
      ? value.project_id.trim()
      : null;
  } catch {
    return null;
  }
}

async function setConverterProjectIdentity(
  projectRoot: string,
  projectName: string,
  projectTitle: string,
): Promise<void> {
  if (await hasConverterArtifacts(projectRoot)) return;
  const projectPath = path.join(projectRoot, ".project", "project.json");
  try {
    const current = JSON.parse(await readFile(projectPath, "utf8")) as Record<string, unknown>;
    current.name = projectName;
    current.title = projectTitle;
    await writeFile(projectPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  } catch {
    // Maker may generate project.json after the initial clone; the remote id in
    // .maker-mcp/config.json remains authoritative in that case.
  }
}
