import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// stdout 可能出现非 ASCII 路径；先固定管道输出编码，避免 PowerShell 5.1 按 OEM 代码页
// 写出、Node 再按 UTF-8 解码后得到乱码，进而让仓库路径匹配失效。
const WINDOWS_SNAPSHOT_SCRIPT = [
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8;",
  "$ErrorActionPreference='Stop';",
  "@(Get-CimInstance Win32_Process) | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress -Depth 3",
].join("");

// 只在这几个工具进程名上匹配，避免把编辑器、MCP 服务等其他 node 进程当成开发残留。
const DEV_TOOL_PROCESS_NAMES = new Set(["node", "bun", "vite", "tsup", "esbuild", "electron"]);

// 这些工具由仓库通过依赖安装，可执行文件落在仓库内即可确认归属：
// `.bin` shim、真实二进制与 dev Electron bundle 都在仓库目录下。
const REPOSITORY_LOCAL_TOOL_NAMES = new Set(["vite", "tsup", "esbuild", "electron"]);

// node/bun 承载的构建进程：除引用仓库路径外，还要命中依赖目录里的开发工具产物。
const REPOSITORY_DEV_MARKERS = [
  /node_modules[\\/]tsup[\\/]/,
  /node_modules[\\/]vite[\\/]/,
  /node_modules[\\/]esbuild[\\/]/,
  /@esbuild[+\\/]/,
  /node_modules[\\/]electron[\\/]/,
  /node_modules[\\/]concurrently[\\/]/,
];

// 本仓库专属启动器签名：命令行出现这些字符串即可确认归属，命令行里通常只有相对路径。
const KAYINGCODE_LAUNCHER_SIGNATURE = /scripts[\\/]dev(-desktop-env|-desktop-remote-prod)?\.mjs/i;

const KAYINGCODE_PACKAGE_REFERENCE = /@kayingcode\//i;
const DEV_TASK_REFERENCE = /(?:^|\s)dev(?::[\w-]+)?(?:\s|$)/i;

const USAGE = `Usage: pnpm run killall [-- --list]

  (no flags)  stop leftover KayingCode dev processes (tsup / vite / esbuild / Electron / concurrently)
  --list      only list the matched processes, stop nothing
  --help      show this message
`;

function processNameKey(name) {
  return String(name ?? "")
    .replace(/\.exe$/i, "")
    .toLowerCase();
}

function normalizeForComparison(value, platform) {
  const normalized = String(value ?? "").replace(/\\/g, "/");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function referencesRepository(haystack, root, platform) {
  const normalizedRoot = normalizeForComparison(root, platform).replace(/\/+$/, "");
  if (!normalizedRoot) return false;
  const normalizedHaystack = normalizeForComparison(haystack, platform);
  return normalizedHaystack === normalizedRoot || normalizedHaystack.includes(`${normalizedRoot}/`);
}

export function isRepositoryDevProcess(
  processInfo,
  { repositoryRoot: root, platform = process.platform } = {},
) {
  const name = processNameKey(processInfo?.name);
  if (!DEV_TOOL_PROCESS_NAMES.has(name)) return false;

  const commandLine = String(processInfo?.commandLine ?? "");
  if (KAYINGCODE_LAUNCHER_SIGNATURE.test(commandLine)) return true;
  if (KAYINGCODE_PACKAGE_REFERENCE.test(commandLine) && DEV_TASK_REFERENCE.test(commandLine)) {
    return true;
  }

  const executablePath = String(processInfo?.executablePath ?? "");
  if (
    REPOSITORY_LOCAL_TOOL_NAMES.has(name) &&
    referencesRepository(executablePath, root, platform)
  ) {
    return true;
  }

  const haystack = `${commandLine}\n${executablePath}`;
  if (!referencesRepository(haystack, root, platform)) return false;
  return REPOSITORY_DEV_MARKERS.some((marker) => marker.test(haystack));
}

export function parseWindowsProcessSnapshot(stdout) {
  const trimmed = String(stdout ?? "").trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const processes = [];
  for (const entry of entries) {
    const pid = Number(entry?.ProcessId);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    processes.push({
      pid,
      parentPid: Number(entry?.ParentProcessId) || 0,
      name: String(entry?.Name ?? ""),
      executablePath: String(entry?.ExecutablePath ?? ""),
      commandLine: String(entry?.CommandLine ?? ""),
    });
  }
  return processes;
}

export function parsePosixProcessSnapshot(stdout) {
  const processes = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line);
    if (!match) continue;
    const commandLine = match[3];
    processes.push({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      name: basename(commandLine.split(/\s+/)[0] ?? ""),
      executablePath: "",
      commandLine,
    });
  }
  return processes;
}

