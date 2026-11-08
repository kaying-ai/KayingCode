import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function inspectAddonFiles(expectedProtocol, env = process.env) {
  const home = homedir();
  const base =
    process.platform === "darwin"
      ? join(home, "Library/Application Support/Blender")
      : process.platform === "win32"
        ? join(env.APPDATA || join(home, "AppData/Roaming"), "Blender Foundation/Blender")
        : join(env.XDG_CONFIG_HOME || join(home, ".config"), "blender");
  const dirs = [];
  const explicit = env.BLENDER_USER_ADDONS || env.BLENDERMCP_ADDONS_DIR;
  if (explicit) dirs.push(explicit.startsWith("~/") ? join(home, explicit.slice(2)) : explicit);
  try {
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\d+\.\d+$/.test(entry.name)) {
        dirs.push(
          join(base, entry.name, "scripts/addons"),
          join(base, entry.name, "extensions/user_default"),
        );
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const installed = [];
  for (const dir of new Set(dirs)) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!(entry.isFile() && entry.name.endsWith(".py")) && !entry.isDirectory()) continue;
      const path = entry.isDirectory()
        ? join(dir, entry.name, "__init__.py")
        : join(dir, entry.name);
      let source;
      try {
        source = await readFile(path, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (!/["']name["']\s*:\s*["'](?:MCP for Blender|Blender MCP)["']/.test(source)) continue;
      const protocol = Number(source.match(/^ADDON_PROTOCOL_VERSION\s*=\s*(\d+)/m)?.[1]) || null;
      installed.push({ path, protocol });
    }
  }
  return {
    id: "addon-files",
    status:
      installed.length && installed.every((item) => item.protocol === expectedProtocol)
        ? "pass"
        : "warning",
    evidence: installed.length
      ? installed.map((item) => `${item.path}: protocol ${item.protocol ?? "未知"}`).join("\n")
      : "未在当前用户 Blender 配置中发现 add-on；其他配置目录的安装状态未知。",
    suggestion:
      installed.length && installed.every((item) => item.protocol === expectedProtocol)
        ? "磁盘文件匹配不代表已加载；以运行中的握手为准。"
        : "在实际使用的 Blender 版本中安装随包 add-on 并重启；若有多个 Blender 版本，确认正在运行哪一个。磁盘检查不判断启用状态。",
  };
}
