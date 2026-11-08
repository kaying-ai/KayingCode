import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isExecutableFile, pathExists } from "../async-files";
import { getMakerHome } from "./paths";

export interface MakerLuaDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
}

export interface MakerLuaPreflightResult {
  status: "passed" | "failed" | "unavailable";
  coverage?: "semantic" | "syntax";
  projectRoot: string;
  scriptsPath: string;
  command?: string[];
  reportPath?: string;
  errorCount: number;
  reportedErrorCount: number;
  diagnostics: MakerLuaDiagnostic[];
  reportText?: string;
  note?: string;
}

interface MakerLuaLspConfig {
  status?: unknown;
  command?: unknown;
  checkerCommand?: unknown;
}

export interface MakerLuaPreflightSetup {
  ready: boolean;
  coverage: "semantic" | "syntax" | "unavailable";
  command: string | null;
  checkerCommand: string | null;
  syntaxCommand: string | null;
  note: string;
}

const LUA_LSP_TIMEOUT_MS = 2 * 60_000;
const LUA_LSP_MAX_BUFFER = 4 * 1024 * 1024;

/** Run the Maker Lua checker before any commit, push, or remote build. */
export async function runMakerLuaPreflight(
  projectRootInput: string,
  scriptsPathInput: string,
  operationId: string,
  signal?: AbortSignal,
): Promise<MakerLuaPreflightResult> {
  const projectRoot = path.resolve(projectRootInput);
  const scriptsPath = path.resolve(projectRoot, scriptsPathInput);
  const setup = await inspectMakerLuaPreflightSetup();
  if (!setup.ready || !setup.command) {
    return {
      status: "unavailable",
      projectRoot,
      scriptsPath,
      errorCount: 0,
      reportedErrorCount: 0,
      diagnostics: [],
      note: setup.note,
    };
  }
  const command = setup.command;
  if (setup.coverage === "syntax" && setup.syntaxCommand) {
    return await runLuaSyntaxPreflight(
      projectRoot,
      scriptsPath,
      operationId,
      setup.syntaxCommand,
      signal,
    );
  }

  const outputDir = path.join(
    projectRoot,
    ".maker",
    "logs",
    "kaying-for-taptap",
    "lua-diagnostics",
    operationId,
  );
  await mkdir(outputDir, { recursive: true });
  const args = ["--path", scriptsPath, "--output-dir", outputDir, "--mode", "check", "--quiet"];
  const executionError = await executeLuaLsp(
    command,
    args,
    projectRoot,
    setup.checkerCommand,
    signal,
  );
  const workingReportPath = path.join(outputDir, "lua_errors.log");
  if (!(await pathExists(workingReportPath))) {
    return {
      status: "unavailable",
      projectRoot,
      scriptsPath,
      command: [command, ...args],
      errorCount: 0,
      reportedErrorCount: 0,
      diagnostics: [],
      note: executionError ?? "maker-lua-lsp did not produce lua_errors.log.",
    };
  }

  const reportText = await readFile(workingReportPath, "utf8");
  const parsed = parseMakerLuaErrorReport(reportText);
  return {
    status:
      parsed.errorCount > 0
        ? "failed"
        : executionError || !/^Lua Errors:\s*\d+/m.test(reportText)
          ? "unavailable"
          : "passed",
    coverage: "semantic",
    projectRoot,
    scriptsPath,
    command: [command, ...args],
    reportPath: workingReportPath,
    errorCount: parsed.errorCount,
    reportedErrorCount: parsed.reportedErrorCount,
    diagnostics: parsed.diagnostics,
    reportText,
    ...(executionError ? { note: executionError } : {}),
  };
}

export function parseMakerLuaErrorReport(reportText: string): {
  errorCount: number;
  reportedErrorCount: number;
  diagnostics: MakerLuaDiagnostic[];
} {
  const reportedDiagnostics: MakerLuaDiagnostic[] = [];
  for (const line of reportText.split(/\r?\n/)) {
    const match = /^ERROR\s+\|\s+(.+?):(\d+):(\d+)\s+\|\s+(.+)$/.exec(line);
    if (!match) continue;
    const code = /\[([^\]]+)\]\s*$/.exec(match[4])?.[1];
    reportedDiagnostics.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[4],
      ...(code ? { code } : {}),
    });
  }
  const declaredCount = Number(/^Lua Errors:\s*(\d+)/m.exec(reportText)?.[1] ?? 0);
  const diagnostics = reportedDiagnostics.filter((item) => item.code !== "missing-parameter");
  return {
    errorCount: diagnostics.length,
    reportedErrorCount: Math.max(declaredCount, reportedDiagnostics.length),
    diagnostics,
  };
}

