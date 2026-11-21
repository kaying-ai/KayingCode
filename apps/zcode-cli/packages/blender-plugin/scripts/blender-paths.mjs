import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export function parseBlenderVersion(text) {
  const match = /Blender\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(text || "");
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] ? Number(match[3]) : 0,
    label: match[3] ? `${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}`,
  };
}

export function blenderConfigBase(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const appdata = env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appdata, "Blender Foundation", "Blender");
  }
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "Blender");
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "blender");
}

function expandHome(value) {
  return value.startsWith("~/") ? join(homedir(), value.slice(2)) : resolve(value);
}

export function resolveBlenderPaths({
  platform = process.platform,
  env = process.env,
  version,
} = {}) {
  if (!version || !Number.isInteger(version.major) || !Number.isInteger(version.minor))
    throw new Error("Blender version is required");
  const scriptsOverride = env.BLENDER_USER_SCRIPTS
    ? expandHome(env.BLENDER_USER_SCRIPTS)
    : null;
  const configOverride = env.BLENDER_USER_CONFIG ? expandHome(env.BLENDER_USER_CONFIG) : null;

  if (configOverride) {
    const configDir = configOverride;
    // BLENDER_USER_CONFIG 指向版本目录下的 config；兼容直接指向版本目录的用法。
    const versionDir =
      basename(configDir).toLowerCase() === "config" ? dirname(configDir) : configDir;
    const scriptsDir = scriptsOverride || join(versionDir, "scripts");
    return {
      custom: true,
      base: versionDir,
      versionDir,
      configDir,
      scriptsDir,
      addonsDir: join(scriptsDir, "addons"),
      extensionsDir: join(versionDir, "extensions", "user_default"),
      userpref: join(configDir, "userpref.blend"),
      requiresInitialization: false,
    };
  }

  const base = blenderConfigBase(platform, env);
  const versionDir = join(base, `${version.major}.${version.minor}`);
  const configDir = join(versionDir, "config");
  const scriptsDir = scriptsOverride || join(versionDir, "scripts");
  return {
    custom: false,
    base,
    versionDir,
    configDir,
    scriptsDir,
    addonsDir: join(scriptsDir, "addons"),
    extensionsDir: join(versionDir, "extensions", "user_default"),
    userpref: join(configDir, "userpref.blend"),
    requiresInitialization: true,
  };
}

export async function safeToSavePreferences({ paths, env = process.env }) {
  // 显式自定义配置由调用方负责隔离，不存在版本迁移被覆盖的问题。
  if (env.BLENDER_USER_CONFIG) return true;
  try {
    await access(paths.userpref);
    return true;
  } catch {
    /* 新版本还没有用户偏好。 */
  }
  const entries = await readdir(paths.base, { withFileTypes: true }).catch(() => []);
  const targetName = basename(paths.versionDir);
  // 其他版本已有目录时，保存偏好会吞掉 Blender 的设置迁移选择。
  return !entries.some(
    (entry) => entry.isDirectory() && /^\d+\.\d+$/.test(entry.name) && entry.name !== targetName,
  );
}

export function addonModuleName(targetPath) {
  const segments = resolve(targetPath).split(/[\\/]/);
  const userDefault = segments.lastIndexOf("user_default");
  if (
    userDefault > 0 &&
    segments[userDefault - 1] === "extensions" &&
    segments.length > userDefault + 2
  )
    return `bl_ext.user_default.${segments[userDefault + 1]}`;
  return basename(targetPath, ".py");
}
