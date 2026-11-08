import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOURCE_SERVER_REMOTE_RELEASE_TARGETS,
  beginSourceServerRemoteReleaseGeneration,
  collectSourceServerRemoteReleaseArchives,
} from "./remoteAssetRelease.js";

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  // Bug 原因：Windows 上 pnpm 只以 cmd shim 存在，直接 spawn("pnpm") 会 ENOENT，
  // `stage:remote-assets` 在 Windows 完全不可用。由 cmd.exe 解析 shim（不改写成
  // pnpm.cmd，避免 pnpm exec 的包上下文漂移），并按 cmd 规则给含空格的参数补引号。
  const useShell = process.platform === "win32";
  const spawnArgs = useShell ? args.map((arg) => (/\s/u.test(arg) ? `"${arg}"` : arg)) : [...args];
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, spawnArgs, {
      cwd,
      env,
      stdio: "inherit",
      ...(useShell ? { shell: true } : {}),
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const linuxOnly = process.argv.slice(2).includes("--linux");
  const targets = linuxOnly
    ? SOURCE_SERVER_REMOTE_RELEASE_TARGETS.filter((target) => target.startsWith("linux-"))
    : SOURCE_SERVER_REMOTE_RELEASE_TARGETS;
  const env = { ...process.env };
  if (linuxOnly) {
    // Linux 开发入口与 dev:desktop 共用 production 默认值，避免远端模型配置退回 test。
    // 原全平台入口继续沿用通用构建器的环境选择规则。
    const kayingcodeEnv = env.KAYINGCODE_ENV?.trim().toLowerCase() || "production";
    if (kayingcodeEnv !== "test" && kayingcodeEnv !== "production") {
      throw new Error(`Invalid KAYINGCODE_ENV for prepare:remote-assets:linux: ${kayingcodeEnv}`);
    }
    env.KAYINGCODE_ENV = kayingcodeEnv;
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const repoRoot = resolve(packageRoot, "../..");
  const { version } = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const versionReleaseDir = join(repoRoot, "packages/desktop/mock-cdn/releases", version);
  await beginSourceServerRemoteReleaseGeneration({ versionReleaseDir });
  await run("pnpm", ["--filter", "@zcode/server-cli", "build"], repoRoot, env);
  for (const [index, target] of targets.entries()) {
    await run(
      "pnpm",
      [
        "--filter",
        "@zcode/server-cli",
        "exec",
        "tsx",
        "src/packaging/stageCli.ts",
        "--target",
        target,
        ...(linuxOnly ? ["--skip-component-archives"] : []),
        ...(index === 0 ? [] : ["--skip-agent-build"]),
      ],
      repoRoot,
      env,
    );
  }
  const collected = await collectSourceServerRemoteReleaseArchives({
    distReleaseDir: join(packageRoot, "dist-release"),
    versionReleaseDir,
    version,
    targets,
  });
  for (const path of collected) console.log(`[source-server-release] ${path}`);
}

await main();
