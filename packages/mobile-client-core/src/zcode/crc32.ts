// IEEE CRC-32（多项式 0xEDB88320，反射输入/输出）。
// 对齐 Flutter lib/protocol/crc32.dart，即 zcode web 客户端的 `Bf`；
// rpc-frame 的 checksum 用它做十六进制串。

const TABLE = /* @__PURE__ */ buildTable();

function buildTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

/** 计算字节序列的 CRC-32（无符号 32 位）。 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 十六进制串形式（8 位小写，补零），与 Dart `hexOf` 一致。 */
export function crc32Hex(bytes: Uint8Array): string {
  return crc32(bytes).toString(16).padStart(8, "0");
}
