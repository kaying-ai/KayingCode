import { DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN } from "./kayingcodeEndpoint.js";

export const KAYINGCODE_SOURCE_HEADERS = {
  "User-Agent": "KayingCode/unknown",
  "HTTP-Referer": DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN,
  "X-Title": "Z Code@electron",
} as const;

export interface BuildKayingCodeSourceHeadersFromContextOptions {
  appVersion?: string;
  arch?: string;
  clientLanguage?: string;
  clientTimezone?: string;
  deviceMid?: string;
  endpointOrigin?: string;
  osVersion?: string;
  platform?: string;
  releaseChannel?: string;
  sourceTitle?: string;
}

export function normalizeKayingCodeSourceHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function buildKayingCodeSourceHeadersFromContext(
  options: BuildKayingCodeSourceHeadersFromContextOptions = {},
): Record<string, string> {
  const appVersion = normalizeKayingCodeSourceHeaderValue(options.appVersion);
  const arch = normalizeKayingCodeSourceHeaderValue(options.arch);
  const clientLanguage = normalizeKayingCodeSourceHeaderValue(options.clientLanguage) ?? "unknown";
  const clientTimezone = normalizeKayingCodeSourceHeaderValue(options.clientTimezone) ?? "unknown";
  const deviceMid = normalizeKayingCodeSourceHeaderValue(options.deviceMid);
  const endpointOrigin =
    normalizeKayingCodeSourceHeaderValue(options.endpointOrigin) ?? DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN;
  const osVersion = normalizeKayingCodeSourceHeaderValue(options.osVersion);
  const platform = normalizeKayingCodeSourceHeaderValue(options.platform);
  const releaseChannel = normalizeKayingCodeSourceHeaderValue(options.releaseChannel);
  const sourceTitle = normalizeKayingCodeSourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    ...KAYINGCODE_SOURCE_HEADERS,
    "HTTP-Referer": endpointOrigin,
    "User-Agent": `KayingCode/${appVersion ?? "unknown"}`,
    ...(appVersion ? { "X-KayingCode-App-Version": appVersion } : {}),
    "X-Title": `Z Code@${sourceTitle}`,
    ...(platform && arch ? { "X-Platform": `${platform}-${arch}` } : {}),
    ...(releaseChannel ? { "X-Release-Channel": releaseChannel } : {}),
    "X-Client-Language": clientLanguage,
    "X-Client-Timezone": clientTimezone,
    ...(platform ? { "X-Os-Category": normalizeOsCategory(platform) } : {}),
    ...(osVersion ? { "X-Os-Version": osVersion } : {}),
    ...(deviceMid ? { "X-Device-Mid": deviceMid } : {}),
  };
}

function normalizeOsCategory(platform: string): string {
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}
