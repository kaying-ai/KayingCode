import type { IKayingCodeAgentService } from "@zcode/services";
import {
  PROTOCOL_V4_LIMITS,
  v4AttachmentReadResultSchema,
  type AttachmentRef,
  type ConversationRowTarget,
} from "@zcode/shared/kayingcode-protocol-v4";
import { currentRelayPlatformPorts } from "./relayPlatform.js";
import type { RelayWorkspaceTarget } from "./relayWorkspaceTarget.js";
import { base64Decode, base64Encode } from "./zcode/wireBase64.js";
import { sha256Hex } from "./zcode/sha256.js";

type AttachmentService = Pick<
  IKayingCodeAgentService,
  | "attachmentBeginV4"
  | "attachmentChunkV4"
  | "attachmentCommitV4"
  | "attachmentAbortV4"
  | "attachmentReadV4"
>;
export interface RelayAttachmentRead {
  sessionId: string;
  ref: string;
  target?: ConversationRowTarget;
  attachmentIndex?: number;
  signal?: AbortSignal;
}
const CHUNK_BYTES = 384 * 1024;

/** 使用既有 trusted scope 的附件事务，不开放文件系统 channel。 */
export class RelayAttachments {
  constructor(
    private readonly agent: AttachmentService,
    private readonly workspace: RelayWorkspaceTarget,
    private readonly alive: () => boolean,
  ) {}
  private check(signal?: AbortSignal): void {
    if (!this.alive() || signal?.aborted) throw new Error("relay.attachment.cancelled");
  }
  private async wait<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    this.check(signal);
    let cancel = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error("relay.attachment.cancelled"));
      signal.addEventListener("abort", cancel, { once: true });
    });
    try {
      return await Promise.race([promise, cancelled]);
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }
  async put(input: {
    sessionId: string;
    fileName: string;
    mime: string;
    bytes: Uint8Array;
    signal?: AbortSignal;
    onProgress?: (value: number) => void;
  }): Promise<AttachmentRef> {
    this.check(input.signal);
    if (input.bytes.length > PROTOCOL_V4_LIMITS.attachmentMaxBytes)
      throw new Error("relay.attachment.tooLarge");
    const base = {
      ...this.workspace,
      sessionId: input.sessionId,
      uploadId: `web-${currentRelayPlatformPorts().randomHex(16)}`,
    };
    let began = false;
    try {
      const totalChunks = Math.ceil(input.bytes.length / CHUNK_BYTES);
      began = true;
      const result = await this.wait(
        this.agent.attachmentBeginV4({
          ...base,
          fileName: input.fileName,
          mime: input.mime || "application/octet-stream",
          totalBytes: input.bytes.length,
          totalChunks,
          checksum: `sha256:${sha256Hex(input.bytes)}`,
        }),
        input.signal,
      );
      this.check(input.signal);
      if (result.state === "committed")
        return {
          ref: result.ref,
          fileName: input.fileName,
          mime: input.mime,
          bytes: input.bytes.length,
        };
      if (
        !Number.isInteger(result.nextChunkIndex) ||
        result.nextChunkIndex < 0 ||
        result.nextChunkIndex > totalChunks
      )
        throw new Error("relay.attachment.invalidCursor");
      for (let index = result.nextChunkIndex; index < totalChunks; index++) {
        this.check(input.signal);
        const response = await this.wait(
          this.agent.attachmentChunkV4({
            ...base,
            chunkIndex: index,
            dataBase64: base64Encode(
              input.bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES),
            ),
          }),
          input.signal,
        );
        this.check(input.signal);
        if (response.nextChunkIndex !== index + 1)
          throw new Error("relay.attachment.invalidCursor");
        input.onProgress?.((index + 1) / totalChunks);
      }
      const committed = await this.wait(this.agent.attachmentCommitV4(base), input.signal);
      this.check(input.signal);
      return {
        ref: committed.ref,
        fileName: input.fileName,
        mime: input.mime || "application/octet-stream",
        bytes: input.bytes.length,
      };
    } catch (error) {
      // 清理 RPC 也可能无响应；不能让它阻塞取消与下一次发送。
      if (began && this.alive()) void this.agent.attachmentAbortV4(base).catch(() => undefined);
      throw error;
    }
  }
  async readRange(input: RelayAttachmentRead & { offset: number; limit: number }) {
    this.check(input.signal);
    const { signal, ...params } = input;
    const response = v4AttachmentReadResultSchema.parse(
      await this.wait(this.agent.attachmentReadV4({ ...this.workspace, ...params }), signal),
    );
    this.check(signal);
    return {
      bytes: base64Decode(response.dataBase64),
      mediaType: response.mediaType,
      totalBytes: response.totalBytes,
      nextOffset: response.nextOffset,
    };
  }
  async read(input: RelayAttachmentRead): Promise<{ bytes: Uint8Array; mediaType: string }> {
    const chunks: Uint8Array[] = [];
    let offset = 0;
    let total: number | null = null;
    let mediaType = "";
    for (;;) {
      const response = await this.readRange({ ...input, offset, limit: CHUNK_BYTES });
      if (
        (total !== null && response.totalBytes !== total) ||
        (mediaType && mediaType !== response.mediaType)
      )
        throw new Error("relay.attachment.changed");
      total = response.totalBytes;
      mediaType = response.mediaType;
      chunks.push(response.bytes);
      offset += response.bytes.length;
      if (offset > total || offset > PROTOCOL_V4_LIMITS.attachmentPreviewMaxBytes)
        throw new Error("relay.attachment.invalidCursor");
      if (response.nextOffset === null) {
        if (offset !== total) throw new Error("relay.attachment.incomplete");
        break;
      }
      if (!response.bytes.length || response.nextOffset !== offset)
        throw new Error("relay.attachment.invalidCursor");
    }
    const bytes = new Uint8Array(offset);
    let cursor = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, cursor);
      cursor += chunk.length;
    }
    return { bytes, mediaType };
  }
}
