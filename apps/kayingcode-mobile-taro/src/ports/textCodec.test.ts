import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from "./textCodec";

// 参照实现就是宿主原生的 TextEncoder/TextDecoder/Buffer：这是小程序缺失的全局的
// 替代品，逐字节对齐才能保证桌面端与小程序算出的帧长、校验和、base64 完全一致。
const VALID = [
  "",
  "ascii only",
  "中文",
  "日本語テキスト",
  "한국어",
  "Ünïcödé àccents",
  "emoji 🎉🚀",
  "family 👨👩👧👦",
  "mixed 中文 ascii 🌟 café",
  "ctrl \u0000\u001f\u007f",
  "max \u{10ffff}",
  "a\uFEFFb",
  "line\nbreak\ttab",
];

const INVALID = [
  [0x80],
  [0xbf],
  [0xc0, 0x80],
  [0xc1, 0xbf],
  [0xc2],
  [0xc2, 0x41],
  [0xe0, 0x80, 0x80],
  [0xed, 0xa0, 0x80],
  [0xe4, 0xb8],
  [0xf4, 0x90, 0x80, 0x80],
  [0xf0, 0x9f, 0x92],
  [0xf5, 0x80, 0x80, 0x80],
  [0x41, 0xe4, 0xb8],
  [0xff, 0xfe],
  [0xef, 0xbb],
];

describe("UTF-8 编码（TextEncoder 的替代）", () => {
  test("matches the platform TextEncoder byte for byte", () => {
    for (const text of VALID) {
      assert.deepEqual([...encodeUtf8(text)], [...new TextEncoder().encode(text)], text);
    }
  });

  test("replaces lone surrogates with U+FFFD like the platform does", () => {
    for (const text of ["a\uD800b", "\uDC00", "\uD83D", "x\uD83Dy"]) {
      assert.deepEqual([...encodeUtf8(text)], [...new TextEncoder().encode(text)], JSON.stringify(text));
    }
  });

  test("returns an exactly sized buffer", () => {
    const bytes = encodeUtf8("中");
    assert.equal(bytes.byteLength, 3);
    assert.equal(bytes.buffer.byteLength, 3);
  });
});

describe("UTF-8 解码（TextDecoder 的替代）", () => {
  test("matches the platform TextDecoder for valid input", () => {
    for (const text of VALID) {
      const bytes = new TextEncoder().encode(text);
      assert.equal(decodeUtf8(bytes), new TextDecoder().decode(bytes), text);
      assert.equal(
        decodeUtf8(bytes, true),
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        text,
      );
    }
  });

  test("matches the platform replacement behaviour for malformed input", () => {
    for (const sample of INVALID) {
      const bytes = Uint8Array.from(sample);
      assert.equal(decodeUtf8(bytes), new TextDecoder().decode(bytes), JSON.stringify(sample));
    }
  });

  test("throws on malformed input when fatal, like the platform does", () => {
    for (const sample of INVALID) {
      const bytes = Uint8Array.from(sample);
      assert.throws(
        () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        JSON.stringify(sample),
      );
      assert.throws(() => decodeUtf8(bytes, true), JSON.stringify(sample));
    }
  });

  test("strips a leading BOM only", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xef, 0xbb, 0xbf]);
    assert.equal(decodeUtf8(bytes), new TextDecoder().decode(bytes));
    assert.equal(decodeUtf8(bytes), "a\uFEFF");
  });
});

describe("base64（btoa/atob 的替代）", () => {
  const samples = [
    new Uint8Array(0),
    new Uint8Array([0]),
    new Uint8Array([0, 255]),
    new Uint8Array([1, 2, 3]),
    new TextEncoder().encode("中文 with ascii 🌟"),
    Uint8Array.from({ length: 256 }, (_, index) => index),
  ];

  test("encodes byte for byte like the platform", () => {
    for (const bytes of samples) {
      assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
    }
  });

  test("round-trips", () => {
    for (const bytes of samples) {
      assert.deepEqual([...base64ToBytes(bytesToBase64(bytes))], [...bytes]);
    }
  });

  test("tolerates ASCII whitespace and rejects malformed input", () => {
    assert.deepEqual([...base64ToBytes("AA\nAA")], [...base64ToBytes("AAAA")]);
    for (const bad of ["A", "AAAA=", "A===", "====", "AB!D", "中文"]) {
      assert.throws(() => base64ToBytes(bad), bad);
    }
  });
});
