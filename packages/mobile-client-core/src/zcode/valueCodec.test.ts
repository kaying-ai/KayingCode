// IPC 值编解码 + 13 字节帧封装。
// 对齐 Flutter lib/protocol/ipc_codec.dart（web 客户端 `Sm`/`Cm`/`Mne`/`Nne`）。
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  IPC_HEADER_BYTES,
  IPC_TYPE_REGULAR,
  IpcFrameParser,
  ValueReader,
  ValueWriter,
  decodeValue,
  encodeValue,
  ipcFrameEncode,
  utf8Decode,
  utf8Encode,
} from "./valueCodec.js";

/** 编一个值再解回。 */
function roundTrip(value: unknown): unknown {
  const writer = new ValueWriter();
  encodeValue(writer, value);
  return decodeValue(new ValueReader(writer.toBytes()));
}

test("valueCodec 标量往返：字符串 / 整数 / null / undefined", () => {
  assert.equal(roundTrip("hello"), "hello");
  assert.equal(roundTrip(""), "");
  assert.equal(roundTrip(0), 0);
  assert.equal(roundTrip(12345), 12345);
  assert.equal(roundTrip(0x7fffffff), 0x7fffffff);
  assert.equal(roundTrip(null), null);
  assert.equal(roundTrip(undefined), null);
});

test("valueCodec 容器往返：嵌套数组与对象 / 字节缓冲", () => {
  assert.deepEqual(roundTrip([1, "two", null, [3, 4]]), [1, "two", null, [3, 4]]);
  assert.deepEqual(roundTrip({ a: 1, b: "x", c: { d: [true] } }), {
    a: 1,
    b: "x",
    c: { d: [true] },
  });
  const bytes = roundTrip(new Uint8Array([0, 1, 250, 255])) as Uint8Array;
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(Array.from(bytes), [0, 1, 250, 255]);
});

test("valueCodec UTF-8 往返：中文 / emoji / 代理对", () => {
  for (const text of ["你好，世界", "🚀🎯", "a你b🚀c", "ﬀ", "\u{10ffff}"]) {
    assert.equal(roundTrip(text), text, `roundtrip ${text}`);
  }
});

test("valueCodec 负数与大整数走 JSON 对象标签（非 Int 标签）", () => {
  // 只有非负且 ≤0x7FFFFFFF 的整数走 Int；其余退化为 JSON。
  assert.equal(roundTrip(-1), -1);
  assert.equal(roundTrip(-99999), -99999);
  assert.equal(roundTrip(2 ** 40), 2 ** 40);
  assert.equal(roundTrip(1.5), 1.5);
});

test("valueCodec varint 为 7-bit 小端编码", () => {
  const writer = new ValueWriter();
  writer.writeVarint(300);
  // 300 = 0b100101100 → 低 7 位 0b0101100=0x2c|0x80=0xac，高 7 位 0b10=0x02。
  assert.deepEqual(Array.from(writer.toBytes()), [0xac, 0x02]);
});

test("valueCodec 截断流：读越界抛 RangeError 而不是静默返回半截", () => {
  // 声明一个 5 字节字符串但只给 2 字节。
  const writer = new ValueWriter();
  writer.writeByte(1); // VALUE_TAG_STRING
  writer.writeVarint(5);
  writer.writeBytes(new Uint8Array([0x61, 0x62]));
  assert.throws(() => decodeValue(new ValueReader(writer.toBytes())), RangeError);
});

test("valueCodec 孤立代理项编码为 U+FFFD（与 WHATWG 语义一致）", () => {
  // 孤立高位代理（无配对低位）→ 替换字符。
  assert.equal(roundTrip("\ud800"), "\ufffd");
  // 孤立低位代理同理。
  assert.equal(roundTrip("\udc00"), "\ufffd");
  assert.equal(roundTrip("a\ud800b"), "a\ufffdb");
  // 合法代理对不被替换。
  assert.equal(roundTrip("\ud83d\ude80"), "🚀");
});

test("valueCodec 未知标签抛错", () => {
  assert.throws(() => decodeValue(new ValueReader(new Uint8Array([99]))), /unknown value tag/);
});

test("valueCodec 空输入解码抛 RangeError（无法读标签）", () => {
  assert.throws(() => decodeValue(new ValueReader(new Uint8Array(0))), RangeError);
});

