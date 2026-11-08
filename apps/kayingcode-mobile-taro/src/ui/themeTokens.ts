export type ThemeMode = "dark" | "light" | "system";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "system" ? value : "dark";
}
