/** Separate project defects from local architecture recommendations and missing evidence. */

interface ValidationCheck {
  name?: string;
  valid?: boolean;
  message?: string;
  severity?: string;
}

export function assessPublishValidation(value: unknown) {
  const data = (value as { data?: { success?: boolean; output?: unknown } } | null)?.data;
  const output = data?.output as
    | {
        valid?: boolean;
        checks?: ValidationCheck[];
        modular?: { checks?: ValidationCheck[]; surfaces?: { checks?: ValidationCheck[] } };
      }
    | undefined;
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!output || typeof output.valid !== "boolean" || data?.success !== true) {
    warnings.push(
      "Local project validation is unavailable or inconclusive; verify the remote build and preview.",
    );
    return { status: "warning" as const, warnings, errors };
  }
  for (const check of output.checks ?? []) {
    if (check.valid !== false) continue;
    const target = check.severity === "Warning" || check.severity === "Info" ? warnings : errors;
    target.push(`${check.name ?? "project"}: ${check.message ?? "validation failed"}`);
  }
  // Modular conventions use static heuristics and local manifests. They are useful
  // review findings but do not establish that a platform project cannot compile.
  for (const check of [
    ...(output.modular?.checks ?? []),
    ...(output.modular?.surfaces?.checks ?? []),
  ]) {
    if (check.valid === false) warnings.push(`${check.name}: ${check.message}`);
  }
  if (output.valid === false && errors.length === 0 && warnings.length === 0) {
    warnings.push(
      "Local validation reported invalid without actionable findings; inspect the remote build result.",
    );
  }
  return {
    status: errors.length
      ? ("error" as const)
      : warnings.length
        ? ("warning" as const)
        : ("passed" as const),
    warnings,
    errors,
  };
}
