// zflowClient 测试共享装置：假 socket、连接装配、rpc-frame 构造。
//
// 拆成独立文件的原因：架构策略的 `maxFileLines: 400` **对测试文件同样生效**
// （与 oxlint 的 `*.test.ts` 豁免不同，`architecture-policy.yaml` 的
// `exceptions: []` 里没有测试例外）。因此两个测试文件共用本装置而各自保持在限内。
import assert from "node:assert/strict";
import { ZflowClient } from "./zflowClient.js";
import { base64Encode } from "./wireBase64.js";
import { crc32Hex } from "./crc32.js";
import {
  ManualZflowTimePorts,
  type ZflowRelayState,
  type ZflowSocketLike,
} from "./zflowTypes.js";

/** 假 socket：手动驱动 opened / message / close，记录发出的文本帧。 */
export class FakeSocket implements ZflowSocketLike {
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private resolveOpen: (() => void) | null = null;
  private rejectOpen: ((error: unknown) => void) | null = null;
  readonly opened: Promise<void>;
  private messageHandler: ((data: string) => void) | null = null;
  private closeHandler: ((code: number, reason: string) => void) | null = null;
  private errorHandler: ((error: unknown) => void) | null = null;

  constructor() {
    this.opened = new Promise<void>((resolve, reject) => {
      this.resolveOpen = resolve;
      this.rejectOpen = reject;
    });
  }

  open(): void {
    this.resolveOpen?.();
  }

  failOpen(error: unknown = new Error("connect refused")): void {
    this.rejectOpen?.(error);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  setMessageHandler(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }

  setCloseHandler(handler: (code: number, reason: string) => void): void {
    this.closeHandler = handler;
  }

  setErrorHandler(handler: (error: unknown) => void): void {
    this.errorHandler = handler;
  }

  emit(frame: unknown): void {
    this.messageHandler?.(typeof frame === "string" ? frame : JSON.stringify(frame));
  }

  emitClose(code = 1006, reason = "network"): void {
    this.closeHandler?.(code, reason);
  }

  frames(): Array<Record<string, unknown>> {
    return this.sent.map((text) => JSON.parse(text) as Record<string, unknown>);
  }

  framesOfType(type: string): Array<Record<string, unknown>> {
    return this.frames().filter((frame) => frame.type === type);
  }

  /** 取所有 data 帧里指定 zcode_type 的载荷。 */
  payloadsOfType(zcodeType: string): Array<Record<string, unknown>> {
    return this.framesOfType("data")
      .map((frame) => frame.payload as Record<string, unknown>)
      .filter((payload) => payload?.zcode_type === zcodeType);
  }
}

/** 最小 zcode 连接参数（relay 只用得到 host/port/deviceMid/凭证几项）。 */
export const TEST_PARAMS = {
  backendType: "zcode",
  origin: "https://relay.example.com",
  host: "relay.example.com",
  port: null,
  deviceSid: "sid-1",
  zcodeProtocol: "v2",
  deviceMid: "mid-1",
  deviceName: "Test Phone",
  pairingId: null,
  claimSecret: null,
} as unknown as ConstructorParameters<typeof ZflowClient>[0];

export interface TestHarness {
  client: ZflowClient;
  socket: FakeSocket;
  time: ManualZflowTimePorts;
  states: ZflowRelayState[];
  logs: string[];
}

/** 建客户端 + 假 socket + 手动时间，默认完成配对并清掉 auth_init。 */
export async function setup(options: { paired?: boolean } = {}): Promise<TestHarness> {
  const time = new ManualZflowTimePorts();
  const socket = new FakeSocket();
  const states: ZflowRelayState[] = [];
  const logs: string[] = [];
  const client = new ZflowClient(TEST_PARAMS, {
    time,
    getTerminalToken: async () => "fixture-token",
    onLog: (line) => logs.push(line),
    socketFactory: () => socket,
  });
  client.relay.onState((state) => states.push(state));
  const started = client.connect();
  socket.open();
  await started;
  if (options.paired !== false) {
    socket.emit({ type: "auth_ack", device_sid: "sid-1", pair_status: "matched" });
    assert.equal(client.relay.state, "paired");
    socket.sent.length = 0; // 清掉 auth_init 便于断言
  }
  return { client, socket, time, states, logs };
}

/** 造一条入站 rpc-frame 载荷。 */
export function rpcFrame(options: {
  bridgeSessionId: string;
  messageSeq: number;
  bytes: Uint8Array;
}): Record<string, unknown> {
  return {
    zcode_type: "rpc-frame",
    bridgeSessionId: options.bridgeSessionId,
    seq: 1,
    messageSeq: options.messageSeq,
    fragmentIndex: 0,
    fragmentCount: 1,
    messageBytes: options.bytes.length,
    checksum: { algorithm: "crc32", value: crc32Hex(options.bytes) },
    dataBase64: base64Encode(options.bytes),
  };
}

/** 排空 microtask 队列（供 request/response 往返）。 */
export async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

/** mobile-view-state-update 载荷的视图（ZflowPayload 是 Record<string, unknown>）。 */
export interface MobileViewStatePayload {
  viewState: { activeWorkspaceKey?: string; activeTaskId?: string; updatedAt?: number };
  deviceInfo: { platform: string; version: string; name: string };
}

/** 取最后一条 mobile-view-state-update 载荷并按已知结构定型。 */
export function lastViewState(
  socket: FakeSocket,
): MobileViewStatePayload | undefined {
  return socket.payloadsOfType("mobile-view-state-update").at(-1) as
    | MobileViewStatePayload
    | undefined;
}

/**
 * 打开一个桥并返回其 session：发出 openBridge、用 ready 帧回填、await 完成。
 * 多数桥相关用例都要走这段样板，收敛成一处。
 */
export async function openBridgeForTest(
  harness: TestHarness,
  workspaceKey = "wk-1",
): Promise<{
  session: Awaited<ReturnType<ZflowClient["openBridge"]>>;
  bridgeSessionId: string;
}> {
  const { client, socket } = harness;
  const pending = client.openBridge(workspaceKey);
  await flushMicrotasks();
  const open = socket.payloadsOfType("workspace-bridge-open").at(-1);
  assert.ok(open, "应发出 workspace-bridge-open");
  const bridgeSessionId = open.bridgeSessionId as string;
  socket.emit({
    type: "data",
    payload: {
      zcode_type: "workspace-bridge-ready",
      bridgeSessionId,
      bridge: { bridgeSessionId, workspaceKey },
    },
  });
  const session = await pending;
  return { session, bridgeSessionId };
}
