import {
  kayingcodeProtocolMethods,
  kayingcodePluginsReferenceCatalogResultSchema,
  type KayingCodePluginsReferenceCatalogParams,
} from "@zcode/shared";
import type { KayingCodeProtocolClient } from "#src/kayingcode-agent/kayingcodeProtocolClient.js";

/** 旧协议严格校验响应；新展示字段走独立入口，只有 -32601 能证明旧 Agent 不支持。 */
export async function requestPluginReferenceCatalog(
  client: Pick<KayingCodeProtocolClient, "request">,
  params: KayingCodePluginsReferenceCatalogParams,
) {
  try {
    return await client.request(
      kayingcodeProtocolMethods.pluginsReferenceCatalogWithCategory,
      params,
      kayingcodePluginsReferenceCatalogResultSchema,
    );
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === -32601))
      throw error;
    return client.request(
      kayingcodeProtocolMethods.pluginsReferenceCatalog,
      params,
      kayingcodePluginsReferenceCatalogResultSchema,
    );
  }
}
