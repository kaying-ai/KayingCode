/** Only parser-confirmed errors block publication; semantic hints depend on engine stubs. */
import { formatMakerLuaPreflightUnavailable, type MakerLuaPreflightResult } from "./lua-preflight";

export function assessLuaPublishDiagnostics(result: MakerLuaPreflightResult) {
  const diagnostics = result.diagnostics.filter((item) =>
    ["lua-syntax", "syntax-error", "parse-error"].includes(item.code ?? ""),
  );
  const blocking = diagnostics.length > 0;
  const warnings: string[] = [];
  if (result.status === "unavailable") warnings.push(formatMakerLuaPreflightUnavailable(result));
  if (result.reportedErrorCount > diagnostics.length) {
    warnings.push(
      `Lua semantic findings require review against engine APIs; publication may proceed. ${result.reportPath ?? ""}`.trim(),
    );
  }
  if (result.coverage === "syntax" && result.status === "passed" && !blocking) {
    warnings.push(
      "Lua syntax checked; semantic analysis was unavailable. Verify behavior in the preview.",
    );
  }
  return {
    blocking,
    warnings,
    failure: { ...result, diagnostics, errorCount: diagnostics.length },
  };
}
