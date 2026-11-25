/**
 * 对话引用批注（conversationQuoteComment）能力门禁。
 *
 * 旧 CLI 的引用 schema 非 strict，会静默剥掉 `comment` / `agent`：用户看到批注，模型收不到。
 * 因此只有 CLI 在 runtime/capabilities 中声明该能力的连接才允许收到这两个字段；未声明、
 * 缺省或探测失败一律剥掉（fail closed），并允许下一次发送重新探测。
 * 规则与验收见 packages/services/spec/conversation-quote-comment.md。
 */
import { kayingcodeProtocolMethods, kayingcodeRuntimeCapabilitiesSchema } from "@zcode/shared";
import type { KayingCodeProtocolClient } from "./kayingcodeProtocolClient.js";

type CapabilityClient = Pick<KayingCodeProtocolClient, "request">;
type JsonObject = Record<string, unknown>;

const COMMENT_FIELD = "comment";
const AGENT_FIELD = "agent";

/** 每个物理 CLI 连接只探测一次；失败不缓存，连接换代后自然重新探测。 */
const conversationQuoteCommentChecks = new WeakMap<object, Promise<boolean>>();

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConversationQuotes(payload: unknown): unknown[] | undefined {
  if (!isRecord(payload)) return undefined;
  const quotes = payload.conversationQuotes;
  return Array.isArray(quotes) ? quotes : undefined;
}

function carriesCommentFields(value: unknown): boolean {
  return isRecord(value) && (COMMENT_FIELD in value || AGENT_FIELD in value);
}

/** 引用是否携带批注字段；只有携带时才值得发起能力探测。 */
function conversationQuotesCarryCommentFields(quotes: readonly unknown[]): boolean {
  return quotes.some(carriesCommentFields);
}

/**
 * 探测 CLI 是否声明 conversationQuoteComment。
 * 只有明确 `=== true` 才算支持；method-not-found、超时、解析失败都按不支持处理且不缓存失败。
 */
export function supportsConversationQuoteComment(client: CapabilityClient): Promise<boolean> {
  const cached = conversationQuoteCommentChecks.get(client);
  if (cached) return cached;
  const check = client
    .request(kayingcodeProtocolMethods.runtimeCapabilities, {}, kayingcodeRuntimeCapabilitiesSchema)
    .then((result) => result.conversationQuoteComment === true)
    .catch(() => {
      conversationQuoteCommentChecks.delete(client);
      return false;
    });
  conversationQuoteCommentChecks.set(client, check);
  return check;
}

/**
 * 按能力结果处理命令信封中的引用：支持时保留原始引用（含 comment/agent），不支持时只去掉
 * comment/agent，其余引用字段与其他 payload 保持不变，且不修改调用方对象。
 *
 * `sourceQuotes` 传入中间步骤（例如 command schema 解析）之前的原始引用：能力为真时要能
 * 恢复被解析器剥掉的批注字段，能力为假时也必须以原始引用为基准剥离。
 */
function applyConversationQuoteCommentGate<T extends { payload?: unknown }>(
  envelope: T,
  supported: boolean,
  sourceQuotes?: readonly unknown[],
): T {
  const quotes = sourceQuotes ?? readConversationQuotes(envelope.payload);
  if (!quotes || !conversationQuotesCarryCommentFields(quotes)) return envelope;
  const gatedQuotes = supported
    ? quotes
    : quotes.map((quote) => {
        if (!carriesCommentFields(quote)) return quote;
        const { [COMMENT_FIELD]: _comment, [AGENT_FIELD]: _agent, ...rest } = quote as JsonObject;
        return rest;
      });
  return {
    ...envelope,
    payload: { ...(envelope.payload as JsonObject), conversationQuotes: gatedQuotes },
  };
}

/**
 * 发送命令前的闸门：无批注字段时零探测、零拷贝；有批注字段时才探测并按结果保留或剥离。
 * `sourceEnvelope` 用于传回中间解析前的原始命令，保证能力为真时批注不因 Host 侧归一化丢失。
 */
export async function gateConversationQuoteComment<T extends { payload?: unknown }>(
  envelope: T,
  client: CapabilityClient,
  sourceEnvelope?: { payload?: unknown },
): Promise<T> {
  const sourceQuotes =
    readConversationQuotes(sourceEnvelope?.payload) ?? readConversationQuotes(envelope.payload);
  if (!sourceQuotes || !conversationQuotesCarryCommentFields(sourceQuotes)) return envelope;
  return applyConversationQuoteCommentGate(
    envelope,
    await supportsConversationQuoteComment(client),
    sourceQuotes,
  );
}
