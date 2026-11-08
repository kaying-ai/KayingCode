import path from "node:path";
import { isFile } from "../async-files";
import {
  createKayingForTaptapOperationLogger,
  type KayingForTaptapOperationLogSummary,
} from "../index";
import {
  formatMakerLuaPreflightFailure,
  inspectMakerLuaPreflightSetup,
  type MakerLuaPreflightResult,
  runMakerLuaPreflight,
} from "../maker/index";
import { assessLuaPublishDiagnostics } from "../maker/lua-publish-policy";
import {
  type KayingForTaptapProjectDetection as CoreKayingForTaptapProjectDetection,
  detectKayingForTaptapProject as detectCoreKayingForTaptapProject,
} from "../project/index";
import { loadMakerCapabilities } from "./maker-registry";

export interface KayingForTaptapProjectDetection extends CoreKayingForTaptapProjectDetection {
  makerCapabilities: number;
}

export interface KayingForTaptapDoctorResult {
  project: KayingForTaptapProjectDetection;
  checks: Array<{
    id: string;
    status: "ok" | "warning" | "error";
    message: string;
  }>;
  ready: boolean;
}

export async function detectKayingForTaptapProject(
  projectRoot: string,
): Promise<KayingForTaptapProjectDetection> {
  const project = await detectCoreKayingForTaptapProject(projectRoot);
  return {
    ...project,
    makerCapabilities: (await loadMakerCapabilities(project.projectRoot)).length,
  };
}

export async function runKayingForTaptapDoctor(
  projectRoot: string,
): Promise<KayingForTaptapDoctorResult> {
  const project = await detectKayingForTaptapProject(projectRoot);
  const checks: KayingForTaptapDoctorResult["checks"] = [];

  checks.push({
    id: "kaying-for-taptap-project",
    status: project.isKayingForTaptapProject ? "ok" : "error",
    message: project.isKayingForTaptapProject
      ? "KayingForTaptap project structure detected"
      : "KayingForTaptap project structure is missing; initialize the Maker project before writing game scripts",
  });
  checks.push(
    requiredCheck(
      "project-config",
      project.projectConfig !== null,
      ".project/project.json found",
      "Missing .project/project.json; initialize the project with the modular KayingForTaptap scaffold",
    ),
  );
  checks.push({
    id: "maker-project-binding",
    status: project.makerProjectId ? "ok" : "warning",
    message: project.makerProjectId
      ? `TapTap Maker remote project bound: ${project.makerProjectId}`
      : "TapTap Maker remote project is not bound; create or restore a remote project before submitting",
  });
  checks.push(
    requiredCheck(
      "maker-config",
      project.hasMakerMcpConfig,
      ".maker-mcp/config.json found",
      "Missing .maker-mcp/config.json; initialize the Maker project before authoring",
    ),
  );
  checks.push(
    check(
      "agents-policy",
      project.hasAgentsPolicy,
      "AGENTS.md policy found",
      "AGENTS.md policy is missing",
    ),
  );
  checks.push(
    check(
      "workbench",
      project.hasWorkbench,
      "scripts/Workbench facade found",
      "Workbench facade is missing: scripts/Workbench/init.lua",
    ),
  );
  checks.push(
    check(
      "maker-registry",
      project.hasMakerRegistry,
      "Maker registry found: scripts/Workbench/Maker/Registry.lua",
      "Maker registry is missing: scripts/Workbench/Maker/Registry.lua",
    ),
  );
  checks.push(requiredCheck("scripts-dir", project.directories.scripts, "scripts directory found"));
  checks.push(check("assets-dir", project.directories.assets, "assets directory found"));
  const luaPreflight = await inspectMakerLuaPreflightSetup();
  checks.push({
    id: "lua-preflight",
    status: luaPreflight.ready && luaPreflight.coverage === "semantic" ? "ok" : "warning",
    message: luaPreflight.note,
  });
  if (project.entry) {
    checks.push(
      check("entry-script", Boolean(project.entryPath), `entry configured: ${project.entry}`),
    );
    checks.push({
      id: "entry-exists",
      status: project.entryPath && (await isFile(project.entryPath)) ? "ok" : "error",
      message: project.entryPath ? `entry path: ${project.entryPath}` : "entry script is missing",
    });
  } else {
    checks.push({ id: "entry-script", status: "warning", message: "entry is not configured" });
  }

  for (const warning of project.warnings) {
    // Named checks above already report the workbench/AGENTS.md state with
    // matching wording — skip the duplicate detect warnings so the doctor
    // output never contradicts itself ("facade found" + "facade missing").
    if (
      warning.startsWith("Workbench facade is missing") ||
      warning === "AGENTS.md policy is missing"
    ) {
      continue;
    }
    checks.push({ id: `warning-${checks.length + 1}`, status: "warning", message: warning });
  }

  return {
    project,
    checks,
    ready: checks.every((item) => item.status !== "error"),
  };
}

