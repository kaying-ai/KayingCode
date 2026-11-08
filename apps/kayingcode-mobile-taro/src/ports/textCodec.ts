// 小程序缺失的编码原语：UTF-8 编解码与 base64 的纯实现。
//
// 微信小程序既没有 WHATWG 的 `TextEncoder`/`TextDecoder`，也没有 `btoa`/`atob`，
// Taro 运行时也不补（产物里 grep 不到任何 polyfill）。但协议 wire 层每帧都要
// `new TextEncoder().encode(JSON.stringify(frame)).byteLength`
//（packages/shared/src/kayingcode-protocol-v4/wire-codec.ts:79-85），
// 所以这类全局必须有等价物。
//
// 语义按 WHATWG 对齐而不是「够用就行」：
//   - TextEncoder：孤立代理项替换为 U+FFFD（不抛错）；
//   - TextDecoder：默认剥离前导 BOM；`{ fatal: true }` 下非法序列抛错——
//     wire 层用 fatal 解码来判定 proto.frameAssemblyInvalidUtf8，
//     如果这里静默放过非法字节，坏帧会被当成合法帧继续往下走；
//   - btoa/atob：非法字符与非法填充抛错。
//
// 纯函数，不碰任何全局；把 shim 装到全局上的事在 runtimeGlobals.ts。
// 与原生实现的一致性由 textCodec.test.ts 的对照用例守住。

const UTF8_REPLACEMENT = 0xfffd;

/** 与 `TextEncoder.encode` 同语义（UTF-8，孤立代理项 → U+FFFD）。 */
export function encodeUtf8(text: string): Uint8Array {
  // 上界 3 字节/UTF-16 单元：BMP 内非 ASCII 最坏 3 字节，代理对占 2 单元出 4 字节。
  const out = new Uint8Array(text.length * 3);
  let offset = 0;
  for (let index = 0; index < text.length; index += 1) {
    let code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      }
    }
    const codePoint = code >= 0xd800 && code <= 0xdfff ? UTF8_REPLACEMENT : code;
    if (codePoint < 0x80) {
      out[offset] = codePoint;
      offset += 1;
    } else if (codePoint < 0x800) {
      out[offset] = 0xc0 | (codePoint >> 6);
      out[offset + 1] = 0x80 | (codePoint & 0x3f);
      offset += 2;
    } else if (codePoint < 0x10000) {
      out[offset] = 0xe0 | (codePoint >> 12);
      out[offset + 1] = 0x80 | ((codePoint >> 6) & 0x3f);
      out[offset + 2] = 0x80 | (codePoint & 0x3f);
      offset += 3;
    } else {
      out[offset] = 0xf0 | (codePoint >> 18);
      out[offset + 1] = 0x80 | ((codePoint >> 12) & 0x3f);
      out[offset + 2] = 0x80 | ((codePoint >> 6) & 0x3f);
      out[offset + 3] = 0x80 | (codePoint & 0x3f);
      offset += 4;
    }
  }
  // 用 slice 而不是 subarray：调用方（帧长度、校验和）可能直接取 `.buffer`，
  // 必须是精确长度的 ArrayBuffer，不能带上预分配的尾巴。
  return out.slice(0, offset);
}

/** 与 `TextDecoder`（utf-8）同语义；`fatal` 为真时非法序列抛错，否则替换为 U+FFFD。 */
export function decodeUtf8(bytes: Uint8Array, fatal = false): string {
  // 按 UTF-16 单元攒够一批再拼，避免逐字符连接退化成 O(n²)。
  const chunks: string[] = [];
  let units: number[] = [];
  let firstCodePoint = true;
  let codePoint = 0;
  let continuationBytes = 0;
  let lowerBoundary = 0x80;
  let upperBoundary = 0xbf;

  const flush = (): void => {
    if (units.length === 0) return;
    chunks.push(String.fromCharCode(...units));
    units = [];
  };

  const emit = (value: number): void => {
    if (firstCodePoint) {
      firstCodePoint = false;
      // TextDecoder 默认 ignoreBOM:false：只剥离最前面那一个 BOM。
      if (value === 0xfeff) return;
    }
    if (value > 0xffff) {
      const rest = value - 0x10000;
      units.push(0xd800 + (rest >> 10), 0xdc00 + (rest & 0x3ff));
    } else {
      units.push(value);
    }
    if (units.length >= 2048) flush();
  };

  const invalid = (): void => {
    continuationBytes = 0;
    lowerBoundary = 0x80;
    upperBoundary = 0xbf;
    if (fatal) throw new Error("decodeUtf8: invalid UTF-8 sequence");
    emit(UTF8_REPLACEMENT);
  };

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    if (continuationBytes === 0) {
      if (byte <= 0x7f) {
        emit(byte);
      } else if (byte >= 0xc2 && byte <= 0xdf) {
        continuationBytes = 1;
        codePoint = byte & 0x1f;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        continuationBytes = 2;
        codePoint = byte & 0x0f;
        // 0xE0 后接 80..9F、0xED 后接 A0..BF 分别是过长编码与代理项，必须拒。
        lowerBoundary = byte === 0xe0 ? 0xa0 : 0x80;
        upperBoundary = byte === 0xed ? 0x9f : 0xbf;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        continuationBytes = 3;
        codePoint = byte & 0x07;
        // 同上：0xF0 后接 80..8F 过长，0xF4 后接 90..BF 超出 U+10FFFF。
        lowerBoundary = byte === 0xf0 ? 0x90 : 0x80;
        upperBoundary = byte === 0xf4 ? 0x8f : 0xbf;
      } else {
        invalid();
      }
      continue;
    }
    if (byte < lowerBoundary || byte > upperBoundary) {
      // 续字节非法：丢掉这半个序列，本字节按新序列起点重试（WHATWG 的「最大子部分」规则）。
      index -= 1;
      invalid();
      continue;
    }
    codePoint = (codePoint << 6) | (byte & 0x3f);
    continuationBytes -= 1;
    lowerBoundary = 0x80;
    upperBoundary = 0xbf;
    if (continuationBytes === 0) emit(codePoint);
  }
  // 输入在序列中途结束：同样算非法。
  if (continuationBytes !== 0) invalid();
  flush();
  return chunks.join("");
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

function base64Value(charCode: number): number {
  return charCode < 128 ? BASE64_LOOKUP[charCode]! : -1;
}

/** 与 `btoa` 等价的 base64 编码。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset]!;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    out += BASE64_ALPHABET[first >> 2];
    out += BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    out += second === undefined ? "=" : BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    out += third === undefined ? "=" : BASE64_ALPHABET[third & 0x3f];
  }
  return out;
}

/** 与 `atob` 等价的 base64 解码：容忍 ASCII 空白，拒绝非法字符与非法填充。 */
export function base64ToBytes(base64: string): Uint8Array {
  const compact = base64.replace(/[\t\n\f\r ]/g, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const body = compact.slice(0, compact.length - padding);
  if (body.includes("=") || (body.length + padding) % 4 !== 0) {
    throw new Error("base64ToBytes: invalid base64 padding");
  }
  const out = new Uint8Array(((body.length * 6) / 8) | 0);
  let accumulator = 0;
  let bits = 0;
  let offset = 0;
  for (let index = 0; index < body.length; index += 1) {
    const value = base64Value(body.charCodeAt(index));
    if (value < 0) throw new Error("base64ToBytes: invalid base64 character");
    accumulator = ((accumulator << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[offset] = (accumulator >> bits) & 0xff;
      offset += 1;
    }
  }
  return out;
}
