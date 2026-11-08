#!/usr/bin/env python3
"""从 Flutter 自带的 Material Icons 生成 Taro 端的图标子集与码点表。

Taro 端要跟 Flutter 端的图标逐字形一致，唯一可靠的做法不是照着截图手绘 SVG，而是
**直接用 Flutter 自己那份字体**（`MaterialIcons-Regular.otf`），并取
`Icons.<name>` 在 `icons.dart` 里的精确码点。Material Icons 是 Apache-2.0，
完整字体 1.6 MB，而小程序主包上限 2 MB——所以必须子集化。

输入
  apps/kayingcode-mobile-taro/src/ui/icons/icon-set.json         手写的 Flutter 图标名清单
  $FLUTTER_ROOT/packages/flutter/lib/src/material/icons.dart     名字 → 码点（唯一事实来源）
  $FLUTTER_ROOT/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf

输出（生成物，勿手改）
  src/ui/icons/material-icons-subset.otf   子集字体（glyf 轮廓）
  src/ui/icons/icons.ts                    码点表 + IconName 联合类型
  src/ui/icons/material-icons.css          @font-face，字体以 base64 内联

用法
  python3 scripts/generate-mobile-taro-icons.py            # 生成
  python3 scripts/generate-mobile-taro-icons.py --check    # 只校验产物是否为当前输入的忠实结果
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/kayingcode-mobile-taro"
ICON_DIR = APP / "src/ui/icons"
ICON_SET = ICON_DIR / "icon-set.json"
OUT_FONT = ICON_DIR / "material-icons-subset.ttf"
OUT_TS = ICON_DIR / "icons.ts"
OUT_CSS = ICON_DIR / "material-icons.css"

# 字体在产物里的 family 名。刻意不叫 Flutter 的 "MaterialIcons"：同一个页面里
# 可能同时存在系统自带的同名图标字体，重名会互相顶掉。
FONT_FAMILY = "KayingCodeMaterialIcons"

# 子集化必须可复现，否则 --check 永远失败。head 表的时间戳是唯一的不确定源。
# 取 2082844800 = 1970-01-01 在 1904 纪元里的秒数：fontTools 对该字段有「小于此值
# 视作 Unix 时间戳」的兼容分支，正好用这个边界值落在「1904 纪元」的正常分支上，
# 既确定又不会在每次生成时刷一条时间戳告警。
FIXED_TIMESTAMP = 2_082_844_800

# icons.dart 里 MaterialIcons 定义的长相（部分条目跨行）：
#   static const IconData terminal = IconData(0xf0589, fontFamily: 'MaterialIcons');
ICON_DATA_PATTERN = re.compile(
    r"static\s+const\s+IconData\s+(\w+)\s*=\s*IconData\(\s*(0x[0-9a-fA-F]+)\s*,"
    r"\s*fontFamily:\s*'MaterialIcons'",
    re.S,
)

# 源码里作为字符串字面量出现的图标名，用来发现清单冗余条目。
LITERAL_PATTERN = re.compile(r"[\"']([a-z][a-z0-9_]*)[\"']")


def fail(message: str) -> NoReturn:
    print(f"错误: {message}", file=sys.stderr)
    sys.exit(1)


def find_flutter_root() -> Path:
    """定位 Flutter SDK：优先 FLUTTER_ROOT，其次 PATH 上的 flutter 软链接。"""
    candidates: list[Path] = []
    env_root = os.environ.get("FLUTTER_ROOT")
    if env_root:
        candidates.append(Path(env_root))
    flutter_bin = shutil.which("flutter")
    if flutter_bin:
        candidates.append(Path(flutter_bin).resolve().parent.parent)
    candidates.append(Path.home() / "flutter")

    for candidate in candidates:
        if (candidate / "packages/flutter/lib/src/material/icons.dart").is_file():
            return candidate
    fail(
        "找不到 Flutter SDK。请把 FLUTTER_ROOT 指向 SDK 根目录，或确保 `flutter` 在 PATH 上"
        "（本脚本需要 icons.dart 与 MaterialIcons-Regular.otf）。"
    )


def read_icon_set() -> tuple[dict[str, list[str]], list[str]]:
    """读取清单，返回（分组 → 名字列表, 去重后的有序名字列表）。"""
    if not ICON_SET.is_file():
        fail(f"缺少输入清单 {ICON_SET.relative_to(ROOT)}")
    data = json.loads(ICON_SET.read_text(encoding="utf-8"))
    groups: dict[str, list[str]] = data.get("groups") or {}
    if not groups:
        fail("icon-set.json 的 groups 为空")

    ordered: list[str] = []
    for names in groups.values():
        for name in names:
            if name not in ordered:
                ordered.append(name)
    return groups, ordered


def read_flutter_codepoints(flutter_root: Path) -> dict[str, int]:
    icons_dart = flutter_root / "packages/flutter/lib/src/material/icons.dart"
    source = icons_dart.read_text(encoding="utf-8")
    table = {m.group(1): int(m.group(2), 16) for m in ICON_DATA_PATTERN.finditer(source)}
    if not table:
        fail(f"{icons_dart} 里没解析出任何 MaterialIcons 定义，Flutter 可能改了 icons.dart 的结构")
    return table


def build_subset(font_source: Path, codepoints: list[int], destination: Path) -> None:
    """子集化并把 CFF 三次曲线转成 glyf 二次曲线。

    Material Icons 的原始字体是 CFF/OTF，而部分小程序基础库与老 WebView 对
    @font-face 里的 CFF 支持不稳，iconfont 生态也一律发 TTF——所以统一转 glyf。
    不缩放 upem：1000 与 2048 都合法，缩放反而会在「先建 glyf 再 scale」时漏掉轮廓。
    """
    from fontTools import subset
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTFont, newTable

    options = subset.Options()
    options.layout_features = []
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["GSUB", "GPOS", "GDEF"]

    font = TTFont(font_source)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)

    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(pen, max_err=1.0))
        glyf.glyphs[name] = pen.glyph()

    font["loca"] = newTable("loca")
    font["glyf"] = glyf
    maxp = font["maxp"]
    maxp.tableVersion = 0x00010000
    maxp.numGlyphs = len(glyph_order)
    for attribute in (
        "maxZones",
        "maxTwilightPoints",
        "maxStorage",
        "maxFunctionDefs",
        "maxInstructionDefs",
        "maxStackElements",
        "maxSizeOfInstructions",
        "maxComponentElements",
        "maxComponentDepth",
    ):
        setattr(maxp, attribute, 1 if attribute == "maxZones" else 0)
    if "CFF " in font:
        del font["CFF "]
    # OTF 的 sfnt 版本是 "OTTO"，glyf 轮廓必须回到标准的 0x00010000。
    font.sfntVersion = "\x00\x01\x00\x00"

    # 把 hmtx 的 lsb 对齐到轮廓 xMin。
    #
    # 源字体是 CFF：`lsb` 一律为 0，而图标美术都内缩（xMin 85–149 / 512），CFF 渲染不看
    # lsb 所以没有症状。转成 glyf 后 lsb 变成「真实」字段：浏览器 / FreeType 会按
    # (lsb − xMin) 规范化轮廓，于是整套图标被左移 4%–29%——真机上表现为「圆形发送键里的
    # 箭头偏左」（24px 里约偏 4px），40px 盒子里的其它图标也整体平移。令 lsb == xMin 后两种
    # 约定一致，美术落回设计位置（advance 不变，仍是 512，图标仍居中）。
    hmtx = font["hmtx"]
    for name in glyph_order:
        glyph = glyf.glyphs[name]
        if glyph is None or glyph.numberOfContours == 0:
            continue  # 空白字形没有可对齐的轮廓
        glyph.recalcBounds(glyf)  # 刚由 pen 造出的字形还没算边界，xMin 要先补算
        advance, _ = hmtx[name]
        hmtx[name] = (advance, glyph.xMin)

    font.recalcTimestamp = False
    font["head"].created = FIXED_TIMESTAMP
    font["head"].modified = FIXED_TIMESTAMP

    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(destination)


def render_ts(groups: dict[str, list[str]], codepoints: dict[str, int]) -> str:
    lines = [
        "// 本文件由 scripts/generate-mobile-taro-icons.py 生成，请勿手改。",
        "// 码点取自 Flutter SDK 的 material/icons.dart，与 Flutter 端的 Icons.<name> 逐字形一致。",
        "// 修改图标清单请编辑同目录的 icon-set.json，然后重跑生成脚本。",
        "",
        f"export const ICON_FONT_FAMILY = {json.dumps(FONT_FAMILY)};",
        "",
        "/** Flutter `Icons.<name>` → Unicode 码点。 */",
        "export const ICON_CODEPOINTS = {",
    ]
    emitted: set[str] = set()
    for label, names in groups.items():
        fresh = [name for name in names if name not in emitted]
        if not fresh:
            continue
        lines.append(f"  // {label}")
        for name in fresh:
            emitted.add(name)
            lines.append(f"  {json.dumps(name)}: 0x{codepoints[name]:x},")
    lines += [
        "} as const;",
        "",
        "export type IconName = keyof typeof ICON_CODEPOINTS;",
        "",
        "/** 图标名全集，供测试与兜底逻辑按集合校验。 */",
        "export const ICON_NAMES = Object.keys(ICON_CODEPOINTS) as IconName[];",
        "",
        "/** 取码点对应的字形字符串。用码点而非源码里的字面量，避免不可见字符被误编辑。 */",
        "export function iconGlyph(name: IconName): string {",
        "  return String.fromCodePoint(ICON_CODEPOINTS[name]);",
        "}",
        "",
    ]
    return "\n".join(lines)


def render_css(font_bytes: bytes) -> str:
    encoded = base64.b64encode(font_bytes).decode("ascii")
    return "\n".join(
        [
            "/* 本文件由 scripts/generate-mobile-taro-icons.py 生成，请勿手改。",
            " * 字体以 base64 内联：小程序 wxss 的 @font-face 不认包内相对路径，只接受",
            " * base64 data URI 或 https 地址；内联同时省掉一次网络请求。",
            " */",
            "@font-face {",
            f"  font-family: {json.dumps(FONT_FAMILY)};",
            "  font-style: normal;",
            "  font-weight: 400;",
            "  font-display: block;",
            f'  src: url(data:font/ttf;base64,{encoded}) format("truetype");',
            "}",
            "",
        ]
    )


def write_or_check(path: Path, content: bytes, check: bool) -> bool:
    """返回 True 表示需要写入（check 模式下即「与输入不一致」）。"""
    if check:
        if not path.is_file():
            print(f"  缺失: {path.relative_to(ROOT)}", file=sys.stderr)
            return True
        if path.read_bytes() != content:
            print(f"  与输入不一致: {path.relative_to(ROOT)}", file=sys.stderr)
            return True
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return False


def source_references() -> dict[str, int]:
    """统计每个图标名在 Taro 源码里作为字符串字面量出现的次数。

    用于发现清单里的冗余条目——清单是子集字体的唯一输入，多一个就白占体积。
    反方向（源码写了清单外的名字）由 TypeScript 的 IconName 联合类型兜住。
    """
    counts: dict[str, int] = {}
    for path in (APP / "src").rglob("*"):
        if path.suffix not in (".ts", ".tsx") or path.name.endswith(".test.ts"):
            continue
        if ICON_DIR in path.parents:
            continue
        for match in LITERAL_PATTERN.finditer(path.read_text(encoding="utf-8")):
            key = match.group(1)
            counts[key] = counts.get(key, 0) + 1
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 Taro 端的 Material Icons 子集与码点表")
    parser.add_argument("--check", action="store_true", help="只校验产物是否为当前输入的忠实结果")
    parser.add_argument(
        "--allow-unused",
        action="store_true",
        help="开发用逃生口：先加图标清单、稍后才写引用点时跳过冗余条目检查",
    )
    args = parser.parse_args()

    flutter_root = find_flutter_root()
    groups, names = read_icon_set()
    table = read_flutter_codepoints(flutter_root)

    missing = [name for name in names if name not in table]
    if missing:
        fail(
            f"icon-set.json 里 {len(missing)} 个名字在 Flutter 的 icons.dart 里不存在："
            + ", ".join(missing)
        )

    referenced = source_references()
    unused = [name for name in names if name not in referenced]
    if unused and not args.allow_unused:
        fail(
            f"icon-set.json 里 {len(unused)} 个条目在 Taro 源码里未被引用，"
            "子集字体不该包含它们（删掉它们，或先在源码里用起来）：" + ", ".join(unused)
        )

    codepoints = {name: table[name] for name in names}
    font_source = flutter_root / "bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf"
    if not font_source.is_file():
        fail(f"缺少字体 {font_source}；先运行一次 `flutter --version` 让 SDK 下载缓存")

    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / "material-icons-subset.otf"
        build_subset(font_source, sorted(set(codepoints.values())), staged)
        font_bytes = staged.read_bytes()

    ts_bytes = render_ts(groups, codepoints).encode("utf-8")
    css_bytes = render_css(font_bytes).encode("utf-8")

    if args.check:
        print(f"校验 {len(names)} 个图标的生成物（Flutter SDK: {flutter_root}）")
        stale = False
        stale |= write_or_check(OUT_FONT, font_bytes, check=True)
        stale |= write_or_check(OUT_TS, ts_bytes, check=True)
        stale |= write_or_check(OUT_CSS, css_bytes, check=True)
        if stale:
            print(
                "\n生成物与输入不一致。运行 `python3 scripts/generate-mobile-taro-icons.py` "
                "重新生成并提交。",
                file=sys.stderr,
            )
            return 1
        print("生成物与输入一致。")
        return 0

    write_or_check(OUT_FONT, font_bytes, check=False)
    write_or_check(OUT_TS, ts_bytes, check=False)
    write_or_check(OUT_CSS, css_bytes, check=False)

    print(f"Flutter SDK         {flutter_root}")
    print(f"图标数量            {len(names)}（{len(set(codepoints.values()))} 个不同码点）")
    print(f"子集字体            {len(font_bytes):,} B  sha256={hashlib.sha256(font_bytes).hexdigest()[:16]}")
    print(f"material-icons.css  {len(css_bytes):,} B（含 base64 内联字体）")
    print(f"icons.ts            {len(ts_bytes):,} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
