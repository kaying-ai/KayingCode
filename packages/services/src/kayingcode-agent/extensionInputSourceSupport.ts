/**
 * 扩展输入来源（extensionInputSource）能力门禁。
 *
 * 旧 CLI 对 `{kind:"extension"}` 来源的行为不同：`sendText.source` 整条 proto.invalidPayload，
 * `createSession.firstInput.source` 被非 strict 的 firstInput 静默剥掉——会话照常创建，消息却被
 * 当成用户亲自输入。因此只有 CLI 在 runtime/capabilities 中声明该能力的连接才允许收到扩展来源；
 * 未声明、缺省或探测失败一律按不支持处理（fail closed），并允许下一次发送重新探测。
 * 规则与验收见 packages/services/spec/conversation-input-source.md。
 */
import { kayingcodeProtocolMethods, kayingcodeRuntimeCapabilitiesSchema } from "@zcode/shared";
import type { KayingCodeProtocolClient } from "./kayingcodeProtocolClient.js";

type CapabilityClient = Pick<KayingCodeProtocolClient, "request">;

/** 每个物理 CLI 连接只探测一次；失败不缓存，连接换代后自然重新探测。 */
const extensionInputSourceChecks = new WeakMap<object, Promise<boolean>>();

/**
 * 探测 CLI 是否声明 extensionInputSource。
 * 只有明确 `=== true` 才算支持；method-not-found、超时、解析失败都按不支持处理且不缓存失败。
 */
export function supportsExtensionInputSource(client: CapabilityClient): Promise<boolean> {
  const cached = extensionInputSourceChecks.get(client);
  if (cached) return cached;
  const check = client
    .request(kayingcodeProtocolMethods.runtimeCapabilities, {}, kayingcodeRuntimeCapabilitiesSchema)
    .then((result) => result.extensionInputSource === true)
    .catch(() => {
      extensionInputSourceChecks.delete(client);
      return false;
    });
  extensionInputSourceChecks.set(client, check);
  return check;
}
