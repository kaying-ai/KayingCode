import assert from "node:assert/strict";
import test from "node:test";

import {
  collectProtectedPids,
  isRepositoryDevProcess,
  parseArguments,
  parsePosixProcessSnapshot,
  parseWindowsProcessSnapshot,
  selectDevProcesses,
  selectKillRoots,
} from "./kill-dev-processes.mjs";

const repositoryRoot = "D:\\code\\kaying-office\\ZCode";
const windows = { repositoryRoot, platform: "win32" };
const nodeExecutable = "C:\\nvm4w\\nodejs\\node.exe";

function processInfo({ pid, parentPid = 0, name, executablePath = nodeExecutable, commandLine }) {
  return { pid, parentPid, name, executablePath, commandLine };
}

test("matches the tool processes of a real dev:desktop run", () => {
  const samples = [
    // tsup 的 CLI 子进程：命令行引用仓库内依赖，可执行文件是全局 node。
    processInfo({
      pid: 2856,
      name: "node.exe",
      commandLine:
        'node "D:\\code\\kaying-office\\ZCode\\apps\\kayingcode-desktop\\node_modules\\tsup\\dist\\cli-default.js" --watch src --watch ../../packages/services/src',
    }),
    // tsup / vite 的 .bin shim：命令行只有工具名，靠仓库内的可执行文件路径确认归属。
    processInfo({
      pid: 33168,
      name: "tsup.exe",
      executablePath:
        "D:\\code\\kaying-office\\ZCode\\apps\\kayingcode-desktop\\node_modules\\.bin\\tsup.exe",
      commandLine: "tsup --watch src --ignore-watch 'mock-cdn/**'",
    }),
    processInfo({
      pid: 31152,
      name: "vite.exe",
      executablePath:
        "D:\\code\\kaying-office\\ZCode\\apps\\kayingcode-desktop\\node_modules\\.bin\\vite.exe",
      commandLine: "vite dev",
    }),
    // vite 的 node 子进程：占用 5174 端口，是阻塞下一次 dev 启动的直接原因。
    processInfo({
      pid: 14612,
      name: "node.exe",
      commandLine:
        'node "D:\\code\\kaying-office\\ZCode\\apps\\kayingcode-desktop\\node_modules\\vite\\bin\\vite.js" dev',
    }),
    // tsup 共用的 esbuild service：放在 .bun 的版本化目录下。
    processInfo({
      pid: 16064,
      name: "esbuild.exe",
      executablePath:
        "D:\\code\\kaying-office\\ZCode\\node_modules\\.bun\\@esbuild+win32-x64@0.27.7\\node_modules\\@esbuild\\win32-x64\\esbuild.exe",
      commandLine:
        "D:\\code\\kaying-office\\ZCode\\node_modules\\.bun\\@esbuild+win32-x64@0.27.7\\node_modules\\@esbuild\\win32-x64\\esbuild.exe --service=0.27.7 --ping",
    }),
    // 开发启动器：命令行里只有相对路径，靠专属签名识别。
    processInfo({ pid: 900, name: "node.exe", commandLine: "node scripts/dev.mjs" }),
    processInfo({
      pid: 901,
      name: "node.exe",
      commandLine: "node scripts/dev-desktop-env.mjs production",
    }),
    processInfo({
      pid: 902,
      name: "node.exe",
      commandLine: "node scripts/dev-desktop-remote-prod.mjs",
    }),
    // concurrently 是整条链路里最高的一层，按树终止它等于一次回收 tsup + vite + Electron。
    processInfo({
      pid: 903,
      name: "node.exe",
      commandLine:
        'node "D:\\code\\kaying-office\\ZCode\\apps\\kayingcode-desktop\\node_modules\\concurrently\\dist\\bin\\concurrently.js" -k -n tsup,vite,electron "tsup --watch src" "vite dev" "node scripts/dev.mjs"',
    }),
    // dev Electron bundle 位于 packages/.kayingcode-runtime/desktop-dev 下。
    processInfo({
      pid: 904,
      name: "electron.exe",
      executablePath:
        "D:\\code\\kaying-office\\ZCode\\packages\\.kayingcode-runtime\\desktop-dev\\41.0.3-x64\\win32\\electron.exe",
      commandLine:
        '"D:\\code\\kaying-office\\ZCode\\packages\\.kayingcode-runtime\\desktop-dev\\41.0.3-x64\\win32\\electron.exe" .',
    }),
    // dev:web 的 workspace 任务：命令行同时出现包名与 dev。
    processInfo({ pid: 905, name: "bun.exe", commandLine: "bun run --filter @zcode/web dev" }),
  ];

  for (const sample of samples) {
    assert.equal(
      isRepositoryDevProcess(sample, windows),
      true,
      `expected match: ${sample.name} ${sample.commandLine}`,
    );
  }
});