test("utf8Encode/utf8Decode 互为逆（含非法字节 → U+FFFD）", () => {
  const text = "测试 text 🚀";
  assert.equal(utf8Decode(utf8Encode(text)), text);
  // 逐个非法序列都与运行时 TextDecoder 对齐（替换字符数一致、不抛错）。
  for (const bytes of [[0x80], [0xe4, 0xbd], [0xff, 0xfe], [0xc0, 0x80], [0xf0, 0x9f]]) {
    const input = new Uint8Array(bytes);
    assert.equal(
      utf8Decode(input),
      new TextDecoder().decode(input),
      `utf8Decode(${JSON.stringify(bytes)})`,
    );
  }
  // 单独一个继续字节是非法的 → 恰好一个替换字符。
  assert.equal(utf8Decode(new Uint8Array([0x80])), "\ufffd");
  // 截断的三字节序列整体算一个替换字符（与 WHATWG 一致）。
  assert.equal(utf8Decode(new Uint8Array([0xe4, 0xbd])), "\ufffd");
});

test("utf8Encode 与 Node Buffer 对拍", () => {
  for (const text of ["", "ascii", "中文混合 English", "🚀", "\u{1f600}\u{10ffff}"]) {
    assert.deepEqual(Array.from(utf8Encode(text)), Array.from(Buffer.from(text, "utf8")), text);
  }
});

// ── 13 字节 IPC 帧 ───────────────────────────────────────────────────────

test("ipcFrameEncode 写出 13 字节头 + body", () => {
  const body = new Uint8Array([1, 2, 3]);
  const frame = ipcFrameEncode(body);
  assert.equal(frame.length, IPC_HEADER_BYTES + 3);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  assert.equal(view.getUint8(0), IPC_TYPE_REGULAR);
  assert.equal(view.getUint32(9), 3);
  assert.deepEqual(Array.from(frame.subarray(IPC_HEADER_BYTES)), [1, 2, 3]);
});

test("IpcFrameParser 逐块喂入任意切分都能还原 body", () => {
  const bodies = [new Uint8Array([1]), new Uint8Array([2, 3, 4, 5]), new Uint8Array(0)];
  const stream = new Uint8Array(bodies.reduce((sum, b) => sum + IPC_HEADER_BYTES + b.length, 0));
  let offset = 0;
  for (const body of bodies) {
    const frame = ipcFrameEncode(body);
    stream.set(frame, offset);
    offset += frame.length;
  }
  // 每次只喂 3 字节，强制跨块重组。
  const parser = new IpcFrameParser();
  const out: Uint8Array[] = [];
  for (let i = 0; i < stream.length; i += 3) {
    out.push(...parser.acceptChunk(stream.subarray(i, Math.min(i + 3, stream.length))));
  }
  assert.equal(out.length, bodies.length);
  for (let i = 0; i < bodies.length; i += 1) {
    assert.deepEqual(Array.from(out[i]!), Array.from(bodies[i]!), `frame ${i}`);
  }
});

test("IpcFrameParser 对半截帧保持挂起，补齐后才吐出", () => {
  const frame = ipcFrameEncode(new Uint8Array([9, 8, 7, 6, 5]));
  const parser = new IpcFrameParser();
  // 先喂头 + 2 字节 body：不足一帧。
  assert.equal(parser.acceptChunk(frame.subarray(0, IPC_HEADER_BYTES + 2)).length, 0);
  // 补齐剩余。
  const rest = parser.acceptChunk(frame.subarray(IPC_HEADER_BYTES + 2));
  assert.equal(rest.length, 1);
  assert.deepEqual(Array.from(rest[0]!), [9, 8, 7, 6, 5]);
});

test("IpcFrameParser 跳过非 regular 类型帧并继续解析后续帧", () => {
  const control = ipcFrameEncode(new Uint8Array([0xaa]));
  // 把类型字节从 regular(1) 改成未知类型(9)。
  new DataView(control.buffer, control.byteOffset, control.byteLength).setUint8(0, 9);
  const regular = ipcFrameEncode(new Uint8Array([0xbb, 0xcc]));
  const merged = new Uint8Array(control.length + regular.length);
  merged.set(control, 0);
  merged.set(regular, control.length);
  const out = new IpcFrameParser().acceptChunk(merged);
  assert.equal(out.length, 1);
  assert.deepEqual(Array.from(out[0]!), [0xbb, 0xcc]);
});
