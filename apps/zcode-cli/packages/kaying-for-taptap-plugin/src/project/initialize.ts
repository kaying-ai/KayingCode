import path from "node:path";
import {
  initMakerProject,
  type MakerExistingDirectoryStrategy,
  type MakerLifecycleCommandResult,
} from "../maker/setup";

export type KayingForTaptapProjectTemplate = "modular" | "minimal" | "empty";
export type KayingForTaptapBuiltinUiTheme = "brawlforge" | "astroon" | "pixelforge";

export interface InitializeKayingForTaptapProjectInput {
  projectRoot: string;
  name?: string;
  template?: KayingForTaptapProjectTemplate;
  uiTheme?: KayingForTaptapBuiltinUiTheme;
  force?: boolean;
  existingDirectory?: MakerExistingDirectoryStrategy;
  confirmReset?: boolean;
  signal?: AbortSignal;
}

export interface KayingForTaptapProjectOperationInput {
  projectRoot: string;
  operation: "project.init" | "project.validate";
  arguments?: Record<string, unknown>;
}

export interface KayingForTaptapProjectOperationResult {
  success: boolean;
  output: unknown;
}

export type KayingForTaptapProjectOperationRunner = (
  input: KayingForTaptapProjectOperationInput,
) => Promise<KayingForTaptapProjectOperationResult>;

export interface InitializeKayingForTaptapProjectDependencies {
  initMakerProject?: typeof initMakerProject;
}

/**
 * Canonical KayingForTaptap initialization transaction shared by Agent and desktop UI.
 * Maker owns the remote-compatible base scaffold; KayingForTaptap CLI owns the modular
 * project contract and validation. Public initialization paths must use both.
 */
export async function initializeKayingForTaptapProject(
  input: InitializeKayingForTaptapProjectInput,
  runOperation: KayingForTaptapProjectOperationRunner,
  dependencies: InitializeKayingForTaptapProjectDependencies = {},
): Promise<MakerLifecycleCommandResult> {
  const maker = await (dependencies.initMakerProject ?? initMakerProject)(input);
  if (!maker.ok) return maker;

  const projectRoot = maker.cwd;
  const scaffold = await runOperation({
    projectRoot,
    operation: "project.init",
    arguments: {
      template: input.template ?? "modular",
      project_name: input.name?.trim() || path.basename(projectRoot),
      ui_theme: input.uiTheme ?? "brawlforge",
    },
  });
  assertOperationSucceeded("project.init", scaffold);

  const validation = await runOperation({
    projectRoot,
    operation: "project.validate",
  });
  assertOperationSucceeded("project.validate", validation);

  return {
    ...maker,
    data: {
      ...(maker.data && typeof maker.data === "object" ? maker.data : {}),
      scaffold,
      validation,
    },
  };
}

function assertOperationSucceeded(
  operation: KayingForTaptapProjectOperationInput["operation"],
  result: KayingForTaptapProjectOperationResult,
): void {
  if (result.success) return;
  throw new Error(`${operation} failed: ${JSON.stringify(result.output)}`);
}
