import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { isMcpAddonSource } from "./addon-files.mjs";
import {
  addonModuleName,
  parseBlenderVersion,
  resolveBlenderPaths,
  safeToSavePreferences,
} from "./blender-paths.mjs";
import { findExecutable, pluginRoot, resolveConnection } from "./runtime.mjs";
import { verifyUpstream } from "./verify-upstream.mjs";

const execute = promisify(execFile);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const RESULT_PREFIX = "KAYING_BLENDER_SETUP ";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function accessOk(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function probeBlenderVersion(executable) {
  try {
    const { stdout, stderr } = await execute(executable, ["--version"], {
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      encoding: "utf8",
    });
    return parseBlenderVersion(`${stdout}\n${stderr}`);
  } catch {
    return null;
  }
}

function newerVersion(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

async function scanChildren(dir, predicate, toPath) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries.filter(predicate).map((entry) => toPath(join(dir, entry.name)));
}

export async function discoverBlender({ platform = process.platform, env = process.env, explicit } = {}) {
  // 显式路径优先且不回落，避免用户指定了 Blender 却被换成另一个版本。
  if (explicit) {
    const executable = resolve(explicit);
    const version = await probeBlenderVersion(executable);
    return {
      executable: version ? executable : null,
      version,
      candidates: [executable],
    };
  }
  const candidates = [];
  const onPath = await findExecutable("blender", { env });
  if (onPath) candidates.push(onPath);

  if (platform === "darwin") {
    for (const dir of ["/Applications", join(homedir(), "Applications")]) {
      candidates.push(
        ...(await scanChildren(
          dir,
          (entry) => entry.isDirectory() && /^Blender.*\.app$/.test(entry.name),
          (path) => join(path, "Contents", "MacOS", "Blender"),
        )),
      );
    }
  } else if (platform === "win32") {
    const roots = [
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs") : null,
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(
        ...(await scanChildren(
          join(root, "Blender Foundation"),
          (entry) => entry.isDirectory() && /^Blender\s/i.test(entry.name),
          (path) => join(path, "blender.exe"),
        )),
      );
    }
    const steam = join(
      env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      "Steam",
      "steamapps",
      "common",
      "Blender",
      "blender.exe",
    );
    candidates.push(steam);
  } else {
    candidates.push(
      "/snap/bin/blender",
      "/usr/bin/blender",
      "/usr/local/bin/blender",
      "/var/lib/flatpak/exports/bin/org.blender.Blender",
      join(homedir(), ".local/share/flatpak/exports/bin/org.blender.Blender"),
    );
  }

  const found = [];
  const seen = new Set();
  for (const path of candidates) {
    if (!isAbsolute(path) || seen.has(path)) continue;
    seen.add(path);
    if (!(await accessOk(path))) continue;
    const version = await probeBlenderVersion(path);
    if (version) found.push({ executable: path, version });
  }
  found.sort((left, right) => newerVersion(right.version, left.version));
  const best = found[0] ?? null;
  return {
    executable: best?.executable ?? null,
    version: best?.version ?? null,
    candidates: [...seen],
  };
}

export async function isBlenderRunning({ platform = process.platform } = {}) {
  try {
    if (platform === "win32") {
      // tasklist 输出使用 OEM 代码页；进程名是 ASCII，按 latin1 读取避免解码崩溃。
      const { stdout } = await execute(
        "tasklist",
        ["/FI", "IMAGENAME eq blender.exe", "/NH"],
        { encoding: "latin1", timeout: 15000, windowsHide: true },
      );
      return /blender\.exe/i.test(stdout);
    }
    try {
      await execute("pgrep", ["-xi", "blender"], { timeout: 15000 });
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        const { stdout } = await execute("ps", ["-A", "-o", "comm="], {
          encoding: "utf8",
          timeout: 15000,
        });
        return stdout
          .split(/\r?\n/)
          .some((line) => line.trim().split(/[\\/]/).pop() === "blender");
      }
      // pgrep 退出码 1 表示没有匹配进程。
      return false;
    }
  } catch {
    return false;
  }
}

async function scanAddonDir(dir) {
  const matches = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return matches;
    throw error;
  }
  for (const entry of entries) {
    let path;
    if (entry.isFile() && entry.name.endsWith(".py")) path = join(dir, entry.name);
    else if (entry.isDirectory()) path = join(dir, entry.name, "__init__.py");
    else continue;
    let source;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (isMcpAddonSource(source)) matches.push({ path, source });
  }
  return matches;
}

