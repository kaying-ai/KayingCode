import type { AttachmentRef } from "@zcode/shared/kayingcode-protocol-v4";
import { currentRelayPlatformPorts } from "../relayPlatform.js";
import type { RelayWorkspaceTarget } from "../relayWorkspaceTarget.js";
import type { BridgeSession } from "./bridgeSession.js";
import { Channels } from "./channelClient.js";
import { base64Decode, base64Encode } from "./wireBase64.js";
import { sha256Hex } from "./sha256.js";

const CHUNK_BYTES = 384 * 1024;
const MAX_READ_BYTES = 16 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("附件协议响应无效");
  }
  return value as Record<string, unknown>;
}

/** ZCode 附件传输；RPC 调用与服务端游标校验在 core 完成。 */
export class ChannelAttachments {
  constructor(
    private readonly bridge: BridgeSession,
    private readonly workspace: RelayWorkspaceTarget,
  ) {}

  private get scope(): Record<string, string> {
    return {
      workspacePath: this.workspace.workspacePath,
      ...(this.workspace.workspaceIdentity
        ? { workspaceIdentity: this.workspace.workspaceIdentity }
        : {}),
    };
  }

  private async call(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.bridge.waitHealthy();
    return record(
      await this.bridge.channels.call(Channels.zcodeAgent, method, [{ ...this.scope, ...payload }]),
    );
  }

  async put(input: {
    sessionId: string;
    fileName: string;
    mime: string;
    bytes: Uint8Array;
    onProgress?: (fraction: number) => void;
  }): Promise<AttachmentRef> {
    const generation = this.bridge.recovered;
    await this.bridge.waitHealthy();
    const hello = record(
      await this.bridge.channels.call(Channels.zcodeAgent, "helloConversationV4", []),
    );
    const connectionId = hello.connectionId;
    if (typeof connectionId !== "string" || !connectionId) throw new Error("附件连接标识缺失");
    const uploadId = `upload-${currentRelayPlatformPorts().randomHex(16)}`;
    const base = { connectionId, uploadId, sessionId: input.sessionId };
    const totalChunks = Math.ceil(input.bytes.length / CHUNK_BYTES);
    let began = false;
    try {
      const begin = await this.call("attachmentBeginV4", {
        ...base,
        fileName: input.fileName,
        mime: input.mime,
        totalBytes: input.bytes.length,
        totalChunks,
        checksum: `sha256:${sha256Hex(input.bytes)}`,
      });
      began = true;
      if (this.bridge.recovered !== generation)
        throw new Error("附件上传期间桥已恢复，请重新选择文件");
      if (begin.state === "committed") {
        if (typeof begin.ref !== "string" || !begin.ref) throw new Error("附件引用缺失");
        input.onProgress?.(1);
        return {
          ref: begin.ref,
          fileName: input.fileName,
          mime: input.mime,
          bytes: input.bytes.length,
        };
      }
      let next: unknown = begin.nextChunkIndex ?? 0;
      if (!Number.isInteger(next) || (next as number) < 0 || (next as number) > totalChunks) {
        throw new Error("附件上传进度无效");
      }
      for (let index = next as number; index < totalChunks; index += 1) {
        if (this.bridge.recovered !== generation)
          throw new Error("附件上传期间桥已恢复，请重新选择文件");
        const start = index * CHUNK_BYTES;
        const response = await this.call("attachmentChunkV4", {
          ...base,
          chunkIndex: index,
          dataBase64: base64Encode(
            input.bytes.subarray(start, Math.min(start + CHUNK_BYTES, input.bytes.length)),
          ),
        });
        next = response.nextChunkIndex;
        if (next !== index + 1) throw new Error("附件上传进度无效");
        input.onProgress?.((index + 1) / totalChunks);
      }
      if (this.bridge.recovered !== generation)
        throw new Error("附件上传期间桥已恢复，请重新选择文件");
      const committed = await this.call("attachmentCommitV4", base);
      if (typeof committed.ref !== "string" || !committed.ref) throw new Error("附件引用缺失");
      input.onProgress?.(1);
      return {
        ref: committed.ref,
        fileName: input.fileName,
        mime: input.mime,
        bytes: input.bytes.length,
      };
    } catch (error) {
      if (began && this.bridge.recovered === generation && !this.bridge.isDisposed) {
        await this.call("attachmentAbortV4", base).catch(() => undefined);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
    ref: string,
  ): Promise<{ bytes: Uint8Array; mediaType: string | null }> {
    const chunks: Uint8Array[] = [];
    let offset = 0;
    let total: number | null = null;
    let mediaType: string | null = null;
    let finished = false;
    for (let round = 0; round < 1024; round += 1) {
      const response = await this.call("attachmentReadV4", {
        sessionId,
        ref,
        offset,
        limit: CHUNK_BYTES,
      });
      if (response.totalBytes !== undefined) {
        if (
          !Number.isInteger(response.totalBytes) ||
          (response.totalBytes as number) < 0 ||
          (response.totalBytes as number) > MAX_READ_BYTES ||
          (total !== null && response.totalBytes !== total)
        )
          throw new Error("附件长度无效");
        total = response.totalBytes as number;
      }
      if (response.mediaType !== undefined && response.mediaType !== null) {
        if (
          typeof response.mediaType !== "string" ||
          (mediaType !== null && mediaType !== response.mediaType)
        )
          throw new Error("附件媒体类型无效");
        mediaType = response.mediaType;
      }
      if (typeof response.dataBase64 !== "string" || !Number.isInteger(response.nextOffset)) {
        throw new Error("附件分片响应无效");
      }
      if (
        !response.dataBase64 &&
        response.nextOffset === offset &&
        (total === null || total === offset)
      ) {
        finished = true;
        break;
      }
      const chunk = base64Decode(response.dataBase64);
      if (
        chunk.length === 0 ||
        chunk.length > CHUNK_BYTES ||
        response.nextOffset !== offset + chunk.length ||
        (total !== null && response.nextOffset > total) ||
        offset + chunk.length > MAX_READ_BYTES
      ) {
        throw new Error("附件读取进度无效");
      }
      chunks.push(chunk);
      offset += chunk.length;
      if (total !== null && offset === total) {
        finished = true;
        break;
      }
    }
    if (!finished) throw new Error("附件读取超过分片上限");
    if (total !== null && offset !== total) throw new Error("附件读取未完成");
    const bytes = new Uint8Array(offset);
    let cursor = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, cursor);
      cursor += chunk.length;
    }
    return { bytes, mediaType };
  }
}
