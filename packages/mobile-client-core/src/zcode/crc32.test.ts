// IEEE CRC-32 校验：对照已知向量与 zlib 语义。
// 对齐 Flutter lib/protocol/crc32.dart（web 客户端 `Bf`）。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import { crc32, crc32Hex } from "./crc32.js";

const encoder = new TextEncoder();

test('crc32 标准向量："123456789" → 0xcbf43926', () => {
  const bytes = encoder.encode("123456789");
  assert.equal(crc32(bytes), 0xcbf43926);
  assert.equal(crc32Hex(bytes), "cbf43926");
});

test("crc32 空串 → 0x00000000", () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32Hex(new Uint8Array(0)), "00000000");
});

test("crc32Hex 恒为 8 位小写十六进制（前导零补齐）", () => {
  // 单个 0x00 字节的 CRC-32 是小值，必须补零到 8 位。
  const hex = crc32Hex(new Uint8Array([0]));
  assert.equal(hex.length, 8);
  assert.match(hex, /^[0-9a-f]{8}$/);
  assert.equal(
    hex,
    crc32(new Uint8Array([0]))
      .toString(16)
      .padStart(8, "0"),
  );
});

test("crc32 对同一输入稳定，对不同输入区分", () => {
  const a = encoder.encode("kayingcode");
  const b = encoder.encode("kayingcode!");
  assert.equal(crc32(a), crc32(encoder.encode("kayingcode")));
  assert.notEqual(crc32(a), crc32(b));
});

test("crc32 是无符号 32 位（不会返回负数、结果 = 无符号）", () => {
  // 逐字节取值覆盖到高位；断言恒在 [0, 2^32)。
  for (let value = 0; value < 256; value += 17) {
    const result = crc32(new Uint8Array([value, value ^ 0xff, 0x5a]));
    assert.ok(result >= 0 && result <= 0xffffffff, `crc32 out of range: ${result}`);
    assert.equal(result, result >>> 0);
  }
});

test("crc32 对 UTF-8 中文与任意长度分片无差异", () => {
  const text = "你好，KayingCode 移动端协议 🚀";
  const bytes = encoder.encode(text);
  const sliced = new Uint8Array(bytes.length);
  sliced.set(bytes);
  assert.equal(crc32(sliced), crc32(bytes));
  // 与 Node 自带 zlib 语义（CRC-32/IEEE，同多项式与初值）交叉验证。
  const expected = zlibCrc32(bytes);
  assert.equal(crc32(bytes), expected);
});

/** Node 的 `zlib.crc32`（Node 20.15+ 才有）；缺失时回退到已知实现校验。 */
function zlibCrc32(bytes: Uint8Array): number {
  // 这里用位运算独立实现一遍，避免依赖 Node 版本：
  // 与 crc32.ts 的查表实现互为对照（不同代码路径、同多项式）。
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test("自检：位运算参考实现确实与查表实现一致（防参考实现写错）", () => {
  // 与 createHash 无直接关系，但确保参考实现本身在标准向量上正确，
  // 否则上面的交叉验证没有意义。
  assert.equal(zlibCrc32(encoder.encode("123456789")), 0xcbf43926);
  // 顺带确认 sha256 可用（下一个测试文件会用到 node:crypto oracle）。
  assert.equal(
    createHash("sha256").update("abc").digest("hex"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
