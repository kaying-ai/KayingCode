import { z } from "zod";
import { browserViewportInputSchema } from "./browser-use/command-metadata.js";
import { normalizeTrustedTapTapPreviewUrl, toTapTapGamePreviewUrl } from "./taptap-maker.js";

const PLUGIN_CONTRIBUTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const pluginBrowserComparePublicationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    pluginId: z.string().trim().min(1),
    contributionId: z.string().regex(PLUGIN_CONTRIBUTION_ID_PATTERN),
    operationId: z.string().trim().min(1),
    workspaceKey: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    projectRoot: z.string().trim().min(1),
    sourceUrl: z.string().url(),
    targetUrl: z.string().url(),
    viewport: browserViewportInputSchema,
    targetPublication: z
      .object({
        operationId: z.string().trim().min(1),
        revision: z.number().int().positive(),
      })
      .strict(),
    publishedAt: z.string().datetime({ offset: true }),
    revision: z.number().int().positive(),
  })
  .strict();

export type PluginBrowserComparePublicationV1 = z.infer<
  typeof pluginBrowserComparePublicationV1Schema
>;

export function parsePluginBrowserComparePublicationV1(
  value: unknown,
): PluginBrowserComparePublicationV1 {
  const parsed = pluginBrowserComparePublicationV1Schema.parse(value);
  const sourceUrl = normalizeSourceUrl(parsed.sourceUrl);
  if (!sourceUrl) throw new Error("Browser compare receipt contains an untrusted sourceUrl");
  const trustedTargetUrl = normalizeTrustedTapTapPreviewUrl(parsed.targetUrl);
  if (!trustedTargetUrl) throw new Error("Browser compare receipt contains an untrusted targetUrl");
  return { ...parsed, sourceUrl, targetUrl: toTapTapGamePreviewUrl(trustedTargetUrl) };
}

function normalizeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
