function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

/**
 * 取 `byteLength` 个随机字节：优先 WebCrypto。`globalThis.crypto` 在浏览器、Node ≥19、
 * 以及补了 shim 的宿主（小程序 bundle 由 `apps/kayingcode-mobile-taro/src/ports/
 * runtimeGlobals.ts` 装入 `getRandomValues`）都存在；宿主完全没有时退化为
 * Math.random——uuid 的随机段只承担唯一性（commandId 幂等键、设备指纹展示值），
 * 不承担保密性，凭据与签名走各自协议的密码学路径。
 *
 * 不写裸 `crypto`：小程序没有该全局，裸引用是 ReferenceError。
 */
function randomBytes(byteLength: number): Uint8Array {
  // 显式用 ArrayBuffer 构造：getRandomValues 只接受 ArrayBuffer 支撑的视图
  //（`SharedArrayBuffer` 会被类型系统拒掉），也让返回值的宽窄与签名一致。
  const bytes = new Uint8Array(new ArrayBuffer(byteLength));
  const runtimeCrypto = globalThis.crypto;
  if (typeof runtimeCrypto?.getRandomValues === "function") {
    runtimeCrypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** 普通 main command 与 background wake 共用 UUID v7（48-bit 时间戳 + 随机位）。 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  // 48-bit 大端时间戳逐字节写入，不用 BigInt：`0xffn` 这类字面量在 iOS 14 以下的
  // JavaScriptCore（小程序 / 旧 WebView）是**语法错误**，会让整个包加载即失败。
  const ms = Math.floor(now);
  for (let index = 0; index < 6; index += 1) {
    bytes[5 - index] = Math.floor(ms / 2 ** (8 * index)) % 256;
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = Array.from(bytes, byteToHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatUuid(bytes: Uint8Array): string {
  const normalized = new Uint8Array(bytes);
  normalized[6] = (normalized[6]! & 0x0f) | 0x40;
  normalized[8] = (normalized[8]! & 0x3f) | 0x80;

  const segments = [
    normalized.slice(0, 4),
    normalized.slice(4, 6),
    normalized.slice(6, 8),
    normalized.slice(8, 10),
    normalized.slice(10, 16),
  ];

  return segments.map((segment) => Array.from(segment, byteToHex).join("")).join("-");
}

export function createUuid(): string {
  const runtimeCrypto = globalThis.crypto;
  // 部分移动端 WebView 只有 `crypto` 对象但没有 `randomUUID()`（非 secure context
  // 下该方法不可见），之前 UI 初始化直接调用会在首屏崩掉；这里回落到
  // getRandomValues，再退化到 Math.random，保证至少能生成 tab / history 的临时 ID。
  if (typeof runtimeCrypto?.randomUUID === "function") {
    return runtimeCrypto.randomUUID();
  }

  return formatUuid(randomBytes(16));
}