function enableScript(savePreferences) {
  return `
import json, sys, addon_utils, bpy
module = sys.argv[sys.argv.index("--") + 1]
names = {"MCP for Blender", "Blender MCP"}
result = {"already": [], "enabled": False, "saved": False, "error": None}
try:
    enabled = {entry.module for entry in bpy.context.preferences.addons}
    for candidate in addon_utils.modules(refresh=True):
        if candidate.__name__ in enabled and addon_utils.module_bl_info(candidate).get("name") in names:
            result["already"].append(candidate.__name__)
    if not result["already"]:
        result["enabled"] = addon_utils.enable(module, default_set=True) is not None
        if result["enabled"] and ${savePreferences ? "True" : "False"}:
            bpy.ops.wm.save_userpref()
            result["saved"] = True
        elif not result["enabled"]:
            result["error"] = "Blender couldn't load " + module
except Exception as error:
    result["error"] = str(error)
print("${RESULT_PREFIX}" + json.dumps(result))
`;
}

export async function enableAddonHeadless({
  executable,
  module,
  savePreferences = true,
  env = process.env,
} = {}) {
  try {
    const { stdout, stderr } = await execute(
      executable,
      [
        "--background",
        // 不加载 .blend 里的自动执行脚本；仍然读取用户偏好，避免用工厂设置覆盖。
        "--disable-autoexec",
        "--python-exit-code",
        "1",
        "--python-expr",
        enableScript(savePreferences),
        "--",
        module,
      ],
      {
        encoding: "utf8",
        env: { ...env, BLENDERMCP_NO_UPDATE_CHECK: "1", DISABLE_TELEMETRY: "true" },
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120000,
        windowsHide: true,
      },
    );
    const line = `${stdout}\n${stderr}`
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(RESULT_PREFIX));
    if (!line) {
      return {
        enabled: false,
        alreadyEnabled: false,
        savedPreferences: false,
        error: "Blender 退出前未返回启用结果。",
      };
    }
    const result = JSON.parse(line.slice(RESULT_PREFIX.length));
    const alreadyEnabled = Array.isArray(result.already) && result.already.length > 0;
    return {
      enabled: Boolean(result.enabled) || alreadyEnabled,
      alreadyEnabled,
      savedPreferences: Boolean(result.saved),
      error: typeof result.error === "string" ? result.error : null,
    };
  } catch (error) {
    const timedOut = error.killed || error.code === "ETIMEDOUT";
    return {
      enabled: false,
      alreadyEnabled: false,
      savedPreferences: false,
      error: timedOut
        ? "启用 Blender add-on 超时；请确认 Blender 可正常启动后重试。"
        : error.message,
    };
  }
}

