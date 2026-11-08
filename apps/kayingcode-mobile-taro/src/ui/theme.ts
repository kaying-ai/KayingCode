import { useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { normalizeThemeMode, type ThemeMode } from "./themeTokens";
import { observeSystemTheme, systemThemeIsLight } from "../ports/taroPlatform";
export type { ThemeMode } from "./themeTokens";
const STORAGE_KEY = "zflow_theme_mode";

export function readThemeMode(): ThemeMode {
  try {
    return normalizeThemeMode(Taro.getStorageSync(STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    Taro.setStorageSync(STORAGE_KEY, mode);
  } catch {
    /* 偏好存储不可用时本页仍即时切换。 */
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);
  const [systemLight, setSystemLight] = useState(systemThemeIsLight);
  useDidShow(() => {
    setMode(readThemeMode());
    setSystemLight(systemThemeIsLight());
  });
  useEffect(() => observeSystemTheme(setSystemLight), []);
  const resolved = mode === "system" ? (systemLight ? "light" : "dark") : mode;
  return {
    mode,
    className: `mobile-root theme-${resolved}`,
    setMode(next: ThemeMode) {
      saveThemeMode(next);
      setMode(next);
    },
  };
}
