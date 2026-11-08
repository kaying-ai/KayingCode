// IPC 值编解码 + 13 字节帧封装。
//
// 对齐 Flutter lib/protocol/ipc_codec.dart（web 客户端的 `Sm`/`Cm`/`Mne`/`Nne`）。
// 类型标签：Undefined=0, String=1, Buffer=2, VSBuffer=3, Array=4, Object=5(JSON),
// Int=6；长度/计数为 7-bit 小端 varint。
// 本包为 NodeNext 模块解析：相对导入必须带 .js 后缀。
import type { ZcodeBinary } from "./zflowTypes.js";

export const VALUE_TAG_UNDEFINED = 0;
export const VALUE_TAG_STRING = 1;
export const VALUE_TAG_BUFFER = 2;
export const VALUE_TAG_VSBUFFER = 3;
export const VALUE_TAG_ARRAY = 4;
export const VALUE_TAG_OBJECT = 5;
export const VALUE_TAG_INT = 6;

export class ValueWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  writeByte(value: number): void {
    this.push(new Uint8Array([value & 0xff]));
  }

  writeVarint(value: number): void {
    let v = value;
    for (;;) {
      let byte = v & 0x7f;
      v >>>= 7;
      if (v > 0) byte |= 0x80;
      this.chunks.push(new Uint8Array([byte]));
      this.length += 1;
      if (v === 0) break;
    }
  }

  writeBytes(bytes: Uint8Array): void {
    this.push(bytes);
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  private push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }
}

export class ValueReader {
  constructor(
    readonly data: Uint8Array,
    private pos = 0,
  ) {}

  get remaining(): number {
    return this.data.length - this.pos;
  }

  read(n: number): Uint8Array {
    if (this.pos + n > this.data.length) {
      throw new RangeError(
        `ValueReader: cannot read ${n} bytes, only ${this.data.length - this.pos} remaining`,
      );
    }
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  readVarint(): number {
    let value = 0;
    let shift = 0;
    while (this.pos < this.data.length) {
      const b = this.data[this.pos]!;
      this.pos += 1;
      value += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return value;
      shift += 7;
      if (shift >= 35) break;
    }
    throw new RangeError(`ValueReader: invalid varint at pos ${this.pos}`);
  }
}

/** 编码一个值。非负 ≤0x7FFFFFFF 的整数走 Int 标签，其余对象走 JSON。 */
export function encodeValue(writer: ValueWriter, value: unknown): void {
  if (value === null || value === undefined) {
    writer.writeByte(VALUE_TAG_UNDEFINED);
    return;
  }
  if (typeof value === "string") {
    const bytes = utf8Encode(value);
    writer.writeByte(VALUE_TAG_STRING);
    writer.writeVarint(bytes.length);
    writer.writeBytes(bytes);
    return;
  }
  if (value instanceof Uint8Array) {
    writer.writeByte(VALUE_TAG_VSBUFFER);
    writer.writeVarint(value.length);
    writer.writeBytes(value);
    return;
  }
  if (Array.isArray(value)) {
    writer.writeByte(VALUE_TAG_ARRAY);
    writer.writeVarint(value.length);
    for (const item of value) encodeValue(writer, item);
    return;
  }
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0x7fffffff
  ) {
    writer.writeByte(VALUE_TAG_INT);
    writer.writeVarint(value);
    return;
  }
  const bytes = utf8Encode(JSON.stringify(value));
  writer.writeByte(VALUE_TAG_OBJECT);
  writer.writeVarint(bytes.length);
  writer.writeBytes(bytes);
}

/** 解码一个值。Buffer/VSBuffer 都返回 Uint8Array。 */
export function decodeValue(reader: ValueReader): unknown {
  const tag = reader.read(1)[0]!;
  switch (tag) {
    case VALUE_TAG_UNDEFINED:
      return null;
    case VALUE_TAG_STRING:
      return utf8Decode(reader.read(reader.readVarint()));
    case VALUE_TAG_BUFFER:
    case VALUE_TAG_VSBUFFER:
      return reader.read(reader.readVarint());
    case VALUE_TAG_ARRAY: {
      const count = reader.readVarint();
      const out: unknown[] = [];
      for (let i = 0; i < count; i += 1) out.push(decodeValue(reader));
      return out;
    }
    case VALUE_TAG_OBJECT:
      return JSON.parse(utf8Decode(reader.read(reader.readVarint()))) as unknown;
    case VALUE_TAG_INT:
      return reader.readVarint();
    default:
      throw new RangeError(`unknown value tag ${tag}`);
  }
}

