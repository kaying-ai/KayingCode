// relay 出站载荷队列：未配对期间缓冲，matched 后冲刷。
//
// 对齐 Flutter relay_client.dart 的 `_outboundQueue`（web 客户端同语义）：
// 上限 100 条 / 8 MiB；`mobile-view-state-update` 可替换（断线期间只留最新）；
// 支持按顶层 requestId 取消尚未发出的请求。
import type { ZflowPayload } from "./zflowTypes.js";

export const MAX_QUEUED_PAYLOADS = 100;
export const MAX_QUEUED_PAYLOAD_BYTES = 8 * 1024 * 1024;

interface QueuedEntry {
  payload: ZflowPayload;
  estimatedBytes: number;
  cancelled: boolean;
}

export class RelayOutboundQueue {
  private entries: QueuedEntry[] = [];
  private totalBytes = 0;

  get length(): number {
    return this.entries.length;
  }

  /** 入队。超过上限时丢弃并返回 false（对齐 Dart 的 log+drop）。 */
  enqueue(payload: ZflowPayload): boolean {
    // view state 可替换：断线期间只保留最新一份。
    if (payload.zcode_type === "mobile-view-state-update") {
      for (let i = this.entries.length - 1; i >= 0; i -= 1) {
        const entry = this.entries[i]!;
        if (entry.payload.zcode_type === payload.zcode_type) {
          this.totalBytes -= entry.estimatedBytes;
          this.entries.splice(i, 1);
        }
      }
    }
    const estimatedBytes = estimatePayloadBytes(payload);
    if (
      this.entries.length >= MAX_QUEUED_PAYLOADS ||
      this.totalBytes + estimatedBytes > MAX_QUEUED_PAYLOAD_BYTES
    ) {
      return false;
    }
    this.entries.push({ payload, estimatedBytes, cancelled: false });
    this.totalBytes += estimatedBytes;
    return true;
  }

  /** 取消一个尚未发出的排队请求（按顶层 requestId 匹配）。 */
  cancel(requestId: string): boolean {
    const index = this.entries.findIndex(
      (entry) => entry.payload.requestId === requestId && !entry.cancelled,
    );
    if (index === -1) return false;
    const entry = this.entries.splice(index, 1)[0]!;
    entry.cancelled = true;
    this.totalBytes -= entry.estimatedBytes;
    return true;
  }

  /** 取出全部条目并清空（冲刷方跳过 cancelled）。 */
  drain(): ZflowPayload[] {
    const queued = this.entries;
    this.entries = [];
    this.totalBytes = 0;
    const out: ZflowPayload[] = [];
    for (const entry of queued) {
      if (!entry.cancelled) out.push(entry.payload);
    }
    return out;
  }

  clear(): void {
    this.entries = [];
    this.totalBytes = 0;
  }
}

/** JSON 文本的 UTF-8 字节数（无 TextEncoder 的运行时退化为字符数上界）。 */
function estimatePayloadBytes(payload: ZflowPayload): number {
  try {
    const text = JSON.stringify(payload);
    const encoder = (globalThis as Record<string, unknown>).TextEncoder as
      | (new () => { encode(input: string): Uint8Array })
      | undefined;
    if (typeof encoder === "function") return new encoder().encode(text).length;
    return text.length;
  } catch {
    return 0;
  }
}