function readWindowsProcessSnapshot(run) {
  const failures = [];
  for (const command of ["powershell.exe", "pwsh"]) {
    const result = run(
      command,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_SNAPSHOT_SCRIPT],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.error && result.error.code === "ENOENT") {
      failures.push(`${command}: not found`);
      continue;
    }
    if (result.error) throw result.error;
    if (result.status !== 0) {
      failures.push(`${command}: exit ${result.status} ${String(result.stderr ?? "").trim()}`);
      continue;
    }
    return parseWindowsProcessSnapshot(result.stdout);
  }
  throw new Error(`failed to read the process list:\n${failures.join("\n")}`);
}

export function readProcessSnapshot({ platform = process.platform, run = spawnSync } = {}) {
  if (platform === "win32") return readWindowsProcessSnapshot(run);
  const result = run("ps", ["-eo", "pid=,ppid=,args="], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ps exited with code ${result.status}: ${String(result.stderr ?? "").trim()}`);
  }
  return parsePosixProcessSnapshot(result.stdout);
}

// 当前进程与它的祖先链必须排除：清理命令本身也是 node 进程，杀掉调用者会让输出和退出码一起丢失。
export function collectProtectedPids(processes, pid) {
  const parentByPid = new Map(
    processes.map((processInfo) => [processInfo.pid, processInfo.parentPid]),
  );
  const protectedPids = new Set([pid]);
  let current = parentByPid.get(pid);
  while (Number.isInteger(current) && current > 0 && !protectedPids.has(current)) {
    protectedPids.add(current);
    current = parentByPid.get(current);
  }
  return protectedPids;
}

export function selectDevProcesses(
  processes,
  { repositoryRoot: root, platform = process.platform, protectedPids = new Set() } = {},
) {
  return processes
    .filter((processInfo) => !protectedPids.has(processInfo.pid))
    .filter((processInfo) =>
      isRepositoryDevProcess(processInfo, { repositoryRoot: root, platform }),
    )
    .sort((left, right) => left.pid - right.pid);
}

// 匹配集合里若某项的祖先也匹配，它会随祖先的整树终止一起退出，只保留树根，
// 避免重复终止已经退出的进程。
function hasMatchedAncestor(processInfo, matchedPids, parentByPid) {
  const chain = [];
  let current = processInfo.pid;
  while (Number.isInteger(current) && current > 0) {
    // 真实进程树不可能成环（父进程必然先于子进程存在），出现回边只可能是 pid 被复用。
    // 此时链无法到达真实祖先，按树根处理，保证匹配到的进程仍会被终止。
    if (chain.includes(current)) return false;
    chain.push(current);
    current = parentByPid.get(current);
  }
  return chain.slice(1).some((pid) => matchedPids.has(pid));
}

export function selectKillRoots(matches, parentByPid) {
  const matchedPids = new Set(matches.map((match) => match.pid));
  return matches.filter((match) => !hasMatchedAncestor(match, matchedPids, parentByPid));
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM 说明进程存在但当前用户无权发信号，仍按存活处理。
    return error.code === "EPERM";
  }
}

function terminateWindowsProcessTrees(pids) {
  const warnings = [];
  for (const pid of pids) {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    // 进程已退出时 taskkill 同样返回非 0，且文案随系统语言变化。这里只记录，
    // 真正结论由终止后重新读取进程表得出。
    if (result.error) warnings.push(`taskkill ${pid}: ${result.error.message}`);
    else if (result.status !== 0)
      warnings.push(`taskkill ${pid}: ${String(result.stderr ?? "").trim()}`);
  }
  return warnings;
}

async function terminatePosixProcesses(pids, graceMs = 2_000) {
  const warnings = [];
  const signal = (pid, name) => {
    try {
      process.kill(pid, name);
    } catch (error) {
      if (error.code !== "ESRCH") warnings.push(`${name} ${pid}: ${error.message}`);
    }
  };
  // 这里不按进程组发送信号：kill(-pgid) 有可能命中当前清理命令自己所在的进程组。
  for (const pid of pids) signal(pid, "SIGTERM");
  await sleep(graceMs);
  for (const pid of pids) {
    if (isProcessAlive(pid)) signal(pid, "SIGKILL");
  }
  return warnings;
}

function findSurvivors(pids, { platform = process.platform, run = spawnSync } = {}) {
  if (platform !== "win32") return pids.filter((pid) => isProcessAlive(pid));
  const alive = new Set(readProcessSnapshot({ platform, run }).map((entry) => entry.pid));
  return pids.filter((pid) => alive.has(pid));
}

function truncate(value, maxLength) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatProcessLine(processInfo, isRoot) {
  const marker = isRoot ? "[tree]" : "      ";
  const pid = String(processInfo.pid).padStart(7);
  const name = truncate(processInfo.name, 12).padEnd(12);
  return `${marker}${pid} ${name} ${truncate(processInfo.commandLine || processInfo.executablePath, 130)}`;
}

export function parseArguments(argv) {
  const options = { list: false, help: false };
  for (const argument of argv) {
    if (argument === "--list" || argument === "-l" || argument === "list") options.list = true;
    else if (argument === "--help" || argument === "-h" || argument === "help") options.help = true;
    else if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const platform = process.platform;
  const processes = readProcessSnapshot({ platform });
  const protectedPids = collectProtectedPids(processes, process.pid);
  const matches = selectDevProcesses(processes, {
    repositoryRoot,
    platform,
    protectedPids,
  });

  process.stdout.write(`[dev-cleanup] repository: ${repositoryRoot}\n`);
  if (matches.length === 0) {
    process.stdout.write("[dev-cleanup] no leftover dev processes\n");
    return 0;
  }

  const parentByPid = new Map(processes.map((entry) => [entry.pid, entry.parentPid]));
  const roots = selectKillRoots(matches, parentByPid);
  const rootPids = new Set(roots.map((root) => root.pid));

  process.stdout.write(`[dev-cleanup] matched ${matches.length} process(es):\n`);
  for (const match of matches)
    process.stdout.write(`${formatProcessLine(match, rootPids.has(match.pid))}\n`);

  if (options.list) {
    process.stdout.write("[dev-cleanup] --list: nothing was stopped\n");
    return 0;
  }

  process.stdout.write(`[dev-cleanup] stopping ${roots.length} process tree(s)...\n`);
  const warnings =
    platform === "win32"
      ? terminateWindowsProcessTrees(roots.map((root) => root.pid))
      : await terminatePosixProcesses(matches.map((match) => match.pid));

  const survivors = findSurvivors(
    matches.map((match) => match.pid),
    { platform },
  );
  // taskkill 的失败原因无法可靠区分"进程已退出"与"拒绝访问"，只有校验发现仍有存活时才值得输出。
  if (survivors.length > 0) {
    for (const warning of warnings) {
      process.stdout.write(`[dev-cleanup] warning: ${warning}\n`);
    }
    process.stderr.write(
      `[dev-cleanup] ${survivors.length} process(es) still running: ${survivors.join(", ")}\n`,
    );
    return 1;
  }

  process.stdout.write(`[dev-cleanup] stopped ${matches.length} process(es)\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `[dev-cleanup] ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