export function formatMakerLuaPreflightFailure(result: MakerLuaPreflightResult): string {
  const diagnosticLines = result.diagnostics
    .slice(0, 20)
    .map((item) => `- ${item.file}:${item.line}:${item.column} ${item.message}`);
  const omitted = result.errorCount - diagnosticLines.length;
  return [
    `TapTap submission blocked: ${result.errorCount} Lua publish diagnostic(s) must be fixed.`,
    "classification: lua_diagnostics_failed",
    ...diagnosticLines,
    ...(omitted > 0 ? [`- ... ${omitted} more error(s)`] : []),
    ...(result.reportPath ? [`diagnostic_log: ${result.reportPath}`] : []),
    "Fix the listed Lua errors, then retry publishing.",
  ].join("\n");
}

export function formatMakerLuaPreflightUnavailable(result: MakerLuaPreflightResult): string {
  return [
    "Local Lua diagnostics could not run; publication may proceed with remote build verification.",
    "classification: lua_diagnostics_unavailable",
    ...(result.note ? [`reason: ${result.note}`] : []),
    ...(result.reportPath ? [`diagnostic_log: ${result.reportPath}`] : []),
    "Recommendation: repair the local diagnostics installation and check the resulting preview.",
  ].join("\n");
}

export async function inspectMakerLuaPreflightSetup(): Promise<MakerLuaPreflightSetup> {
  const configPath = path.join(getMakerHome(), "lua-lsp.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8")) as MakerLuaLspConfig;
    const command =
      config.status === "ready" &&
      typeof config.command === "string" &&
      (await isExecutableFile(config.command))
        ? config.command
        : null;
    if (!command) {
      return {
        ready: false,
        coverage: "unavailable",
        command: null,
        checkerCommand: null,
        syntaxCommand: null,
        note: `maker-lua-lsp is missing or invalid in ${configPath}.`,
      };
    }
    const checkerCommand = await resolveEmmyLuaChecker(command, config.checkerCommand);
    const syntaxCommand = await resolveSiblingExecutable(command, "luaparser");
    return {
      ready: Boolean(checkerCommand || syntaxCommand),
      coverage: checkerCommand ? "semantic" : syntaxCommand ? "syntax" : "unavailable",
      command,
      checkerCommand,
      syntaxCommand,
      note: checkerCommand
        ? `Lua diagnostics ready: ${checkerCommand}`
        : syntaxCommand
          ? "emmylua_check is missing; Lua syntax diagnostics will use the bundled luaparser fallback."
          : "maker-lua-lsp is installed, but both emmylua_check and luaparser are missing.",
    };
  } catch {
    return {
      ready: false,
      coverage: "unavailable",
      command: null,
      checkerCommand: null,
      syntaxCommand: null,
      note: `maker-lua-lsp configuration is unreadable: ${configPath}.`,
    };
  }
}

async function resolveSiblingExecutable(command: string, name: string): Promise<string | null> {
  const executableName = process.platform === "win32" ? `${name}.exe` : name;
  const candidate = path.join(path.dirname(command), executableName);
  return (await isExecutableFile(candidate)) ? candidate : null;
}

async function resolveEmmyLuaChecker(command: string, configured: unknown): Promise<string | null> {
  const executableName = process.platform === "win32" ? "emmylua_check.exe" : "emmylua_check";
  const candidates = [
    typeof configured === "string" ? configured : "",
    path.join(path.dirname(command), executableName),
    ...readPathCandidates(executableName),
    ...(await readBundledCheckerCandidates(command, executableName)),
  ];
  for (const candidate of candidates) {
    if (candidate && (await isExecutableFile(candidate))) return candidate;
  }
  return null;
}

function readPathCandidates(executableName: string): string[] {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, executableName));
}

