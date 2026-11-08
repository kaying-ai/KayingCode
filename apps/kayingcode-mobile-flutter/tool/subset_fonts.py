#!/usr/bin/env python3
"""Regenerate the bundled Sarasa subsets for Simplified + Traditional Chinese.

Usage (from apps/kayingcode-mobile-flutter):
    python3 -m venv build/font-work/venv
    build/font-work/venv/bin/pip install fonttools py7zr
    build/font-work/venv/bin/python tool/subset_fonts.py \
        --master-dir build/font-work/master

Masters (Sarasa 1.0.41, unhinted, same upstream version as the previous
subsets) can be downloaded from:
    https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.41
    SarasaUiSC-TTF-Unhinted-1.0.41.7z   -> SarasaUiSC-Regular/Bold.ttf
    SarasaTermSC-TTF-Unhinted-1.0.41.7z -> SarasaTermSC-Regular.ttf

The character set is the union of:
  * the previous subset charset (keeps punctuation/ASCII stable),
  * GB2312 (simplified Chinese),
  * Big5 + Big5-HKSCS (traditional Chinese, incl. HK/MO users),
  * every CJK character used by the three-language UI tables.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = APP_ROOT / "assets" / "fonts"
CHARSET_FILE = FONT_DIR / "subset-chars.txt"
TABLE_DIR = APP_ROOT / "lib" / "l10n" / "tables"

OUTPUTS = {
    "SarasaUiSC-Regular.ttf": "Zflow-UI-Regular.ttf",
    "SarasaUiSC-Bold.ttf": "Zflow-UI-Bold.ttf",
    "SarasaTermSC-Regular.ttf": "Zflow-Term-Regular.ttf",
}

CJK_RE = re.compile(r"[\u2e80-\u9fff\uf900-\ufaff\U00020000-\U0002ffff]")


def codec_chars(codec: str, lead: range, trail: tuple[range, ...]) -> set[str]:
    chars: set[str] = set()
    for hi in lead:
        for lo_range in trail:
            for lo in lo_range:
                try:
                    chars.add(bytes([hi, lo]).decode(codec))
                except UnicodeDecodeError:
                    continue
    return chars


def gb2312_chars() -> set[str]:
    return codec_chars("gb2312", range(0xA1, 0xF8), (range(0xA1, 0xFF),))


def big5_chars(codec: str) -> set[str]:
    return codec_chars(
        codec, range(0xA1, 0xFA), (range(0x40, 0x7F), range(0xA1, 0xFF))
    )


def table_chars() -> set[str]:
    chars: set[str] = set()
    for path in sorted(TABLE_DIR.glob("*.dart")):
        chars.update(CJK_RE.findall(path.read_text(encoding="utf-8")))
    return chars


def build_charset() -> set[str]:
    chars = set(CHARSET_FILE.read_text(encoding="utf-8"))
    chars |= gb2312_chars()
    chars |= big5_chars("big5")
    chars |= big5_chars("big5hkscs")
    chars |= table_chars()
    return {c for c in chars if c.strip() or c == " "}


def write_charset(chars: set[str]) -> None:
    ordered = "".join(sorted(chars, key=ord))
    CHARSET_FILE.write_text(ordered + "\n", encoding="utf-8")


def subset(source: Path, output: Path, charset_file: Path) -> None:
    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(source),
        f"--text-file={charset_file}",
        f"--output-file={output}",
        "--layout-features=*",
        "--layout-closure",
        "--glyph-names",
        "--symbol-cmap",
        "--legacy-cmap",
        "--notdef-glyph",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-IDs=*",
        "--name-legacy",
        "--name-languages=*",
    ]
    subprocess.run(cmd, check=True)
    size_mb = output.stat().st_size / 1e6
    print(f"[subset] {output.name}: {size_mb:.1f} MB")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--master-dir",
        type=Path,
        default=APP_ROOT / "build" / "font-work" / "master",
        help="Directory containing the upstream Sarasa 1.0.41 TTFs",
    )
    args = parser.parse_args()

    missing = [n for n in OUTPUTS if not (args.master_dir / n).is_file()]
    if missing:
        print(f"missing masters in {args.master_dir}: {missing}", file=sys.stderr)
        return 1

    chars = build_charset()
    write_charset(chars)
    print(f"[charset] {len(chars)} characters -> {CHARSET_FILE.name}")

    for master, output_name in OUTPUTS.items():
        subset(args.master_dir / master, FONT_DIR / output_name, CHARSET_FILE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
