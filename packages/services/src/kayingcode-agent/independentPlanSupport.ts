import { kayingcodeProtocolMethods, kayingcodeRuntimeCapabilitiesSchema } from "@zcode/shared";
import type { KayingCodeProtocolClient } from "./kayingcodeProtocolClient.js";

const checks = new WeakMap<object, Promise<void>>();
const genUiChecks = new WeakMap<object, Promise<void>>();

/** Host 更新不代表远端 CLI 已更新；旧 CLI 会剥掉 Plan 字段，必须在发送前确认执行端。 */
export function ensureIndependentPlanSupport(
  client: Pick<KayingCodeProtocolClient, "request">,
): Promise<void> {
  const cached = checks.get(client);
  if (cached) return cached;
  const check = client
    .request(kayingcodeProtocolMethods.runtimeCapabilities, {}, kayingcodeRuntimeCapabilitiesSchema)
    .then((result) => {
      if (result.independentPlanState !== true) throw new Error("proto.independentPlanUnsupported");
    })
    .catch((cause: unknown) => {
      checks.delete(client);
      throw new Error("proto.independentPlanUnsupported", { cause });
    });
  checks.set(client, check);
  return check;
}

// 一个 CLI 实例只探测一次；失败时允许下次重试，旧严格 schema 一律不发新字段。
type CapabilityClient = Pick<KayingCodeProtocolClient, "request">;
const discoveredCapabilities = new WeakMap<
  object,
  Promise<{ historyFirst?: boolean; pluginDiscoveryUi?: boolean }>
>();
function discoverCapabilities(client: CapabilityClient) {
  let result = discoveredCapabilities.get(client);
  if (!result) {
    result = client
      .request(
        kayingcodeProtocolMethods.runtimeCapabilities,
        {},
        kayingcodeRuntimeCapabilitiesSchema,
      )
      .catch(() => {
        discoveredCapabilities.delete(client);
        return {};
      });
    discoveredCapabilities.set(client, result);
  }
  return result;
}
/** 远端旧 CLI 的 strict subscribe 不接受新字段，能力确认后才转发。 */
export async function supportsHistoryFirst(client: CapabilityClient): Promise<boolean> {
  return (await discoverCapabilities(client)).historyFirst === true;
}
/** plugin discovery 工具面同样先确认执行端能力；旧 CLI 的 strict 命令 schema 不认识新字段。 */
export async function supportsPluginDiscoveryUi(client: CapabilityClient): Promise<boolean> {
  return (await discoverCapabilities(client)).pluginDiscoveryUi === true;
}

/** 状态不能回退到拼接用户正文；不支持时保留草稿并拒绝发送。 */
export function ensureGenUiContextSupport(
  client: Pick<KayingCodeProtocolClient, "request">,
): Promise<void> {
  const cached = genUiChecks.get(client);
  if (cached) return cached;
  const check = client
    .request(kayingcodeProtocolMethods.runtimeCapabilities, {}, kayingcodeRuntimeCapabilitiesSchema)
    .then((result) => {
      if (result.genUiContext !== true) throw new Error("proto.genUiContextUnsupported");
    })
    .catch((cause: unknown) => {
      genUiChecks.delete(client);
      throw new Error("proto.genUiContextUnsupported", { cause });
    });
  genUiChecks.set(client, check);
  return check;
}
