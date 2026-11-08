import {
  buildRuntimeKayingCodeEndpointUrls,
  KAYINGCODE_ENV,
  type RuntimeKayingCodeEndpointEnv,
} from "@zcode/shared";

interface RendererImportMetaEnv {
  VITE_KAYINGCODE_BASE_URL?: string;
  VITE_KAYINGCODE_ENDPOINT_ORIGIN?: string;
}

function readRendererImportMetaEnv(): RendererImportMetaEnv {
  return ((import.meta as ImportMeta & { env?: RendererImportMetaEnv }).env ??
    {}) as RendererImportMetaEnv;
}

function createRendererKayingCodeEndpointEnv(
  env: RendererImportMetaEnv = readRendererImportMetaEnv(),
): RuntimeKayingCodeEndpointEnv {
  return {
    KAYINGCODE_ENV,
    // UI 侧的 kayingcode-plan 占位 provider 以前只看 KAYINGCODE_ENV，
    // 没有消费 Vite 注入的 base url，导致自定义测试域名时 renderer 和 host/service 可能不一致。
    KAYINGCODE_BASE_URL: env.VITE_KAYINGCODE_BASE_URL,
    KAYINGCODE_ENDPOINT_ORIGIN: env.VITE_KAYINGCODE_ENDPOINT_ORIGIN,
  };
}

export const RENDERER_KAYINGCODE_ENDPOINT_URLS = buildRuntimeKayingCodeEndpointUrls(
  createRendererKayingCodeEndpointEnv(),
);
