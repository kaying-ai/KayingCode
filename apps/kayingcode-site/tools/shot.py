"""Capture the KayingCode Electron window (or the full screen) into PNG files.

Usage:
    python apps/kayingcode-site/tools/shot.py windows
    python apps/kayingcode-site/tools/shot.py shot --name app-overview --match kaying --w 1280 --h 800
    python apps/kayingcode-site/tools/shot.py shot --name full.png --full
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes as wt
import sys
import time
from pathlib import Path

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, ctypes.c_long)


class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", ctypes.c_uint32), ("biWidth", ctypes.c_int32),
                ("biHeight", ctypes.c_int32), ("biPlanes", ctypes.c_uint16),
                ("biBitCount", ctypes.c_uint16), ("biCompression", ctypes.c_uint32),
                ("biSizeImage", ctypes.c_uint32), ("biXPelsPerMeter", ctypes.c_int32),
                ("biYPelsPerMeter", ctypes.c_int32), ("biClrUsed", ctypes.c_uint32),
                ("biClrImportant", ctypes.c_uint32)]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", ctypes.c_ubyte * 8)]


def enum_windows() -> list[tuple[int, str, tuple[int, int, int, int]]]:
    found: list[tuple[int, str, tuple[int, int, int, int]]] = []

    def _cb(hwnd: int, _lparam: int) -> bool:
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            title = ""
            if length:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                title = buf.value
            rect = RECT()
            if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                found.append((hwnd, title, (rect.left, rect.top, rect.right, rect.bottom)))
        return True

    user32.EnumWindows(EnumWindowsProc(_cb), 0)
    return found


def capture_region(left: int, top: int, width: int, height: int, out_path: Path) -> None:
    from PIL import Image

    hdc_screen = user32.GetDC(0)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
    bitmap = gdi32.CreateCompatibleBitmap(hdc_screen, width, height)
    gdi32.SelectObject(hdc_mem, bitmap)
    gdi32.BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, left, top, 0x00CC0020)

    bmi = BITMAPINFO()
    bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.bmiHeader.biWidth = width
    bmi.bmiHeader.biHeight = -height  # top-down DIB
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    bmi.bmiHeader.biCompression = 0

    stride = ((width * 32 + 31) // 32) * 4
    buf = ctypes.create_string_buffer(stride * height)
    gdi32.GetDIBits(hdc_mem, bitmap, 0, height, buf, ctypes.byref(bmi), 0)

    img = Image.frombuffer("RGB", (width, height), buf, "raw", "BGRX", 0, 1)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    user32.ReleaseDC(0, hdc_screen)


def find_window(match: str) -> tuple[int, str, tuple[int, int, int, int] | None]:
    for hwnd, title, rect in enum_windows():
        if match and match.lower() in title.lower():
            return hwnd, title, rect
    return 0, "", None


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("windows")
    shot = sub.add_parser("shot")
    shot.add_argument("--match", default="")
    shot.add_argument("--name", default="shot.png")
    shot.add_argument("--full", action="store_true")
    shot.add_argument("--w", type=int, default=0)
    shot.add_argument("--h", type=int, default=0)
    shot.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "assets"))
    shot.add_argument("--wait", type=float, default=3.0)
    args = parser.parse_args()

    if args.cmd == "windows":
        for hwnd, title, rect in enum_windows():
            print(f"{hwnd}\t{rect}\t{title[:80]}")
        return 0

    if args.full:
        width = user32.GetSystemMetrics(0)
        height = user32.GetSystemMetrics(1)
        capture_region(0, 0, width, height, Path(args.out) / args.name)
        print(f"full screen {width}x{height} -> {args.name}")
        return 0

    hwnd, title, rect = find_window(args.match)
    print(f"window hwnd={hwnd} title={title!r} rect={rect}")
    if not rect:
        print("no window matched")
        return 1

    user32.ShowWindow(hwnd, 3)
    user32.SetForegroundWindow(hwnd)
    time.sleep(args.wait)

    measured = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(measured))
    left, top = max(measured.left, 0), max(measured.top, 0)
    width = min(args.w or (measured.right - measured.left), measured.right - left)
    height = min(args.h or (measured.bottom - measured.top), measured.bottom - top)
    capture_region(left, top, width, height, Path(args.out) / args.name)
    print(f"shot {width}x{height} at ({left},{top}) -> {args.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