test("matches mixed separators and letter case on Windows", () => {
  assert.equal(
    isRepositoryDevProcess(
      processInfo({
        pid: 1000,
        name: "node.exe",
        commandLine:
          'node "d:/CODE/kaying-office/zcode/packages/desktop/node_modules/tsup/dist/cli-default.js" --watch src',
      }),
      windows,
    ),
    true,
  );
});

test("keeps unrelated processes out of the match set", () => {
  const unrelated = [
    // 清理命令自身：引用仓库路径，但既不是开发工具产物，也不命中启动器签名。
    processInfo({
      pid: 2000,
      name: "node.exe",
      commandLine: "node D:\\code\\kaying-office\\ZCode\\scripts\\kill-dev-processes.mjs",
    }),
    // 带仓库路径的一次性 node 调用。
    processInfo({
      pid: 2001,
      name: "node.exe",
      commandLine:
        "node -e \"require('D:/code/kaying-office/ZCode/packages/desktop/package.json')\"",
    }),
    // 其他 MCP / agent 运行时。
    processInfo({
      pid: 2002,
      name: "node.exe",
      executablePath: "C:\\Users\\21499\\AppData\\Local\\OpenAI\\Codex\\bin\\node.exe",
      commandLine:
        "C:\\Users\\21499\\AppData\\Local\\OpenAI\\Codex\\bin\\node.exe C:\\Users\\21499\\cua-repl.mjs",
    }),
    processInfo({
      pid: 2003,
      name: "node.exe",
      commandLine:
        "C:\\nvm4w\\nodejs\\node.exe C:\\Users\\21499\\.taptap-maker\\mcp-runtime\\0.0.36\\dist\\maker.js",
    }),
    processInfo({
      pid: 2004,
      name: "node.exe",
      commandLine:
        "node C:\\Users\\21499\\npm-cache\\_npx\\15c61037\\node_modules\\chrome-devtools-mcp\\build\\src\\bin\\chrome-devtools-mcp.js",
    }),
    // 其他项目的同名工具：没有本仓库路径引用。
    processInfo({
      pid: 2005,
      name: "node.exe",
      commandLine: "node /home/dev/other-project/node_modules/vite/bin/vite.js dev",
    }),
    processInfo({
      pid: 2006,
      name: "vite.exe",
      executablePath: "C:\\Users\\21499\\AppData\\Roaming\\npm\\node_modules\\.bin\\vite.exe",
      commandLine: "vite dev",
    }),
    // 其他应用的 Electron。
    processInfo({
      pid: 2007,
      name: "electron.exe",
      executablePath: "C:\\Program Files\\SomeApp\\electron.exe",
      commandLine: '"C:\\Program Files\\SomeApp\\electron.exe" .',
    }),
    // 非工具进程名：即使引用仓库路径也不参与匹配。
    processInfo({
      pid: 2008,
      name: "Code.exe",
      commandLine: "C:\\Program Files\\Microsoft VS Code\\Code.exe D:\\code\\kaying-office\\ZCode",
    }),
    // 前缀相近的兄弟目录不能被当成仓库内路径。
    processInfo({
      pid: 2009,
      name: "node.exe",
      commandLine:
        'node "D:\\code\\kaying-office\\ZCode-playground\\node_modules\\vite\\bin\\vite.js" dev',
    }),
  ];

  for (const sample of unrelated) {
    assert.equal(
      isRepositoryDevProcess(sample, windows),
      false,
      `expected no match: ${sample.name} ${sample.commandLine}`,
    );
  }
});

test("matches POSIX processes by repository path in the command line", () => {
  const posix = { repositoryRoot: "/srv/kaying-office/ZCode", platform: "linux" };
  assert.equal(
    isRepositoryDevProcess(
      processInfo({
        pid: 3000,
        name: "node",
        executablePath: "/usr/local/bin/node",
        commandLine:
          "node /srv/kaying-office/ZCode/packages/desktop/node_modules/vite/bin/vite.js dev",
      }),
      posix,
    ),
    true,
  );
  assert.equal(
    isRepositoryDevProcess(
      processInfo({
        pid: 3001,
        name: "node",
        executablePath: "/usr/local/bin/node",
        commandLine: "node /srv/other-project/node_modules/vite/bin/vite.js dev",
      }),
      posix,
    ),
    false,
  );
});

