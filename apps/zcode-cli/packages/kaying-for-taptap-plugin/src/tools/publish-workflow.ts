/** One-call TapTap publication workflow with all required local preflight checks. */

import { executeGameOperation } from "./kaying-for-taptap-cli";
import { checkPublishReadiness } from "./kaying-for-taptap-project";
import {
  checkMakerSetup,
  restoreClobberedMakerMetadata,
  type SubmitToTapTapInput,
  submitToTapTap,
} from "./maker-cli";
import { assessPublishValidation } from "./publish-validation";

const DEFAULT_PUBLISH_DEPENDENCIES = {
  checkMakerSetup,
  restoreClobberedMakerMetadata,
  executeGameOperation,
  checkPublishReadiness,
  submitToTapTap,
};

export async function runTapTapPublishWorkflow(
  input: SubmitToTapTapInput,
  dependencies = DEFAULT_PUBLISH_DEPENDENCIES,
) {
  const setup = await dependencies.checkMakerSetup(undefined, { signal: input.signal });
  if (!setup.ok) {
    if (!setup.makerBundleExists) return createDeferredPublicationResult(input, setup);
    throw new Error(
      `TapTap publication setup failed: ${setup.notes.join("; ") || "Maker environment is unavailable"}`,
    );
  }
  // A remote Maker sync commit may have been pulled/rebased into the branch
  // since the last publish, resetting `.project` metadata. Restore it before
  // validation/readiness so the checks see the real local project state.
  await dependencies.restoreClobberedMakerMetadata(input.projectRoot);
  const validationResult = await dependencies
    .executeGameOperation({
      projectRoot: input.projectRoot,
      operation: "project.validate",
      arguments: { project_root: input.projectRoot },
      signal: input.signal,
    })
    .catch((error: unknown) => ({
      unavailable: error instanceof Error ? error.message : String(error),
    }));
  const validation = assessPublishValidation(validationResult);
  if (validation.errors.length) {
    throw new Error(`TapTap publication blocked: ${validation.errors.join("; ")}`);
  }
  const readiness = await dependencies.checkPublishReadiness(input.projectRoot, {
    signal: input.signal,
  });
  if (!readiness.ready) {
    const failures = readiness.checks
      .filter((item) => item.status === "error")
      .map((item) => `${item.id}: ${item.message}`);
    throw new Error(
      `TapTap publication readiness failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  const result = await dependencies.submitToTapTap(input);
  const warnings = [
    ...validation.warnings,
    ...readiness.checks
      .filter((item) => item.status === "warning")
      .map((item) => `${item.id}: ${item.message}`),
    ...(result.warnings ?? []),
  ];
  return {
    ...result,
    warnings,
    checks: readiness.checks,
    validation: validationResult,
    preflight: {
      setup: "passed" as const,
      validation: validation.status,
      readiness: warnings.length ? ("warning" as const) : ("passed" as const),
    },
  };
}

export function createDeferredPublicationResult(
  input: SubmitToTapTapInput,
  setup: Pick<
    Awaited<ReturnType<typeof checkMakerSetup>>,
    "makerBundleExists" | "notes" | "operationLog"
  >,
) {
  const warning =
    setup.notes.join("; ") ||
    "Bundled Maker runtime is unavailable; TapTap publication was deferred.";
  return {
    ok: false,
    status: "deferred" as const,
    projectRoot: input.projectRoot,
    previewUrl: null,
    tool: "maker_build_current_directory" as const,
    command: [],
    text: `TapTap publication deferred: ${warning}`,
    isError: false,
    progress: [],
    stderr: "",
    warning,
    operationLog: setup.operationLog,
    preflight: {
      setup: "warning" as const,
      validation: "skipped" as const,
      readiness: "skipped" as const,
    },
  };
}
