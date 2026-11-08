const KAYINGCODE_PROCESS_PREFIX = "kayingcode";
const MAX_PROCESS_NAME_SEGMENT_LENGTH = 24;

function sanitizeProcessNameSegment(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_PROCESS_NAME_SEGMENT_LENGTH);
}

function joinKayingCodeProcessName(...segments: Array<string | null | undefined>): string {
  const sanitizedSegments = segments
    .map((segment) => sanitizeProcessNameSegment(segment))
    .filter((segment): segment is string => Boolean(segment));
  return [KAYINGCODE_PROCESS_PREFIX, ...sanitizedSegments].join("-");
}

function pickWorkspaceTag(workspacePath: string | null | undefined): string | undefined {
  const trimmedPath = workspacePath?.trim();
  if (!trimmedPath) {
    return undefined;
  }

  const parts = trimmedPath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? trimmedPath;
}

export function formatKayingCodeMainProcessName(): string {
  return joinKayingCodeProcessName("main");
}

export function formatKayingCodeGpuProcessName(): string {
  return joinKayingCodeProcessName("gpu");
}

export function formatKayingCodeHostProcessName(label?: string): string {
  return joinKayingCodeProcessName("host", label);
}

export function formatKayingCodeRendererProcessName(windowTitle?: string): string {
  const normalizedTitle = windowTitle?.trim();
  if (!normalizedTitle || normalizedTitle === "KayingCode") {
    return joinKayingCodeProcessName("renderer", "main");
  }

  if (normalizedTitle === "Resource Manager") {
    return joinKayingCodeProcessName("renderer", "resource-manager");
  }

  const remoteWindowPrefix = "KayingCode - ";
  if (normalizedTitle.startsWith(remoteWindowPrefix)) {
    return joinKayingCodeProcessName(
      "renderer",
      "remote",
      normalizedTitle.slice(remoteWindowPrefix.length),
    );
  }

  return joinKayingCodeProcessName("renderer", normalizedTitle);
}

export function formatKayingCodeAgentProcessName(provider: string, workspacePath?: string): string {
  return joinKayingCodeProcessName("agent", provider, pickWorkspaceTag(workspacePath));
}

export function formatKayingCodeUtilityProcessName(name?: string, type = "utility"): string {
  return joinKayingCodeProcessName(type, name);
}
