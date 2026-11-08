// 上游路径兼容 shim：KayingCode 本地实现位于 kayingcodeEndpoint.ts。
export * from "./kayingcodeEndpoint.js";
export {
  DEFAULT_KAYINGCODE_ENDPOINT_ORIGIN as DEFAULT_ZCODE_ENDPOINT_ORIGIN,
  TEST_KAYINGCODE_ENDPOINT_ORIGIN as TEST_ZCODE_ENDPOINT_ORIGIN,
  normalizeKayingCodeEndpointOrigin as normalizeZCodeEndpointOrigin,
  resolveKayingCodeEndpointOrigin as resolveZCodeEndpointOrigin,
  resolveRuntimeKayingCodeEnv as resolveRuntimeZCodeEnv,
  resolveRuntimeKayingCodeEndpointOrigin as resolveRuntimeZCodeEndpointOrigin,
  buildRuntimeKayingCodeEndpointUrls as buildRuntimeZCodeEndpointUrls,
  buildRuntimeKayingCodeApiUrl as buildRuntimeZCodeApiUrl,
  buildKayingCodeEndpointUrls as buildZCodeEndpointUrls,
  rewriteKayingCodeEndpointUrl as rewriteZCodeEndpointUrl,
} from "./kayingcodeEndpoint.js";
export type {
  BuildKayingCodeEndpointUrlsOptions as BuildZCodeEndpointUrlsOptions,
  KayingCodeEndpointUrls as ZCodeEndpointUrls,
  RuntimeKayingCodeEndpointEnv as RuntimeZCodeEndpointEnv,
} from "./kayingcodeEndpoint.js";
