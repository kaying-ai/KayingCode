// 纯 TS base64：RFC 4648 标准向量 + 与 Node Buffer 对拍。
import assert from "node:assert/strict";
import { test } from "vitest";
import { base64Decode, base64Encode } from "./wireBase64.js";

const encoder = new TextEncoder();

test("base64Encode 命中 RFC 4648 §10 官方向量", () => {
  const vectors: Array<[string, string]> = [
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg=="],
    ["fooba", "Zm9vYmE="],
    ["foobar", "Zm9vYmFy"],
  ];
  for (const [text, expected] of vectors) {
    assert.equal(base64Encode(encoder.encode(text)), expected, `encode ${text}`);
  }
});

test("base64Decode 命中 RFC 4648 §10 官方向量", () => {
  const vectors: Array<[string, string]> = [
    ["", ""],
    ["Zg==", "f"],
    ["Zm8=", "fo"],
    ["Zm9v", "foo"],
    ["Zm9vYg==", "foob"],
    ["Zm9vYmE=", "fooba"],
    ["Zm9vYmFy", "foobar"],
  ];
  for (const [encoded, expected] of vectors) {
    assert.equal(new TextDecoder().decode(base64Decode(encoded)), expected, `decode ${encoded}`);
  }
});

test("base64 往返：任意字节（含小数点表值 62/63）无损", () => {
  // 0xfb/0xff/0xfe 等让 sextet 命中 '+' 与 '/'。
  const bytes = new Uint8Array([0x00, 0x10, 0x83, 0xfb, 0xef, 0xbe, 0xff, 0xfe, 0x3e, 0x3f]);
  const encoded = base64Encode(bytes);
  assert.ok(
    encoded.includes("+") || encoded.includes("/"),
    `expected padding-table chars in ${encoded}`,
  );
  const decoded = base64Decode(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(bytes));
});

test("base64 与 Node Buffer 对拍（随机长度 0..64）", () => {
  for (let length = 0; length <= 64; length += 1) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = (i * 37 + length) & 0xff;
    const buffer = Buffer.from(bytes);
    assert.equal(base64Encode(bytes), buffer.toString("base64"), `encode len=${length}`);
    assert.deepEqual(
      Array.from(base64Decode(buffer.toString("base64"))),
      Array.from(bytes),
      `decode len=${length}`,
    );
  }
});

test("base64Decode 拒绝非法字符与非法长度", () => {
  assert.throws(() => base64Decode("Zm9v!"), /invalid base64/);
  assert.throws(() => base64Decode("Zg="), /invalid base64 length/);
  assert.throws(() => base64Decode("Zg==="), /invalid base64 length/);
  assert.throws(() => base64Decode("Zg==="), /invalid base64 length/);
  // 非 ASCII 字符走 charCode >= 128 分支，同样必须拒绝。
  assert.throws(() => base64Decode("Zm9v中"), /invalid base64/);
});

// ── 与 Dart `base64.decode` 的严格对齐 ────────────────────────────────────
// Flutter rpc_transport.dart 用 `base64.decode`，Dart 的实现比 RFC 4648 严格：
// 长度必须是 4 的倍数、padding 必填且只能出现在末尾、尾部残留位必须为 0。
// 初版移植只查了 "长度非 4 倍数" 与 ">2 个 padding"，会放过 "Zg="、"Zg"、
// "Zm9vYmE" 并给 "Zm9v!" 报出长度错（而非字符错）——已按 Dart 语义收紧。

test("base64Decode 必填 padding（Dart 拒绝无 padding 的残缺组）", () => {
  // "Zm9vYmE" 在 RFC 4648 下合法（等价 "Zm9vYmE="），Dart 拒绝。
  assert.throws(() => base64Decode("Zm9vYmE"), /invalid base64/);
  assert.throws(() => base64Decode("Zg"), /invalid base64 length/);
  assert.throws(() => base64Decode("Zm8"), /invalid base64 length/);
  assert.throws(() => base64Decode("="), /invalid base64/);
  assert.throws(() => base64Decode("=="), /invalid base64/);
});

test("base64Decode 拒绝错误的 padding 个数", () => {
  // 1 组：chars%4===2 必带 2 个 padding；chars%4===3 必带 1 个。
  assert.equal(new TextDecoder().decode(base64Decode("Zg==")), "f");
  assert.equal(new TextDecoder().decode(base64Decode("Zm8=")), "fo");
  // "Zg=" / "Zm8" 这种长度即不是 4 的倍数，先被长度检查拦下。
  assert.throws(() => base64Decode("Zg="), /invalid base64 length/);
  assert.throws(() => base64Decode("Zm8"), /invalid base64 length/);
  assert.throws(() => base64Decode("Zm9v="), /invalid base64 length/);
  assert.throws(() => base64Decode("Zm9v=="), /invalid base64 length/);
});

test("base64Decode 拒绝非零尾部位（Dart 的残留位校验）", () => {
  // chars%4===2：第二字符的低 4 位必须是 0。"Zg==" 的 'g'=32 → 低 4 位 0，合法；
  // "Zh==" 的 'h'=33 → 低 4 位 1，Dart 拒绝。
  assert.equal(new TextDecoder().decode(base64Decode("Zg==")), "f");
  assert.throws(() => base64Decode("Zh=="), /invalid base64 trailing bits/);
  assert.throws(() => base64Decode("Zm9vYh=="), /invalid base64 trailing bits/);
  assert.throws(() => base64Decode("AAB="), /invalid base64 trailing bits/);
  // chars%4===3：第三字符的低 2 位必须是 0。"Zm9=" 的 '9'=61 → 低 2 位 1，Dart 拒绝。
  assert.equal(new TextDecoder().decode(base64Decode("Zm8=")), "fo");
  assert.throws(() => base64Decode("Zm9="), /invalid base64 trailing bits/);
  assert.throws(() => base64Decode("Zm9vYmF="), /invalid base64 trailing bits/);
});

test("base64Decode padding 只能出现在整串末尾（多组场景）", () => {
  assert.equal(new TextDecoder().decode(base64Decode("Zm9vZg==")), "foof");
  assert.deepEqual(Array.from(base64Decode("AAAAZg==")), [0, 0, 0, 102]);
  // padding 出现在中间组：Dart 拒绝（"Zg==Zg=="、"Zg==AAAA" 都 THROW）。
  assert.throws(() => base64Decode("Zg==Zg=="), /invalid base64/);
  assert.throws(() => base64Decode("Zg==AAAA"), /invalid base64/);
  assert.throws(() => base64Decode("A==="), /invalid base64 padding/);
  assert.throws(() => base64Decode("===="), /invalid base64 padding/);
});

test("base64Decode 拒绝空白与换行（Dart 不做宽松过滤）", () => {
  assert.throws(() => base64Decode("Zm9v\r\nYmFy"), /invalid base64/);
  assert.throws(() => base64Decode("Zm9 v"), /invalid base64/);
});
