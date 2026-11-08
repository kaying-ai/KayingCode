import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { setDataBaseDir } from "@zcode/services/node";
import { KAYINGCODE_PRODUCT_FLAVOR } from "@zcode/shared";
import { isElectronAppPackaged } from "./desktopElectronApp.js";
import { DESKTOP_SETTINGS_BASE_DIR_ENV, resolveDesktopDataPaths } from "./desktopDataPaths.js";

export function resolveCurrentDesktopDataPaths() {
  return resolveDesktopDataPaths({
    homeDir: homedir(),
    desktopHomeDir: process.env.KAYINGCODE_DESKTOP_HOME_DIR,
    explicitDataBaseDir: process.env.KAYINGCODE_DATA_BASE_DIR,
    isPackaged: isElectronAppPackaged(),
    flavor: KAYINGCODE_PRODUCT_FLAVOR === "preview" ? "preview" : "production",
  });
}

export function extractBootstrapDataBaseDir(rawValue: unknown): string | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const dataBaseDir = (rawValue as { dataBaseDir?: unknown }).dataBaseDir;
  if (typeof dataBaseDir !== "string") {
    return null;
  }

  const trimmed = dataBaseDir.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBootstrapDataBaseDirFromDisk(
  settingsFile: string = resolveCurrentDesktopDataPaths().settingsFile,
): string | null {
  if (!existsSync(settingsFile)) {
    return null;
  }

  try {
    const raw = readFileSync(settingsFile, "utf-8");
    return extractBootstrapDataBaseDir(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function applyEarlyDataBaseDirBootstrap(): string | null {
  const paths = resolveCurrentDesktopDataPaths();
  process.env[DESKTOP_SETTINGS_BASE_DIR_ENV] = paths.settingsBaseDir;
  const dataBaseDir = readBootstrapDataBaseDirFromDisk();
  // 正式版/Preview 默认根与旧产品分开；设置中的自定义目录只覆盖运行数据根。
  // logger / crashReporter 和 Host 启动前必须看到同一个最终目录。
  setDataBaseDir(dataBaseDir || paths.dataBaseDir);
  return dataBaseDir;
}
