import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { configureRandomSource, prewarmRandomSource, randomBytes } from "./randomSource";
import { installRuntimeGlobals } from "./runtimeGlobals";

const scope = globalThis as unknown as Record<string, unknown>;

const MISSING_GLOBALS = ["TextEncoder", "TextDecoder", "btoa", "atob", "crypto"] as const;

/** 还原成小程序运行时的样子：这些全局一个都没有。返回还原函数。 */
function withoutWebGlobals(): () => void {
  const saved = new Map<string, unknown>();
  for (const name of MISSING_GLOBALS) {
    saved.set(name, scope[name]);
    Reflect.deleteProperty(globalThis, name);
    assert.equal(name in globalThis, false, name);
  }
  return () => {
    for (const name of MISSING_GLOBALS) scope[name] = saved.get(name);
  };
}

describe("installRuntimeGlobals", () => {
  test("keeps the platform implementation when the host already has one", () => {
    const encoder = globalThis.TextEncoder;
    const decoder = globalThis.TextDecoder;
    const cryptoGlobal = globalThis.crypto;
    installRuntimeGlobals(null);
    assert.equal(globalThis.TextEncoder, encoder);
    assert.equal(globalThis.TextDecoder, decoder);
    assert.equal(globalThis.crypto, cryptoGlobal);
  });

  test("fills in every global a mini program runtime lacks", () => {
    const restore = withoutWebGlobals();
    try {
      installRuntimeGlobals(async (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes.fill(0x5a);
        return bytes;
      });

      assert.equal(new TextDecoder().decode(new TextEncoder().encode("中文 ascii 🌟")), "中文 ascii 🌟");
      assert.equal(new TextDecoder().decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), "a");
      assert.throws(() => new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array([0x80])));
      assert.throws(() => new TextDecoder("gbk"), RangeError);

      assert.equal(atob(btoa("hello")), "hello");
      assert.equal(atob(btoa("\u00ff\u0000")), "\u00ff\u0000");
      assert.throws(() => btoa("中"));

      const target = new Uint8Array(16);
      assert.equal(crypto.getRandomValues(target), target);
      assert.equal(target.length, 16);
      // 随机段不能是一个常量（这里只断言不是全零）。
      assert.notDeepEqual([...target], [...new Uint8Array(16)]);
      assert.equal(crypto.getRandomValues(new Uint32Array(4)).length, 4);
    } finally {
      restore();
    }
  });

  test("is idempotent", () => {
    const restore = withoutWebGlobals();
    try {
      installRuntimeGlobals(null);
      const encoder = globalThis.TextEncoder;
      const cryptoGlobal = globalThis.crypto;
      installRuntimeGlobals(null);
      assert.equal(globalThis.TextEncoder, encoder);
      assert.equal(globalThis.crypto, cryptoGlobal);
    } finally {
      restore();
    }
  });
});

/** 等一个宏任务，让在途的池续满先落地。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 排空池：先切断平台源，避免排空动作本身又触发一次续满。 */
function drainPool(): void {
  configureRandomSource(null);
  randomBytes(4096);
}

describe("randomSource", () => {
  test("returns the requested byte length without a platform source", () => {
    configureRandomSource(null);
    assert.equal(randomBytes(32).length, 32);
  });

  test("draws from the platform pool once warm", async () => {
    await settle();
    drainPool();
    configureRandomSource(async (byteLength) => new Uint8Array(byteLength).fill(0xab));
    prewarmRandomSource();
    await settle();
    assert.deepEqual([...randomBytes(8)], [...new Uint8Array(8).fill(0xab)]);
    configureRandomSource(null);
  });

  test("does not fail when the platform source rejects", async () => {
    configureRandomSource(() => Promise.reject(new Error("基础库过低")));
    prewarmRandomSource();
    await settle();
    assert.equal(randomBytes(4).length, 4);
    configureRandomSource(null);
  });
});
