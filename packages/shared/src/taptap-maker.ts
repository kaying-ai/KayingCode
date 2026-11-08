import { z } from "zod";

export const TAPTAP_PREVIEW_RECEIPT_RELATIVE_PATH =
  ".maker/kaying-for-taptap/preview-publication.v1.json";
export const TAPTAP_PREVIEW_WEBVIEW_PARTITION = "persist:kayingcode-taptap-preview";
export const TAPTAP_PREVIEW_BLINK_FEATURES = "SharedArrayBuffer";

const TAPTAP_MAKER_HOST = "maker.taptap.cn";
const TAPTAP_GAME_HOST_SUFFIX = ".games.tapapps.cn";
const TAPTAP_PLAY_HOST = "play.taptap.cn";
const TAPTAP_WEB_HOSTS = new Set(["taptap.cn", "www.taptap.cn"]);
const MAKER_APP_PATH_PATTERN = /^\/app\/[^/]+(?:\/preview)?\/?$/u;
const MAKER_CANONICAL_APP_PATH_PATTERN = /^\/app\/[^/]+\/?$/u;

export const tapTapPreviewPublicationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.string().trim().min(1),
    workspaceKey: z.string().trim().min(1),
    sessionId: z.string().trim().min(1).optional(),
    previewMode: z.enum(["standalone", "transcription-compare"]).optional(),
    projectRoot: z.string().trim().min(1),
    previewUrl: z.string().url(),
    publishedAt: z.string().datetime({ offset: true }),
    revision: z.number().int().positive(),
  })
  .strict();

export type TapTapPreviewPublicationV1 = z.infer<typeof tapTapPreviewPublicationV1Schema>;

/** Canonicalize a Maker app URL and force local-development mode. */
export function normalizeTapTapPreviewUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== TAPTAP_MAKER_HOST) return value;
    const pathname = safeDecodePathname(url.pathname).replace(/[（(].*$/u, "");
    if (!MAKER_CANONICAL_APP_PATH_PATTERN.test(pathname)) return value;

    url.pathname = pathname;
    const searchParams = new URLSearchParams();
    searchParams.set("localDev", "1");
    for (const [key, entryValue] of url.searchParams) {
      if (key !== "localDev") searchParams.append(key, entryValue);
    }
    url.search = searchParams.toString();
    return url.toString();
  } catch {
    return value;
  }
}

/** Only playable TapTap routes are accepted; Git, API and account endpoints are rejected. */
export function isTrustedTapTapPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === TAPTAP_MAKER_HOST) return MAKER_APP_PATH_PATTERN.test(url.pathname);
    if (hostname.endsWith(TAPTAP_GAME_HOST_SUFFIX)) return true;
    if (hostname === TAPTAP_PLAY_HOST) return /^\/game\/[^/]+/u.test(url.pathname);
    return TAPTAP_WEB_HOSTS.has(hostname) && /^\/app\/[^/]+\/preview\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeTrustedTapTapPreviewUrl(value: string): string | null {
  const normalized = normalizeTapTapPreviewUrl(value);
  return isTrustedTapTapPreviewUrl(normalized) ? normalized : null;
}

/** Select Maker's playable second tab while preserving its local-development query. */
export function toTapTapGamePreviewUrl(value: string): string {
  try {
    const url = new URL(normalizeTapTapPreviewUrl(value));
    if (
      url.hostname.toLowerCase() !== TAPTAP_MAKER_HOST ||
      !MAKER_CANONICAL_APP_PATH_PATTERN.test(url.pathname)
    ) {
      return value;
    }
    url.searchParams.set("tab", "preview");
    return url.toString();
  } catch {
    return value;
  }
}

/** Match any SPA sub-route belonging to the same Maker project. */
export function isSameTapTapMakerApp(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    if (
      leftUrl.hostname.toLowerCase() !== TAPTAP_MAKER_HOST ||
      rightUrl.hostname.toLowerCase() !== TAPTAP_MAKER_HOST ||
      leftUrl.origin !== rightUrl.origin
    ) {
      return false;
    }
    const leftAppId = readMakerAppId(leftUrl.pathname);
    return leftAppId !== null && leftAppId === readMakerAppId(rightUrl.pathname);
  } catch {
    return false;
  }
}

/** Whether the current Maker route is already showing the playable preview tab. */
export function isTapTapGamePreviewView(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== TAPTAP_MAKER_HOST) return false;
    return (
      url.searchParams.get("tab") === "preview" || /^\/app\/[^/]+\/preview\/?$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function shouldRestoreTapTapGamePreview(currentUrl: string, desiredUrl: string): boolean {
  return isSameTapTapMakerApp(currentUrl, desiredUrl) && !isTapTapGamePreviewView(currentUrl);
}

export function parseTapTapPreviewPublicationV1(value: unknown): TapTapPreviewPublicationV1 {
  const parsed = tapTapPreviewPublicationV1Schema.parse(value);
  const previewUrl = normalizeTrustedTapTapPreviewUrl(parsed.previewUrl);
  if (!previewUrl) throw new Error("TapTap preview receipt contains an untrusted previewUrl");
  return { ...parsed, previewUrl };
}

function safeDecodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function readMakerAppId(pathname: string): string | null {
  return pathname.match(/^\/app\/([^/]+)/u)?.[1] ?? null;
}
