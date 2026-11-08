import type { ProviderEndpointRoutingPort } from "@zcode/contracts";
import type { ProviderEndpointRoutingFactoryOptions } from "../provider-endpoint-routing-options.js";

/**
 * KayingCode.localrun：无官方 Coding Plan 网关，endpoint 路由恒为直连。
 *
 * 上游 edition 会把官方端点改写到平台网关并附加来源头；本地保留同一端口形状，
 * 便于 bootstrap 装配，但不做任何 URL/header 改写（产品边界见 PRODUCT_BOUNDARY.md）。
 */
export function createProviderEndpointRoutingPort(
  options: ProviderEndpointRoutingFactoryOptions,
): ProviderEndpointRoutingPort {
  void options;
  return {
    resolve: async (requestUrl) => ({ routed: false, url: requestUrl }),
  };
}
