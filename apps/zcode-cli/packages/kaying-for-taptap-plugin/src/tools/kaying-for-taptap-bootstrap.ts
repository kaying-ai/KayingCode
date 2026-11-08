import path from "node:path";
import { isDirectory, pathExists } from "../async-files";
import {
  initializeKayingForTaptapProject as initializeCanonicalKayingForTaptapProject,
  type KayingForTaptapBuiltinUiTheme,
  type KayingForTaptapProjectTemplate,
} from "../project/index";
import { applyGameOperation } from "./kaying-for-taptap-cli";
import {
  detectKayingForTaptapProject,
  runKayingForTaptapDoctor,
} from "./kaying-for-taptap-project";
import { inspectMakerProjectDirectory, type MakerCliResult } from "./maker-cli";

export interface EnsureKayingForTaptapProjectResult {
  projectRoot: string;
  initialized: boolean;
  needsInit: boolean;
  reason: string | null;
  initResult: MakerCliResult | null;
  doctor: Awaited<ReturnType<typeof runKayingForTaptapDoctor>> | null;
  ready: boolean;
}

export type { KayingForTaptapBuiltinUiTheme, KayingForTaptapProjectTemplate };

interface InitializeKayingForTaptapProjectInput {
  projectRoot: string;
  name?: string;
  template?: KayingForTaptapProjectTemplate;
  uiTheme?: KayingForTaptapBuiltinUiTheme;
  existingDirectory?: "reject" | "reset" | "subdirectory";
  confirmReset?: boolean;
  signal?: AbortSignal;
}

export async function initializeKayingForTaptapProject(
  input: InitializeKayingForTaptapProjectInput,
) {
  return await initializeCanonicalKayingForTaptapProject(input, async (operationInput) => {
    const applied = await applyGameOperation(operationInput);
    return {
      success: applied.result.data.success,
      output: applied.result.data.output,
    };
  });
}

export async function ensureKayingForTaptapProject(input: {
  projectRoot: string;
  name?: string;
  template?: KayingForTaptapProjectTemplate;
  uiTheme?: KayingForTaptapBuiltinUiTheme;
  existingDirectory?: "reject" | "reset" | "subdirectory";
  confirmReset?: boolean;
  signal?: AbortSignal;
}): Promise<EnsureKayingForTaptapProjectResult> {
  const projectRoot = path.resolve(input.projectRoot);
  if (await pathExists(projectRoot)) {
    if (!(await isDirectory(projectRoot))) {
      throw new Error(`projectRoot must be a directory: ${projectRoot}`);
    }
    const inspection = await inspectMakerProjectDirectory(projectRoot);
    const project = await detectKayingForTaptapProject(projectRoot);
    if (inspection.status === "standard" && project.isKayingForTaptapProject) {
      const doctor = await runKayingForTaptapDoctor(projectRoot);
      return {
        projectRoot,
        initialized: false,
        needsInit: false,
        reason: null,
        initResult: null,
        doctor,
        ready: doctor.ready,
      };
    }
    if (inspection.status === "nonstandard" && !input.existingDirectory) {
      const doctor = await runKayingForTaptapDoctor(projectRoot);
      return {
        projectRoot,
        initialized: false,
        needsInit: true,
        reason: inspection.reasons.join("；"),
        initResult: null,
        doctor,
        ready: false,
      };
    }
  }

  const initResult = await initializeKayingForTaptapProject({
    projectRoot,
    name: input.name,
    template: input.template,
    uiTheme: input.uiTheme,
    existingDirectory: input.existingDirectory,
    confirmReset: input.confirmReset,
    signal: input.signal,
  });
  const initializedRoot = initResult.cwd;
  const doctor =
    initResult.ok && (await pathExists(initializedRoot))
      ? await runKayingForTaptapDoctor(initializedRoot)
      : null;
  return {
    projectRoot: initializedRoot,
    initialized: initResult.ok,
    needsInit: !initResult.ok,
    reason: initResult.ok ? null : "Maker init failed",
    initResult,
    doctor,
    ready: doctor?.ready ?? false,
  };
}
