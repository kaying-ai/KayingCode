import path from "node:path";
import { pathExists } from "../async-files";
import {
  createKayingForTaptapOperationLogger,
  type KayingForTaptapOperationLogSummary,
} from "../operations/logging";
import { ensureMakerBuildScaffold } from "./build-scaffold";
import {
  type MakerDirectoryInspection,
  type MakerExistingDirectoryStrategy,
  inspectMakerProjectDirectoryState,
} from "./directory-inspection";
import { prepareInitTarget } from "./init-target";
import { type MakerCommandResult, resolveMakerBundle, runMakerCommand } from "./launcher";
import { inspectMakerLuaPreflightSetup, type MakerLuaPreflightSetup } from "./lua-preflight";
import { getMakerHome } from "./paths";

export type {
  MakerDirectoryInspection,
  MakerExistingDirectoryStrategy,
} from "./directory-inspection";
export { inspectMakerProjectDirectoryState } from "./directory-inspection";

export type MakerCliCapability = {
  action: "check_environment" | "authorize_taptap" | "init_project";
  label: string;
  category: "setup" | "auth" | "project";
  requiresNetwork: boolean;
  writesProject: boolean;
  requiresUserIntent: boolean;
};

export interface MakerSetupResult {
  ok: boolean;
  makerBundlePath: string;
  makerBundleExists: boolean;
  makerHome: string;
  userMcpRequired: false;
  restartRequired: false;
  doctor: unknown;
  commandResult: MakerCommandResult | null;
  luaPreflight: MakerLuaPreflightSetup;
  notes: string[];
  operationLog: KayingForTaptapOperationLogSummary;
}

export interface MakerLifecycleCommandResult extends MakerCommandResult {
  operationLog: KayingForTaptapOperationLogSummary;
  data?: unknown;
}

export const MAKER_CLI_CAPABILITIES: MakerCliCapability[] = [
  {
    action: "check_environment",
    label: "Check KayingForTaptap environment",
    category: "setup",
    requiresNetwork: false,
    writesProject: false,
    requiresUserIntent: false,
  },
  {
    action: "authorize_taptap",
    label: "Authorize TapTap",
    category: "auth",
    requiresNetwork: true,
    writesProject: false,
    requiresUserIntent: true,
  },
  {
    action: "init_project",
    label: "Initialize KayingForTaptap project",
    category: "project",
    requiresNetwork: true,
    writesProject: true,
    requiresUserIntent: true,
  },
];

export async function checkMakerSetup(
  _legacyIdes?: string[],
  options: { signal?: AbortSignal } = {},
): Promise<MakerSetupResult> {
  const logger = await createKayingForTaptapOperationLogger("check_environment");
  const makerBundlePath = resolveMakerBundle("maker");
  const makerBundleExists = await pathExists(makerBundlePath);
  const notes: string[] = [];
  const luaPreflight = await inspectMakerLuaPreflightSetup();
  logger.info("runtime", "Resolved bundled Maker runtime", {
    makerBundlePath,
    makerBundleExists,
    makerHome: getMakerHome(),
    userMcpRequired: false,
  });
  if (!makerBundleExists) {
    notes.push(`Bundled Maker runtime is missing: ${makerBundlePath}`);
    // A missing optional runtime is an environment warning, not a failed
    // KayingForTaptap operation. Complete this check so callers do not enter an
    // error/retry loop while the actionable diagnostic remains available.
    logger.warn("runtime", notes[0], { makerBundlePath, makerBundleExists });
    const operationLog = await logger.complete({ ok: false, status: "warning", notes });
    return {
      ok: false,
      makerBundlePath,
      makerBundleExists,
      makerHome: getMakerHome(),
      userMcpRequired: false,
      restartRequired: false,
      doctor: null,
      commandResult: null,
      luaPreflight,
      notes,
      operationLog,
    };
  }
  const commandResult = await runMakerCommand({
    args: ["doctor", "--json"],
    cwd: process.cwd(),
    timeoutMs: 120_000,
    logger,
    signal: options.signal,
  });
  if (!commandResult.ok)
    notes.push(commandResult.error ?? commandResult.stderr ?? "Maker doctor failed");
  if (!luaPreflight.ready || luaPreflight.coverage !== "semantic") notes.push(luaPreflight.note);
  const doctor = parseJson(commandResult.stdout);
  // Optional diagnostics do not determine whether Maker itself can publish.
  const ok = commandResult.ok;
  const logData = { ok, doctor, luaPreflight, notes };
  const operationLog = ok
    ? await logger.complete(logData)
    : await logger.fail(notes[0] ?? "Maker environment is incomplete", logData);
  return {
    ok,
    makerBundlePath,
    makerBundleExists,
    makerHome: getMakerHome(),
    userMcpRequired: false,
    restartRequired: false,
    doctor,
    commandResult,
    luaPreflight,
    notes,
    operationLog,
  };
}

