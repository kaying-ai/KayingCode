// 纯 TS base64（RFC 4648 标准 alphabet，带 padding）。
//
// rpc-frame 的 dataBase64 载荷编解码用。weapp 没有 Buffer/atob/btoa 由宿主
// 注入（runtimeGlobals），这里完全不依赖平台，保证任何运行时一致。

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const INVERSE = /* @__PURE__ */ buildInverse();

function buildInverse(): Int16Array {
  const inverse = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) {
    inverse[ALPHABET.charCodeAt(i)] = i;
  }
  return inverse;
}

export function base64Encode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[(n >> 18) & 0x3f]!;
    out += ALPHABET[(n >> 12) & 0x3f]!;
    out += ALPHABET[(n >> 6) & 0x3f]!;
    out += ALPHABET[n & 0x3f]!;
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[(n >> 18) & 0x3f]!;
    out += ALPHABET[(n >> 12) & 0x3f]!;
    out += "==";
  } else if (remaining === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[(n >> 18) & 0x3f]!;
    out += ALPHABET[(n >> 12) & 0x3f]!;
    out += ALPHABET[(n >> 6) & 0x3f]!;
    out += "=";
  }
  return out;
}

export function base64Decode(text: string): Uint8Array {
  const length = text.length;
  if (length === 0) return new Uint8Array(0);
  // 长度必须是 4 的倍数（Dart `base64.decode` 拒绝 "Zg"、"Zg="——padding 必填）。
  if (length % 4 !== 0) throw new RangeError("invalid base64 length");
  let padding = 0;
  for (let i = length - 1; i >= 0 && text[i] === "="; i -= 1) padding += 1;
  // padding 至多 2 个；"====" 与 "A===" 都会被拒。padding 只能出现在整串末尾，
  // 因此 "Zm9v=" 也不合法（Dart 同样拒绝）。
  if (padding > 2) throw new RangeError("invalid base64 padding");
  const chars = length - padding;
  if (chars % 4 === 1) throw new RangeError("invalid base64 length");
  // 4 的倍数长度下 chars % 4 只可能是 0/2/3：分别对应 0/1/2 个 padding。
  // "Zm9vYmE"（chars % 4 === 3 却无 padding）由上面的长度检查拦掉。
  const expectedPadding = chars % 4 === 0 ? 0 : 4 - (chars % 4);
  if (padding !== expectedPadding) throw new RangeError("invalid base64 padding");
  const out = new Uint8Array((chars * 3) >> 2);
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (let i = 0; i < chars; i += 1) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? INVERSE[code]! : -1;
    if (value < 0) throw new RangeError(`invalid base64 char at ${i}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  // 尾部不足一个字节的残留位必须为 0（Dart 拒绝 "Zh=="、"AAB="、"Zm9vYmF="）。
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new RangeError("invalid base64 trailing bits");
  }
  return out;
}