export async function installAddon({
  root = pluginRoot,
  env = process.env,
  platform = process.platform,
  executable,
  dryRun = true,
  blender: providedBlender,
  isRunning = () => isBlenderRunning({ platform }),
  enable = enableAddonHeadless,
} = {}) {
  const report = {
    ok: false,
    dryRun,
    requiresConfirmation: dryRun,
    addon: null,
    blender: null,
    target: null,
    enabled: false,
    alreadyEnabled: false,
    savedPreferences: false,
    needsRestart: false,
    blockers: [],
    nextAction: "",
  };
  const block = (id, message, details = {}) => {
    report.blockers.push({ id, message, ...details });
    report.nextAction = message;
    return report;
  };

  let lock;
  try {
    lock = await verifyUpstream(root);
  } catch (error) {
    return block("snapshot-invalid", `随包快照校验失败：${error.message}`);
  }
  report.addon = {
    version: lock.version,
    protocol: lock.addonProtocol,
    sha256: lock.files["addon.py"],
  };

  let connection;
  try {
    connection = resolveConnection(env);
  } catch (error) {
    return block("invalid-connection", error.message);
  }
  if (!LOCAL_HOSTS.has(connection.host)) {
    return block(
      "remote-host",
      `BLENDER_HOST=${connection.host} 指向远端；请在运行 Blender 的主机安装随包 add-on，再运行 /blender-doctor。`,
    );
  }

  const addonPath = join(root, "vendor/mcp-for-blender/addon.py");
  const bytes = await readFile(addonPath);
  if (sha256(bytes) !== lock.files["addon.py"]) {
    return block("addon-mismatch", "随包 add-on 字节与 lock 不一致；恢复插件后重试。");
  }

  const discovered =
    providedBlender ?? (await discoverBlender({ platform, env, explicit: executable }));
  if (!discovered?.executable || !discovered.version) {
    return block("blender-not-found", "未找到可用的 Blender；设置 BLENDER_EXECUTABLE 或确认已安装后重试。", {
      candidates: discovered?.candidates ?? [],
    });
  }
  const paths = resolveBlenderPaths({ platform, env, version: discovered.version });
  report.blender = {
    executable: discovered.executable,
    version: discovered.version.label,
    versionDir: paths.versionDir,
  };
  report.target = {
    addonsDir: paths.addonsDir,
    configDir: paths.configDir,
    addonPath: null,
    module: null,
    action: null,
    backupPath: null,
    updatedPaths: [],
  };

  if (paths.requiresInitialization && !(await accessOk(paths.versionDir))) {
    return block(
      "blender-not-initialized",
      `Blender ${discovered.version.major}.${discovered.version.minor} 的配置目录尚未创建：先打开一次 Blender 完成初始化，然后重试。`,
      { versionDir: paths.versionDir },
    );
  }

  const legacy = await scanAddonDir(paths.addonsDir);
  const extensions = await scanAddonDir(paths.extensionsDir);
  if (extensions.length) {
    return block(
      "extension-install",
      `发现 extensions 目录中的既有副本：${extensions[0].path}。为避免破坏扩展元数据，请手动更新或先移除该副本。`,
      { paths: extensions.map((item) => item.path) },
    );
  }

  const primaryTarget = legacy[0]?.path ?? join(paths.addonsDir, "mcp_for_blender_addon.py");
  const targets = legacy.length ? legacy.map((item) => item.path) : [primaryTarget];
  const module = addonModuleName(primaryTarget);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(module) && !module.startsWith("bl_ext.")) {
    return block("invalid-module", `目标文件名无法作为 Blender 模块加载：${primaryTarget}`);
  }
  report.target.addonPath = primaryTarget;
  report.target.module = module;
  report.target.updatedPaths = [];

  const states = await Promise.all(
    targets.map(async (path) => {
      let current = null;
      try {
        current = await readFile(path);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return { path, current };
    }),
  );
  const missing = states.filter((state) => state.current === null);
  const stale = states.filter(
    (state) => state.current !== null && !state.current.equals(bytes),
  );
  report.target.action =
    missing.length === states.length ? "install" : stale.length ? "update" : "none";

  if (await isRunning()) {
    return block(
      "blender-running",
      "Blender 正在运行；请先保存并退出 Blender，避免用户偏好被退出时覆盖，然后重试。",
    );
  }

  const savePreferences = await safeToSavePreferences({ paths, env });
  if (!savePreferences) {
    return block(
      "blender-first-launch",
      `Blender ${discovered.version.major}.${discovered.version.minor} 尚未初始化用户偏好；先打开一次 Blender 并完成设置迁移选择，然后重试。`,
    );
  }

  if (dryRun) {
    report.ok = true;
    report.needsRestart = true;
    report.requiresConfirmation = true;
    report.nextAction =
      "确认后将安装并启用 add-on；完成后打开或重启 Blender，再运行 /blender-doctor。";
    return report;
  }

  await mkdir(paths.addonsDir, { recursive: true });
  for (const state of states) {
    const differs = state.current === null || !state.current.equals(bytes);
    if (state.current !== null && differs) {
      const backupPath = `${state.path}.bak`;
      await writeFile(backupPath, state.current);
      report.target.backupPath ||= backupPath;
    }
    if (!differs) continue;
    await writeFile(state.path, bytes);
    const written = await readFile(state.path);
    if (!written.equals(bytes)) {
      return block("verify-failed", `写入后校验失败：${state.path}`);
    }
    report.target.updatedPaths.push(state.path);
  }

  const result = await enable({
    executable: discovered.executable,
    module,
    savePreferences,
    env,
  });
  report.alreadyEnabled = Boolean(result.alreadyEnabled);
  report.savedPreferences = Boolean(result.savedPreferences);
  report.enabled = Boolean(result.enabled) || report.alreadyEnabled;
  if (!report.enabled) {
    return block("enable-failed", result.error || "Blender 未能启用 add-on；请按手动步骤操作。", {
      target: primaryTarget,
      module,
    });
  }

  report.ok = true;
  report.needsRestart = true;
  report.nextAction =
    "安装完成。打开或重启 Blender；add-on 默认自动启动服务，然后运行 /blender-doctor 验证。";
  return report;
}