test("excludes the current process and its ancestor chain", () => {
  const processes = [
    processInfo({ pid: 10, parentPid: 0, name: "bun.exe", commandLine: "bun run killall" }),
    processInfo({
      pid: 11,
      parentPid: 10,
      name: "node.exe",
      commandLine: "node scripts/kill-dev-processes.mjs",
    }),
    processInfo({ pid: 12, parentPid: 11, name: "node.exe", commandLine: "node scripts/dev.mjs" }),
  ];

  const protectedPids = collectProtectedPids(processes, 11);
  assert.deepEqual(
    [...protectedPids].sort((left, right) => left - right),
    [10, 11],
  );

  const matches = selectDevProcesses(processes, { ...windows, protectedPids });
  assert.deepEqual(
    matches.map((match) => match.pid),
    [12],
  );
});

test("selects only tree roots from the matched set", () => {
  const matches = [
    processInfo({ pid: 100, parentPid: 1, name: "node.exe", commandLine: "concurrently" }),
    processInfo({ pid: 101, parentPid: 100, name: "tsup.exe", commandLine: "tsup --watch src" }),
    processInfo({
      pid: 102,
      parentPid: 101,
      name: "esbuild.exe",
      commandLine: "esbuild --service",
    }),
    processInfo({ pid: 200, parentPid: 1, name: "vite.exe", commandLine: "vite dev" }),
  ];
  const parentByPid = new Map([
    [100, 1],
    [101, 100],
    [102, 101],
    [200, 1],
  ]);

  assert.deepEqual(
    selectKillRoots(matches, parentByPid).map((match) => match.pid),
    [100, 200],
  );
});

test("terminates the walk on a cyclic parent chain", () => {
  const matches = [
    processInfo({ pid: 300, parentPid: 301, name: "node.exe", commandLine: "concurrently" }),
    processInfo({ pid: 301, parentPid: 300, name: "vite.exe", commandLine: "vite dev" }),
  ];
  const parentByPid = new Map([
    [300, 301],
    [301, 300],
  ]);

  // 环上无法证明存在真实祖先，两项都按树根处理，保证匹配到的进程一定会被终止。
  assert.deepEqual(
    selectKillRoots(matches, parentByPid).map((match) => match.pid),
    [300, 301],
  );
});

test("parses the Windows snapshot in both object and array shape", () => {
  const single = parseWindowsProcessSnapshot(
    JSON.stringify({
      ProcessId: 7,
      ParentProcessId: 3,
      Name: "vite.exe",
      ExecutablePath: null,
      CommandLine: "vite dev",
    }),
  );
  assert.deepEqual(single, [
    { pid: 7, parentPid: 3, name: "vite.exe", executablePath: "", commandLine: "vite dev" },
  ]);
  assert.deepEqual(parseWindowsProcessSnapshot(""), []);
  assert.deepEqual(
    parseWindowsProcessSnapshot(
      JSON.stringify([{ ProcessId: 1, ParentProcessId: 0, Name: "node.exe" }, { Name: "broken" }]),
    ),
    [{ pid: 1, parentPid: 0, name: "node.exe", executablePath: "", commandLine: "" }],
  );
});

test("parses the POSIX snapshot", () => {
  assert.deepEqual(
    parsePosixProcessSnapshot(
      "    1     0 /sbin/init\n  120     1 node /srv/kaying-office/ZCode/packages/desktop/node_modules/vite/bin/vite.js dev\n",
    ),
    [
      { pid: 1, parentPid: 0, name: "init", executablePath: "", commandLine: "/sbin/init" },
      {
        pid: 120,
        parentPid: 1,
        name: "node",
        executablePath: "",
        commandLine:
          "node /srv/kaying-office/ZCode/packages/desktop/node_modules/vite/bin/vite.js dev",
      },
    ],
  );
});

test("parses arguments", () => {
  assert.deepEqual(parseArguments([]), { list: false, help: false });
  assert.deepEqual(parseArguments(["--list"]), { list: true, help: false });
  assert.deepEqual(parseArguments(["list"]), { list: true, help: false });
  assert.deepEqual(parseArguments(["--help"]), { list: false, help: true });
  assert.throws(() => parseArguments(["--force"]), /unknown option: --force/);
});
