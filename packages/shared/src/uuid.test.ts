import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "vitest";
import { createUuid, uuidv7 } from "./uuid.js";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const scope = globalThis as unknown as { crypto?: unknown };

/**
 * 读取同目录源文件并剥掉注释：断言的是**代码**，说明文字里提到这些字样不算违规
 * （注释恰恰要写清楚「为什么不能这么写」）。
 */
async function executableSource(relativePath: string): Promise<string> {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** 小程序运行时的样子：没有 `crypto` 这个全局。 */
function withoutCrypto<T>(run: () => T): T {
  const saved = scope.crypto;
  Reflect.deleteProperty(globalThis, "crypto");
  try {
    assert.equal("crypto" in globalThis, false);
    return run();
  } finally {
    scope.crypto = saved;
  }
}

describe("uuidv7", () => {
  test("writes the 48-bit timestamp big-endian with v7 version and RFC 4122 variant", () => {
    const now = 0x0192_3456_789a;
    const value = uuidv7(now);
    assert.match(value, UUID_V7);
    assert.equal(value.replace(/-/g, "").slice(0, 12), now.toString(16).padStart(12, "0"));
  });

  test("still encodes the timestamp when the host has no WebCrypto global", () => {
    const now = 0x0192_3456_789a;
    const value = withoutCrypto(() => uuidv7(now));
    assert.match(value, UUID_V7);
    assert.equal(value.replace(/-/g, "").slice(0, 12), now.toString(16).padStart(12, "0"));
  });

  test("generates distinct ids without a WebCrypto global", () => {
    const values = withoutCrypto(() => new Set(Array.from({ length: 200 }, () => uuidv7())));
    assert.equal(values.size, 200);
  });
});

describe("createUuid", () => {
  test("falls back to the random-byte path without a WebCrypto global", () => {
    const values = withoutCrypto(() => Array.from({ length: 50 }, () => createUuid()));
    for (const value of values) assert.match(value, UUID_V4);
    assert.equal(new Set(values).size, values.length);
  });
});

describe("宿主兼容纪律", () => {
  // 这两条在 Node 里跑不出来（Node 有 BigInt 也有 crypto），但它们正是小程序崩溃
  // 的成因，所以按源码断言守住：
  //   - 裸 `crypto` 在小程序是 ReferenceError（微信运行时没有该全局）；
  //   - `0xffn` 这类大整数字面量在 iOS 14 以下的 JavaScriptCore 是语法错误。
  test("does not reference a bare crypto global", async () => {
    const code = await executableSource("./uuid.ts");
    assert.doesNotMatch(code, /(^|[^.\w])crypto\s*\./);
  });

  test("does not use a bigint literal that older JavaScriptCore cannot parse", async () => {
    const code = await executableSource("./uuid.ts");
    assert.doesNotMatch(code, /\bBigInt\b|\d+n\b/);
  });
});
