// rpc-frame 分片传输。
//
// 对齐 Flutter lib/protocol/rpc_transport.dart（web 客户端 `Xf`/`Zf`、`sp`/`lp`）：
// 逻辑消息按 512 KiB 分片使 JSON 信封 < 1 MiB（base64 膨胀 4/3）；每条消息带
// crc32 校验；接收端组装完整消息后回 `rpc-frame-ack`。陈旧组装的清理是惰性的
// （每次 acceptPayload 顺手清理超 60s 的组装），语义与 Dart 的 30s 周期定时器
// 等价且免定时器。
import { crc32Hex } from "./crc32.js";
import { base64Decode, base64Encode } from "./wireBase64.js";
import type { ZcodeBinary, ZflowPayload } from "./zflowTypes.js";

export const RPC_MAX_PHYSICAL_FRAME_BYTES = 1024 * 1024;
export const RPC_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
export const RPC_MAX_FRAGMENTS = 64;
/** 每片原始字节；base64 膨胀 4/3 后信封 < 1 MiB。 */
const FRAGMENT_PAYLOAD_BYTES = 512 * 1024;
const MAX_INBOUND_ASSEMBLIES = 32;
const MAX_INBOUND_ASSEMBLY_BYTES = 32 * 1024 * 1024;
const ASSEMBLY_TTL_MS = 60_000;

export class RpcFrameEmptyMessageError extends Error {}
export class RpcFrameMessageTooLargeError extends Error {}
export class RpcFrameFragmentLimitError extends Error {}

export interface RpcFrameTransportOptions {
  bridgeSessionId: string;
  bridgeGeneration?: number;
  recoveryId?: string;
  sendPayload: (payload: ZflowPayload) => void;
  now?: () => number;
  onLog?: (line: string) => void;
}

export class RpcFrameTransport {
  readonly bridgeSessionId: string;
  private readonly bridgeGeneration?: number;
  private readonly recoveryId?: string;
  private readonly sendPayload: (payload: ZflowPayload) => void;
  private readonly now: () => number;
  private readonly onLog?: (line: string) => void;

  private seq = 0;
  private messageSeq = 0;
  private readonly messageListeners = new Set<(message: ZcodeBinary) => void>();
  private readonly assemblies = new Map<number, Assembly>();
  private inboundAssemblyBytes = 0;
  private disposed = false;

  constructor(options: RpcFrameTransportOptions) {
    this.bridgeSessionId = options.bridgeSessionId;
    this.bridgeGeneration = options.bridgeGeneration;
    this.recoveryId = options.recoveryId;
    this.sendPayload = options.sendPayload;
    this.now = options.now ?? Date.now;
    this.onLog = options.onLog;
  }