export async function authorizeTapTap(
  input: {
    projectRoot?: string;
    env?: "rnd" | "production";
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<MakerLifecycleCommandResult> {
  const { signal, ...logInput } = input;
  const logger = await createKayingForTaptapOperationLogger("authorize_taptap", logInput);
  try {
    const args = ["login", "--json"];
    const commandResult = await runMakerCommand({
      args,
      cwd: input.projectRoot ? path.resolve(input.projectRoot) : process.cwd(),
      env: input.env ? { TAPTAP_MCP_ENV: input.env } : { TAPTAP_MCP_ENV: "production" },
      timeoutMs: input.timeoutMs ?? 10 * 60_000,
      logger,
      signal,
    });
    const data = parseJson(commandResult.stdout);
    const logData = {
      ok: commandResult.ok,
      data,
      stderr: commandResult.stderr,
    };
    const operationLog = commandResult.ok
      ? await logger.complete(logData)
      : await logger.fail(
          commandResult.error ?? commandResult.stderr ?? "TapTap authorization failed",
          logData,
        );
    return { ...commandResult, data, operationLog };
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

export async function inspectMakerProjectDirectory(
  projectRootInput: string,
): Promise<MakerDirectoryInspection> {
  const projectRoot = path.resolve(projectRootInput);
  const logger = await createKayingForTaptapOperationLogger("inspect_project_directory", {
    projectRoot,
  });
  try {
    const inspection = await inspectMakerProjectDirectoryState(projectRoot);
    return { ...inspection, operationLog: await logger.complete(inspection) };
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

export async function initMakerProject(input: {
  projectRoot: string;
  force?: boolean;
  name?: string;
  existingDirectory?: MakerExistingDirectoryStrategy;
  confirmReset?: boolean;
  signal?: AbortSignal;
}): Promise<MakerLifecycleCommandResult> {
  const { signal, ...logInput } = input;
  const requestedProjectRoot = path.resolve(input.projectRoot);
  const strategy = input.existingDirectory ?? "reject";
  if (input.force && !input.existingDirectory) {
    throw new Error(
      "force=true is no longer accepted without an explicit existingDirectory strategy",
    );
  }
  if (strategy === "reset" && input.confirmReset !== true) {
    throw new Error("existingDirectory=reset requires confirmReset=true");
  }
  const logger = await createKayingForTaptapOperationLogger("init_project", {
    ...logInput,
    requestedProjectRoot,
    strategy,
  });
  try {
    const inspection = await inspectMakerProjectDirectoryState(requestedProjectRoot);
    logger.info("directory_inspection", "Inspected project initialization target", inspection);
    const projectRoot = await prepareInitTarget({
      requestedProjectRoot,
      inspection,
      strategy,
      name: input.name,
      logger,
    });
    const projectName = input.name?.trim() || path.basename(projectRoot);
    const commandResult = await runMakerCommand({
      args: [
        "init",
        "--create",
        "--name",
        projectName,
        "--target-dir",
        projectRoot,
        // 修复依据：新建工程必须绑定 production（maker.taptap.cn）。不传 --env 时
        // Maker 会读宿主 TAPTAP_MCP_ENV / 上级目录本地配置，可能落到 rnd 内网
        // （fuping.agnt.xd.com）并写入不可用的 Git 远端。
        "--env",
        "production",
        "--skip-mcp-install",
        "--skip-confirm",
        "--json",
      ],
      cwd: projectRoot,
      env: { TAPTAP_MCP_ENV: "production" },
      timeoutMs: 20 * 60_000,
      logger,
      signal,
    });
    const makerData = parseJson(commandResult.stdout);
    const buildScaffold = commandResult.ok
      ? await ensureMakerBuildScaffold(projectRoot, { requireProjectConfig: false })
      : null;
    if (buildScaffold) {
      logger.info("build_scaffold", "Prepared standard Maker build scaffold", buildScaffold);
    }
    const data = {
      maker: makerData,
      requestedProjectRoot,
      projectRoot,
      strategy,
      buildScaffold,
    };
    const logData = {
      ok: commandResult.ok,
      data,
      stderr: commandResult.stderr,
    };
    const operationLog = commandResult.ok
      ? await logger.complete(logData)
      : await logger.fail(
          commandResult.error ?? commandResult.stderr ?? "Project initialization failed",
          logData,
        );
    return { ...commandResult, data, operationLog };
  } catch (error) {
    throw await logger.enrichError(error);
  }
}

export function listMakerCliCapabilities() {
  return {
    package: "@kayingcode/kaying-for-taptap-plugin",
    invocation: "kaying-for-taptap <action>",
    makerHome: getMakerHome(),
    userMcpRequired: false,
    capabilities: MAKER_CLI_CAPABILITIES,
  };
}

export async function runMakerCliAction(input: {
  action: string;
  projectRoot?: string;
  confirm?: boolean;
}): Promise<MakerSetupResult | MakerLifecycleCommandResult> {
  if (input.action === "check_environment") return await checkMakerSetup();
  if (input.action === "authorize_taptap") {
    if (input.confirm !== true) throw new Error("authorize_taptap requires confirm=true");
    return await authorizeTapTap({ projectRoot: input.projectRoot });
  }
  if (input.action === "init_project") {
    if (!input.projectRoot) throw new Error("init_project requires projectRoot");
    if (input.confirm !== true) throw new Error("init_project requires confirm=true");
    return await initMakerProject({ projectRoot: input.projectRoot });
  }
  throw new Error(`Unsupported KayingForTaptap CLI action: ${input.action}`);
}

function parseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { raw: trimmed };
  }
}
