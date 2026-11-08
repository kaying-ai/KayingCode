import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KayingCodeStdioTapDevState } from "@zcode/shared";
import { getAppConfigDir } from "#src/paths.js";
import { isEffectiveDevelopmentNodeEnv } from "#src/runtime-tools/nodeEnv.js";

interface KayingCodeStdioTapStateFile {
  enabled?: boolean;
}

function isKayingCodeStdioTapDevVisible(): boolean {
  return isEffectiveDevelopmentNodeEnv();
}

function getKayingCodeStdioTapDevDir(): string {
  return join(getAppConfigDir(), "dev");
}

export function getKayingCodeStdioTapDevLogDir(): string {
  return join(getKayingCodeStdioTapDevDir(), "stdio-traffic");
}

function getKayingCodeStdioTapDevStatePath(): string {
  return join(getKayingCodeStdioTapDevDir(), "kayingcode-stdio-tap.json");
}

function readStateFile(path: string): KayingCodeStdioTapStateFile {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as KayingCodeStdioTapStateFile) : {};
  } catch {
    return {};
  }
}

export function readKayingCodeStdioTapDevState(): KayingCodeStdioTapDevState {
  const visible = isKayingCodeStdioTapDevVisible();
  const statePath = getKayingCodeStdioTapDevStatePath();
  const fileState = readStateFile(statePath);
  return {
    enabled: visible && fileState.enabled === true,
    visible,
    logDir: getKayingCodeStdioTapDevLogDir(),
    statePath,
  };
}

export function setKayingCodeStdioTapDevEnabled(enabled: boolean): KayingCodeStdioTapDevState {
  const visible = isKayingCodeStdioTapDevVisible();
  const statePath = getKayingCodeStdioTapDevStatePath();
  mkdirSync(getKayingCodeStdioTapDevDir(), { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        // 开发态 stdio 抓包是高频原始协议帧，只能通过显式开关写旁路文件，避免误进生产日志。
        enabled: visible && enabled,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return readKayingCodeStdioTapDevState();
}
