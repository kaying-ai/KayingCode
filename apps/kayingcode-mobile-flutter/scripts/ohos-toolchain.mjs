import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

async function exists(path, fileOnly = false) {
  try {
    const metadata = await stat(path);
    return !fileOnly || metadata.isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function inspectDevecoSdk(supplied, supportedCompileApis) {
  if (!supplied || !isAbsolute(supplied)) {
    throw new Error(
      `请通过 DEVECO_SDK_HOME 或 configure 指定 HarmonyOS SDK 根目录（编译 API ${supportedCompileApis.join("/")}）。`,
    );
  }
  const sdk = await realpath(supplied);
  const metadata = JSON.parse(await readFile(join(sdk, "default", "sdk-pkg.json"), "utf8"));
  const api = Number(metadata.data?.apiVersion);
  if (!supportedCompileApis.includes(api)) {
    throw new Error(
      `HarmonyOS 默认 SDK API ${Number.isInteger(api) ? api : "未检测到"} 不兼容；允许编译 API ${supportedCompileApis.join("/")}。API 23 已知会触发 CPF Flutter ArkTS 编译错误。`,
    );
  }
  const toolRoot = dirname(sdk);
  const commandName = (name) => (process.platform === "win32" ? `${name}.bat` : name);
  const candidateDirs = [
    join(toolRoot, "bin"),
    join(toolRoot, "tools", "ohpm", "bin"),
    join(toolRoot, "tools", "hvigor", "bin"),
  ];
  async function findToolDir(name) {
    for (const dir of candidateDirs) {
      if (await exists(join(dir, commandName(name)), true)) return dir;
    }
    return null;
  }
  const ohpmDir = await findToolDir("ohpm");
  const hvigorDir = await findToolDir("hvigorw");
  const hdcDir = join(sdk, "default", "openharmony", "toolchains");
  if (
    !ohpmDir ||
    !hvigorDir ||
    !(await exists(join(hdcDir, process.platform === "win32" ? "hdc.exe" : "hdc"), true))
  ) {
    throw new Error(
      `所选 SDK ${sdk} 缺少配套的 ohpm、hvigorw 或 hdc；请指向 DevEco Studio / Command Line Tools 的 sdk 目录。`,
    );
  }
  const nodeDir = join(toolRoot, "tools", "node");
  const toolDirs = [
    ...new Set([ohpmDir, hvigorDir, hdcDir, ...((await exists(nodeDir)) ? [nodeDir] : [])]),
  ];
  return { sdk, api, toolDirs };
}