// ── IPC 帧封装 ────────────────────────────────────────────────────────────
// 13 字节头 `[type:u8][id:u32be][ack:u32be][bodyLen:u32be]` + body。

export const IPC_TYPE_REGULAR = 1;
export const IPC_HEADER_BYTES = 13;

export function ipcFrameEncode(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(IPC_HEADER_BYTES + body.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, IPC_TYPE_REGULAR);
  view.setUint32(1, 0);
  view.setUint32(5, 0);
  view.setUint32(9, body.length);
  out.set(body, IPC_HEADER_BYTES);
  return out;
}

/** 增量解析器：喂任意分块，吐完整 regular 帧的 body（共享底层内存）。 */
export class IpcFrameParser {
  private buffer: Uint8Array = new Uint8Array(0);

  acceptChunk(chunk: Uint8Array): ZcodeBinary[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    const out: ZcodeBinary[] = [];
    let offset = 0;
    while (merged.length - offset >= IPC_HEADER_BYTES) {
      const view = new DataView(merged.buffer, merged.byteOffset + offset);
      const type = view.getUint8(0);
      const bodyLen = view.getUint32(9);
      const total = IPC_HEADER_BYTES + bodyLen;
      if (merged.length - offset < total) break;
      if (type === IPC_TYPE_REGULAR) {
        out.push(merged.subarray(offset + IPC_HEADER_BYTES, offset + total));
      }
      offset += total;
    }
    this.buffer = merged.subarray(offset);
    return out;
  }
}

// ── UTF-8（weapp 无 TextEncoder/TextDecoder，由运行时全局兜底，这里再守一层） ──

export function utf8Encode(text: string): Uint8Array {
  const globalEncoder = (globalThis as Record<string, unknown>).TextEncoder as
    | (new () => { encode(input: string): Uint8Array })
    | undefined;
  if (typeof globalEncoder === "function") return new globalEncoder().encode(text);
  // 兜底：手动 UTF-8 编码（与 WHATWG 语义一致；孤立代理项 → U+FFFD）。
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return new Uint8Array(bytes);
}

export function utf8Decode(bytes: Uint8Array): string {
  const globalDecoder = (globalThis as Record<string, unknown>).TextDecoder as
    | (new () => { decode(input: Uint8Array): string })
    | undefined;
  if (typeof globalDecoder === "function") return new globalDecoder().decode(bytes);
  // 兜底：手动 UTF-8 解码（非法序列 → U+FFFD，不致命）。
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let code: number;
    if (b < 0x80) {
      code = b;
      i += 1;
    } else if (b < 0xe0 && i + 1 < bytes.length && (bytes[i + 1]! & 0xc0) === 0x80) {
      code = ((b & 0x1f) << 6) | (bytes[i + 1]! & 0x3f);
      i += 2;
    } else if (
      b < 0xf0 &&
      i + 2 < bytes.length &&
      (bytes[i + 1]! & 0xc0) === 0x80 &&
      (bytes[i + 2]! & 0xc0) === 0x80
    ) {
      code = ((b & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f);
      i += 3;
    } else if (
      b < 0xf8 &&
      i + 3 < bytes.length &&
      (bytes[i + 1]! & 0xc0) === 0x80 &&
      (bytes[i + 2]! & 0xc0) === 0x80 &&
      (bytes[i + 3]! & 0xc0) === 0x80
    ) {
      code =
        ((b & 0x07) << 18) |
        ((bytes[i + 1]! & 0x3f) << 12) |
        ((bytes[i + 2]! & 0x3f) << 6) |
        (bytes[i + 3]! & 0x3f);
      i += 4;
    } else {
      code = 0xfffd;
      i += 1;
    }
    if (code >= 0x10000) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}
