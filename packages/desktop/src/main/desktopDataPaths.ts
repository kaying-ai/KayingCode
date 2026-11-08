import { join } from "node:path";

export const DESKTOP_SETTINGS_BASE_DIR_ENV =
  "KAYINGCODE_DESKTOP_SETTINGS_BASE_DIR";

interface DesktopDataPathsOptions {
  homeDir: string;
  desktopHomeDir?: string;
  explicitDataBaseDir?: string;
  isPackaged: boolean;
  flavor: "production" | "preview";
}

export function resolveDesktopDataPaths(options: DesktopDataPathsOptions) {
  const homeDir = options.desktopHomeDir?.trim() || options.homeDir;
  const settingsBaseDir = options.isPackaged
    ? join(
        homeDir,
        options.flavor === "preview"
          ? ".kayingcode-agent-code-preview"
          : ".kayingcode-agent-code",
      )
    : homeDir;
  return {
    settingsBaseDir,
    settingsFile: join(settingsBaseDir, ".kayingcode", "v2", "setting.json"),
    dataBaseDir: options.explicitDataBaseDir?.trim() || settingsBaseDir,
    electronDataDirectoryName: options.isPackaged
      ? options.flavor === "preview"
        ? "KayingCode Agent Code Preview"
        : "KayingCode Agent Code"
      : "KayingCode Dev",
  };
}
