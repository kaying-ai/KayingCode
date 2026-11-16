/** TapTap paths the proxy is allowed to fetch. Everything else is rejected. */
export const ALLOWED_PATH_PREFIXES = [
  "/webapiv2/app-top/",
  "/webapiv2/calendar/",
  "/webapiv2/top/",
] as const;

export const MAX_PATH_LENGTH = 4096;

export function isAllowedTapTapPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return false;
  const rawPathname = path.split("?")[0] ?? "";
  // Reject percent-encoded dots/slashes: WHATWG URL would normalize them into a
  // different pathname after the allowlist check.
  if (/%2e|%2f|%5c/i.test(rawPathname)) return false;
  let normalized: string;
  try {
    normalized = new URL(`https://taptap.invalid${path}`).pathname;
  } catch {
    return false;
  }
  if (normalized !== rawPathname) return false;
  return ALLOWED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Constant-time comparison of `Authorization: Bearer <token>`. */
export function isAuthorizedBearer(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return diff === 0;
}