export interface PublishReadinessResult {
  ready: boolean;
  checks: Array<{ id: string; status: "ok" | "warning" | "error"; message: string }>;
  project: KayingForTaptapProjectDetection;
  doctor: KayingForTaptapDoctorResult;
  luaPreflight?: MakerLuaPreflightResult;
  operationLog: KayingForTaptapOperationLogSummary;
}

export async function checkPublishReadiness(
  projectRoot: string,
  options: { logDir?: string; signal?: AbortSignal } = {},
): Promise<PublishReadinessResult> {
  const logger = await createKayingForTaptapOperationLogger(
    "check_publish_readiness",
    { projectRoot },
    options,
  );
  try {
    const doctor = await runKayingForTaptapDoctor(projectRoot);
    const project = doctor.project;
    const checks: PublishReadinessResult["checks"] = [];

    for (const doctorCheck of doctor.checks) {
      checks.push({
        id: `doctor-${doctorCheck.id}`,
        status: doctorCheck.status,
        message: doctorCheck.message,
      });
    }

    const taptapPublish = project.projectConfig?.taptap_publish as
      | Record<string, unknown>
      | undefined;
    checks.push({
      id: "publish-title",
      status: taptapPublish?.title || project.name ? "ok" : "warning",
      message: taptapPublish?.title
        ? `TapTap publish title: ${taptapPublish.title}`
        : project.name
          ? `Project name available: ${project.name}`
          : "TapTap publish title is missing",
    });

    checks.push({
      id: "publish-maker-binding",
      status: project.makerProjectId ? "ok" : "error",
      message: project.makerProjectId
        ? `TapTap Maker project id ready: ${project.makerProjectId}`
        : "TapTap Maker project id is missing. Restore the named remote project or initialize a new one before submit_to_taptap.",
    });

    checks.push({
      id: "publish-version",
      status: project.version ? "ok" : "warning",
      message: project.version
        ? `Project version: ${project.version}`
        : "Project version is missing",
    });

    const entryReady = Boolean(
      project.entry && project.entryPath && (await isFile(project.entryPath)),
    );
    checks.push({
      id: "publish-entry",
      status: entryReady ? "ok" : "error",
      message: entryReady
        ? `Entry script ready: ${project.entry}`
        : "Entry script is missing or not configured",
    });

    const totalAssets = Object.values(project.assetCounts).reduce((sum, count) => sum + count, 0);
    checks.push({
      id: "publish-assets",
      status: totalAssets > 0 ? "ok" : "warning",
      message:
        totalAssets > 0
          ? `Assets found: ${totalAssets} (${Object.entries(project.assetCounts)
              .filter(([, count]) => count > 0)
              .map(([kind, count]) => `${kind}: ${count}`)
              .join(", ")})`
          : "No assets found; a publishable game usually needs images/audio/video assets",
    });

    checks.push({
      id: "publish-maker-capabilities",
      status: project.makerCapabilities > 0 ? "ok" : "warning",
      message:
        project.makerCapabilities > 0
          ? `${project.makerCapabilities} Maker capabilities registered`
          : "No Maker capabilities registered in project registry",
    });

    let luaPreflight: MakerLuaPreflightResult | undefined;
    if (entryReady && project.entryPath) {
      const scriptsPath =
        path.relative(project.projectRoot, path.dirname(project.entryPath)) || ".";
      logger.info("lua_preflight", "Checking Lua scripts for publish-blocking diagnostics", {
        scriptsPath,
      });
      luaPreflight = await runMakerLuaPreflight(
        project.projectRoot,
        scriptsPath,
        logger.operationId,
        options.signal,
      );
      checks.push(createLuaReadinessCheck(luaPreflight));
    }

    const output = {
      ready: doctor.ready && checks.every((item) => item.status !== "error"),
      checks,
      project,
      doctor,
      ...(luaPreflight ? { luaPreflight } : {}),
    };
    const operationLog = await logger.complete(output);
    return { ...output, operationLog };
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

function createLuaReadinessCheck(
  result: MakerLuaPreflightResult,
): PublishReadinessResult["checks"][number] {
  const assessment = assessLuaPublishDiagnostics(result);
  if (assessment.blocking) {
    return {
      id: "publish-lua",
      status: "error",
      message: formatMakerLuaPreflightFailure(assessment.failure),
    };
  }
  if (assessment.warnings.length) {
    return { id: "publish-lua", status: "warning", message: assessment.warnings.join("; ") };
  }
  return { id: "publish-lua", status: "ok", message: "Lua publish diagnostics passed" };
}

function check(
  id: string,
  ok: boolean,
  message: string,
  failMessage?: string,
): KayingForTaptapDoctorResult["checks"][number] {
  return { id, status: ok ? "ok" : "warning", message: ok ? message : (failMessage ?? message) };
}

function requiredCheck(
  id: string,
  ok: boolean,
  message: string,
  failMessage?: string,
): KayingForTaptapDoctorResult["checks"][number] {
  return { id, status: ok ? "ok" : "error", message: ok ? message : (failMessage ?? message) };
}
