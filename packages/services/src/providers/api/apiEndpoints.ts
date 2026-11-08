import { buildRuntimeKayingCodeApiUrl, resolveZaiBusinessBaseUrl } from "@zcode/shared";

export const KAYINGCODE_CLIENT_SCENES_URL = buildRuntimeKayingCodeApiUrl(
  process.env,
  "/api/v1/client/scenes",
);

export const ZAI_API_HOST = resolveZaiBusinessBaseUrl(process.env);