async function readBundledCheckerCandidates(
  command: string,
  executableName: string,
): Promise<string[]> {
  const venvRoot = path.dirname(path.dirname(command));
  const libraryRoot = path.join(venvRoot, "lib");
  try {
    return (await readdir(libraryRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("python"))
      .map((entry) =>
        path.join(libraryRoot, entry.name, "site-packages", "maker_lua_lsp", "bin", executableName),
      );
  } catch {
    return [];
  }
}

async function runLuaSyntaxPreflight(
  projectRoot: string,
  scriptsPath: string,
  operationId: string,
  command: string,
  signal?: AbortSignal,
): Promise<MakerLuaPreflightResult> {
  const outputDir = path.join(
    projectRoot,
    ".maker",
    "logs",
    "kaying-for-taptap",
    "lua-diagnostics",
    operationId,
  );
  await mkdir(outputDir, { recursive: true });
  const workingReportPath = path.join(outputDir, "lua_errors.log");
  const astPath = path.join(outputDir, "syntax.ast");
  const files = await collectLuaFiles(scriptsPath);
  const diagnostics: MakerLuaDiagnostic[] = [];
  for (const filePath of files) {
    const error = await executeLuaSyntaxParser(command, filePath, astPath, projectRoot, signal);
    if (!error) continue;
    if (!/line\s+\d+:\d+:|syntax errors?:/i.test(error)) {
      return {
        status: "unavailable",
        coverage: "syntax",
        projectRoot,
        scriptsPath,
        errorCount: diagnostics.length,
        reportedErrorCount: diagnostics.length,
        diagnostics,
        note: `Lua parser could not complete: ${error}`,
      };
    }
    const location = parseLuaParserError(error);
    diagnostics.push({
      file: path.relative(scriptsPath, filePath) || path.basename(filePath),
      line: location.line,
      column: location.column,
      message: location.message,
      code: "lua-syntax",
    });
  }
  const reportText = [
    `Lua Syntax Errors: ${diagnostics.length}`,
    ...diagnostics.map(
      (item) => `ERROR | ${item.file}:${item.line}:${item.column} | ${item.message} [lua-syntax]`,
    ),
  ].join("\n");
  await writeFile(workingReportPath, `${reportText}\n`, "utf8");
  return {
    status: diagnostics.length > 0 ? "failed" : "passed",
    coverage: "syntax",
    projectRoot,
    scriptsPath,
    command: [command, scriptsPath],
    reportPath: workingReportPath,
    errorCount: diagnostics.length,
    reportedErrorCount: diagnostics.length,
    diagnostics,
    reportText,
    note: "Syntax-only fallback used because emmylua_check is unavailable; semantic type diagnostics were not run.",
  };
}

async function collectLuaFiles(directory: string): Promise<string[]> {
  if (!(await pathExists(directory))) return [];
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectLuaFiles(candidate)));
    else if (entry.isFile() && entry.name.endsWith(".lua")) files.push(candidate);
  }
  return files.sort();
}

export function parseLuaParserError(value: string): {
  line: number;
  column: number;
  message: string;
} {
  const match = /line\s+(\d+):(\d+):\s*(.+)/i.exec(value);
  return {
    line: Number(match?.[1] ?? 1),
    column: Number(match?.[2] ?? 0) + 1,
    message: (match?.[3] ?? value).trim(),
  };
}

async function executeLuaSyntaxParser(
  command: string,
  filePath: string,
  outputPath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<string | null> {
  return await new Promise((resolve) => {
    execFile(
      command,
      [filePath, "--output", outputPath],
      { cwd, timeout: LUA_LSP_TIMEOUT_MS, maxBuffer: LUA_LSP_MAX_BUFFER, signal },
      (error, _stdout, stderr) => resolve(error ? (stderr || error.message).trim() : null),
    );
  });
}

async function executeLuaLsp(
  command: string,
  args: string[],
  cwd: string,
  checkerCommand: string | null,
  signal?: AbortSignal,
): Promise<string | null> {
  return await new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd,
        timeout: LUA_LSP_TIMEOUT_MS,
        maxBuffer: LUA_LSP_MAX_BUFFER,
        signal,
        env: checkerCommand
          ? {
              ...process.env,
              PATH: `${path.dirname(checkerCommand)}${path.delimiter}${process.env.PATH ?? ""}`,
            }
          : process.env,
      },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve(null);
          return;
        }
        resolve((stderr || error.message).trim());
      },
    );
  });
}
