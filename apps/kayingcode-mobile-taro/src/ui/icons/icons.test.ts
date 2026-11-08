// 图标产物一致性测试。
//
// 守住三条链路，任何一条断了都会表现为「真机豆腐块」且肉眼难查：
// 1. icon-set.json（人工清单）与 icons.ts（生成码点表）集合一致；
// 2. material-icons.css 内联的 base64 与 material-icons-subset.ttf 逐字节一致；
// 3. 子集字体的 cmap 覆盖 == 码点表（少一个字形 = 该图标渲染空白）。
//
// 测试跑在 Node（test 脚本用 tsx），可以直接读文件与解析二进制；
// 小程序运行时不加载本文件。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ICON_CODEPOINTS, ICON_NAMES, iconGlyph } from "./icons";

const here = dirname(fileURLToPath(import.meta.url));

/** 解析 TTF 的 cmap，返回（合并所有 subtable 后的）码点集合。 */
function cmapCodepoints(bytes: Uint8Array): Set<number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(
      bytes[record]!,
      bytes[record + 1]!,
      bytes[record + 2]!,
      bytes[record + 3]!,
    );
    if (tag === "cmap") {
      cmapOffset = view.getUint32(record + 8);
      break;
    }
  }
  assert.notEqual(cmapOffset, -1, "字体里没有 cmap 表");
  const subtableCount = view.getUint16(cmapOffset + 2);
  const points = new Set<number>();
  for (let i = 0; i < subtableCount; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const subtable = cmapOffset + view.getUint32(record + 4);
    const format = view.getUint16(subtable);
    if (format === 4) {
      const segmentCount = view.getUint16(subtable + 6) / 2;
      const endBase = subtable + 14;
      const startBase = endBase + segmentCount * 2 + 2;
      for (let s = 0; s < segmentCount; s += 1) {
        const end = view.getUint16(endBase + s * 2);
        const start = view.getUint16(startBase + s * 2);
        for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) points.add(cp);
      }
    } else if (format === 12) {
      const groupCount = view.getUint32(subtable + 12);
      for (let g = 0; g < groupCount; g += 1) {
        const group = subtable + 16 + g * 12;
        const start = view.getUint32(group);
        const end = view.getUint32(group + 4);
        for (let cp = start; cp <= end; cp += 1) points.add(cp);
      }
    }
  }
  return points;
}

test("icon-set.json 与 icons.ts 的图标集合一致", () => {
  const manifest = JSON.parse(readFileSync(join(here, "icon-set.json"), "utf8")) as {
    groups: Record<string, string[]>;
  };
  const listed = new Set<string>(Object.values(manifest.groups).flat());
  assert.equal(listed.size, ICON_NAMES.length, "icon-set.json 有重复条目");
  for (const name of ICON_NAMES) {
    assert.ok(listed.has(name), `icons.ts 有而 icon-set.json 没有: ${name}`);
  }
  for (const name of listed) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ICON_CODEPOINTS, name),
      `icon-set.json 有而 icons.ts 没有: ${name}`,
    );
  }
});

test("material-icons.css 内联字体与 .ttf 逐字节一致", () => {
  const css = readFileSync(join(here, "material-icons.css"), "utf8");
  const match = css.match(/base64,([A-Za-z0-9+/=]+)\)/);
  assert.ok(match, "material-icons.css 里没有 base64 字体");
  const embedded = Buffer.from(match[1]!, "base64");
  const file = readFileSync(join(here, "material-icons-subset.ttf"));
  assert.ok(embedded.equals(file), "base64 内联字体与 .ttf 文件不一致");
});

test("子集字体 cmap 覆盖与码点表双向一致", () => {
  const bytes = readFileSync(join(here, "material-icons-subset.ttf"));
  const cmap = cmapCodepoints(new Uint8Array(bytes));
  const expected = new Set(Object.values(ICON_CODEPOINTS));
  assert.equal(cmap.size, expected.size, "cmap 码点数与码点表不一致");
  for (const cp of expected) {
    assert.ok(cmap.has(cp), `码点 0x${cp.toString(16)} 不在字体 cmap 里`);
  }
});

test("iconGlyph 返回码点对应的字形（含补充平面）", () => {
  assert.equal(iconGlyph("restore").codePointAt(0), 0xe534);
  // fork_right 在补充平面（0xf050c），String.fromCodePoint 必须产出代理对。
  const fork = iconGlyph("fork_right");
  assert.equal(fork.codePointAt(0), 0xf050c);
  assert.equal(fork.length, 2);
});