  onMessage(listener: (message: ZcodeBinary) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private get identity(): Record<string, unknown> {
    const identity: Record<string, unknown> = { bridgeSessionId: this.bridgeSessionId };
    if (this.bridgeGeneration !== undefined) identity.bridgeGeneration = this.bridgeGeneration;
    if (this.recoveryId !== undefined) identity.recoveryId = this.recoveryId;
    return identity;
  }

  /** 分片并发送一条逻辑消息。 */
  sendMessage(bytes: ZcodeBinary): void {
    if (this.disposed) return;
    if (bytes.length === 0) throw new RpcFrameEmptyMessageError("remote.rpcFrame.emptyMessage");
    if (bytes.length > RPC_MAX_MESSAGE_BYTES) {
      throw new RpcFrameMessageTooLargeError("remote.rpcFrame.messageTooLarge");
    }
    const messageSeq = ++this.messageSeq;
    const checksum = crc32Hex(bytes);
    const fragmentCount = Math.ceil(bytes.length / FRAGMENT_PAYLOAD_BYTES);
    if (fragmentCount > RPC_MAX_FRAGMENTS) {
      throw new RpcFrameFragmentLimitError("remote.rpcFrame.fragmentLimitExceeded");
    }
    for (let i = 0; i < fragmentCount; i += 1) {
      const start = i * FRAGMENT_PAYLOAD_BYTES;
      const end = Math.min(start + FRAGMENT_PAYLOAD_BYTES, bytes.length);
      this.seq += 1;
      this.sendPayload({
        zcode_type: "rpc-frame",
        ...this.identity,
        seq: this.seq,
        messageSeq,
        fragmentIndex: i,
        fragmentCount,
        messageBytes: bytes.length,
        checksum: { algorithm: "crc32", value: checksum },
        dataBase64: base64Encode(bytes.subarray(start, end)),
      });
    }
  }

  /** 喂一个 relay 载荷。返回它是否为 rpc-frame(-ack)。 */
  acceptPayload(payload: ZflowPayload): boolean {
    if (this.disposed) return true;
    const type = payload.zcode_type;
    if (type === "rpc-frame-ack") return true;
    if (type !== "rpc-frame") return false;
    this.purgeStale();
    if (payload.bridgeSessionId !== this.bridgeSessionId) return true;
    const messageSeq = asInt(payload.messageSeq);
    const fragmentIndex = asInt(payload.fragmentIndex);
    const fragmentCount = asInt(payload.fragmentCount);
    const messageBytes = asInt(payload.messageBytes);
    const dataBase64 = typeof payload.dataBase64 === "string" ? payload.dataBase64 : null;
    const checksum =
      payload.checksum !== null && typeof payload.checksum === "object"
        ? typeof (payload.checksum as Record<string, unknown>).value === "string"
          ? ((payload.checksum as Record<string, unknown>).value as string)
          : null
        : null;
    if (
      messageSeq === null ||
      fragmentIndex === null ||
      fragmentCount === null ||
      messageBytes === null ||
      dataBase64 === null
    ) {
      return true;
    }
    if (
      messageSeq < 0 ||
      fragmentIndex < 0 ||
      fragmentCount <= 0 ||
      fragmentCount > RPC_MAX_FRAGMENTS ||
      messageBytes <= 0 ||
      messageBytes > RPC_MAX_MESSAGE_BYTES
    ) {
      this.onLog?.("[rpc] invalid inbound fragment bounds");
      this.dropAssembly(messageSeq);
      return true;
    }
    let chunk: Uint8Array;
    try {
      chunk = base64Decode(dataBase64);
    } catch {
      this.dropAssembly(messageSeq);
      return true;
    }
    if (chunk.length === 0 || chunk.length > FRAGMENT_PAYLOAD_BYTES) {
      this.onLog?.("[rpc] invalid inbound fragment size");
      this.dropAssembly(messageSeq);
      return true;
    }
    let assembly = this.assemblies.get(messageSeq);
    if (!assembly) {
      if (
        this.assemblies.size >= MAX_INBOUND_ASSEMBLIES ||
        this.inboundAssemblyBytes + chunk.length > MAX_INBOUND_ASSEMBLY_BYTES
      ) {
        this.onLog?.("[rpc] inbound assembly limit reached");
        return true;
      }
      assembly = new Assembly(fragmentCount, messageBytes, checksum, this.now());
      this.assemblies.set(messageSeq, assembly);
    } else if (
      assembly.fragmentCount !== fragmentCount ||
      assembly.messageBytes !== messageBytes ||
      assembly.checksum !== checksum
    ) {
      this.onLog?.("[rpc] inbound fragment metadata mismatch");
      this.dropAssembly(messageSeq);
      return true;
    }
    if (fragmentIndex >= fragmentCount) return true;
    if (assembly.add(fragmentIndex, chunk)) this.inboundAssemblyBytes += chunk.length;
    if (assembly.receivedBytesSum() > messageBytes) {
      this.onLog?.("[rpc] inbound assembly exceeds declared size");
      this.dropAssembly(messageSeq);
      return true;
    }
    if (assembly.received === fragmentCount) {
      this.dropAssembly(messageSeq);
      const message = assembly.assembleAll();
      if (message.length !== messageBytes) {
        this.onLog?.("[rpc] inbound assembly size mismatch");
        return true;
      }
      if (assembly.checksum === null || crc32Hex(message) === assembly.checksum) {
        this.onLog?.(`[rpc] message ${messageSeq} assembled (${message.length} bytes)`);
        for (const listener of Array.from(this.messageListeners)) listener(message);
        // ack 必须与 rpc-frame 同源带全身份：宿主按 bridgeSessionId + bridgeGeneration
        // + recoveryId 三项严格比对入站帧，缺 bridgeGeneration/recoveryId 的 ack 会被
        // 静默丢弃，宿主重放缓冲永不释放，45s 宽限后把桥判死并反复重开。
        this.sendPayload({
          zcode_type: "rpc-frame-ack",
          ...this.identity,
          ackMessageSeq: messageSeq,
        });
      } else {
        this.onLog?.(`[rpc] message ${messageSeq} checksum mismatch`);
      }
    }
    return true;
  }

  private dropAssembly(messageSeq: number): void {
    const assembly = this.assemblies.get(messageSeq);
    if (assembly) {
      this.inboundAssemblyBytes -= assembly.receivedBytesSum();
      this.assemblies.delete(messageSeq);
    }
  }

  private purgeStale(): void {
    const now = this.now();
    for (const [seq, assembly] of this.assemblies) {
      if (now - assembly.createdAt > ASSEMBLY_TTL_MS) {
        this.dropAssembly(seq);
        this.onLog?.(`[rpc] purged stale assembly ${seq}`);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.assemblies.clear();
    this.inboundAssemblyBytes = 0;
    this.messageListeners.clear();
  }
}

class Assembly {
  readonly fragments: (Uint8Array | null)[];
  received = 0;

  constructor(
    readonly fragmentCount: number,
    readonly messageBytes: number,
    readonly checksum: string | null,
    readonly createdAt: number,
  ) {
    this.fragments = Array.from({ length: fragmentCount }, () => null);
  }

  add(index: number, data: Uint8Array): boolean {
    if (index < 0 || index >= this.fragmentCount || this.fragments[index] !== null) return false;
    this.fragments[index] = data;
    this.received += 1;
    return true;
  }

  receivedBytesSum(): number {
    let sum = 0;
    for (const fragment of this.fragments) sum += fragment?.length ?? 0;
    return sum;
  }

  get isComplete(): boolean {
    return this.received === this.fragmentCount;
  }

  assembleAll(): Uint8Array {
    const parts = this.fragments.filter((f): f is Uint8Array => f !== null);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}
