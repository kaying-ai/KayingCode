from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import base64
from functools import lru_cache
from io import BytesIO
import struct

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets/brand/kayingcode.png"

# 桌面品牌图标统一自带圆角透明四角，避免 macOS Dock、Windows
# 任务栏与原生窗口标题栏显示成直角黑色方块。角半径取连续圆角近似值
# 22.37%（1024 画布约 229px），PNG / ICO / ICNS 共用同一个轮廓所有者。
ICON_CORNER_RADIUS_RATIO = 0.2237

# 小尺寸图层会把原始 KY 笔画压细：Windows 任务栏/安装器深色底、macOS Dock 与
# DMG 背景、Linux 桌面目录和 Web favicon 是同一观感问题。以 256px 输出中 K 左侧
# 主干约 18px 为基准，把全部品牌素材的字形统一加粗到 1.5 倍，避免同一 logo 在
# 不同平台出现"运行态粗、安装器/Dock 细"的混用。扩张在高分辨率母版完成，
# 再降采样到各 ICO/PNG/ICNS 尺寸，避免小尺寸逐级描边造成锯齿。
BRAND_GLYPH_WEIGHT_SCALE = 1.5
GLYPH_REFERENCE_STROKE_RATIO = 18 / 256

PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

PUBLIC_SOURCE = ROOT / "public/logo/source"
PUBLIC_ICONS = ROOT / "public/logo/icons"
DESKTOP_BUILD = ROOT / "packages/desktop/build"
DESKTOP_ICONS = DESKTOP_BUILD / "icons"
UI_ASSETS = ROOT / "packages/ui/src/assets"
WEB_PUBLIC = ROOT / "packages/web/public"

for d in (PUBLIC_SOURCE, PUBLIC_ICONS, DESKTOP_ICONS, UI_ASSETS, WEB_PUBLIC):
    d.mkdir(parents=True, exist_ok=True)


def atomic_write_bytes(path: Path, data: bytes) -> None:
    """Write generated assets without truncating a file currently displayed by Windows Shell."""
    temporary_path = path.with_name(f".{path.name}.tmp")
    try:
        temporary_path.write_bytes(data)
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def save_image(image: Image.Image, path: Path, image_format: str) -> None:
    buffer = BytesIO()
    image.save(buffer, format=image_format)
    atomic_write_bytes(path, buffer.getvalue())


def rounded_icon_mask(size: int) -> Image.Image:
    """高倍超采样圆角遮罩，供各桌面平台保持同一透明轮廓。"""
    scale = 4
    side = size * scale
    radius = max(1, int(side * ICON_CORNER_RADIUS_RATIO))
    mask = Image.new("L", (side, side), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, side - 1, side - 1), radius=radius, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def expand_glyph_weight(image: Image.Image, scale: float) -> Image.Image:
    """Expand the white-on-black KY glyph without moving or scaling the mark."""
    if scale <= 1:
        return image

    reference_stroke = min(image.size) * GLYPH_REFERENCE_STROKE_RATIO
    expansion_radius = max(1, round(reference_stroke * (scale - 1) / 2))
    weighted_rgb = image.convert("RGB").filter(
        ImageFilter.MaxFilter(expansion_radius * 2 + 1)
    )
    weighted = weighted_rgb.convert("RGBA")
    weighted.putalpha(image.getchannel("A"))
    return weighted


@lru_cache(maxsize=2)
def load_weighted_master(glyph_weight: float) -> Image.Image:
    """Cache the expensive high-resolution weight expansion for all output sizes."""
    img = Image.open(SRC).convert("RGBA")
    return expand_glyph_weight(img, glyph_weight)


def load_rgba(
    size: int, *, rounded: bool = True, glyph_weight: float = BRAND_GLYPH_WEIGHT_SCALE
) -> Image.Image:
    # 修复依据：ICO 会依次生成 7 个尺寸；若每层都在 1254px 母版上执行一次 45px MaxFilter，
    # 单次图标生成会耗时数分钟。字重母版是不可变派生，缓存后各尺寸只负责降采样。
    img = load_weighted_master(glyph_weight).resize(
        (size, size), Image.Resampling.LANCZOS
    )
    if rounded:
        img.putalpha(rounded_icon_mask(size))
    return img


def write_ico(
    path: Path,
    sizes: list[int],
    *,
    rounded: bool = False,
    glyph_weight: float = BRAND_GLYPH_WEIGHT_SCALE,
) -> None:
    if not rounded:
        # 非 Windows 桌面消费端保留原有 Pillow 编码，避免仅因容器写法
        # 变化就改写 Web / 公共资产；本次行为边界只在 Windows Desktop。
        buffer = BytesIO()
        load_rgba(max(sizes), rounded=False, glyph_weight=glyph_weight).save(
            buffer, format="ICO", sizes=[(size, size) for size in sizes]
        )
        atomic_write_bytes(path, buffer.getvalue())
        return

    # 修复依据：Windows Shell 不会自动为传统 ICO 裁圆角，必须在每个尺寸的
    # alpha 通道中预留透明四角，否则任务栏会显示直角黑色方块。
    # 不让 Pillow 从最大图层二次缩放：Lanczos 会在 24px 等尺寸的最外角点
    # 混入少量不透明像素。逐尺寸生成 PNG 并直接嵌入 ICO，保留精确 alpha。
    frames = []
    for size in sizes:
        buffer = BytesIO()
        frame = load_rgba(size, rounded=rounded, glyph_weight=glyph_weight)
        if rounded:
            # Lanczos 会在某些 ICO 小尺寸的最外角点产生 1~3 的 alpha 振铃；
            # Shell 仍可能把它当成实色边缘。只清空四个角点，不改变其余抗锯齿过渡。
            for point in ((0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)):
                red, green, blue, _alpha = frame.getpixel(point)
                frame.putpixel(point, (red, green, blue, 0))
        frame.save(buffer, format="PNG")
        frames.append((size, buffer.getvalue()))

    offset = 6 + 16 * len(frames)
    entries = []
    payloads = []
    for size, data in frames:
        encoded_size = 0 if size == 256 else size
        entries.append(
            struct.pack(
                "<BBBBHHII",
                encoded_size,
                encoded_size,
                0,
                0,
                1,
                32,
                len(data),
                offset,
            )
        )
        payloads.append(data)
        offset += len(data)

    ico_data = (
        struct.pack("<HHH", 0, 1, len(frames)) + b"".join(entries) + b"".join(payloads)
    )
    # Windows Shell 可能仍持有已展示 ICO 的读取句柄，原地 truncate 会报
    # EINVAL。先写同目录临时文件再原子替换，既避免半成品也允许热更新资源。
    atomic_write_bytes(path, ico_data)


def write_icns(path: Path) -> None:
    """Minimal ICNS with PNG entries (modern macOS)."""
    # type -> (size, scale)
    entries = {
        b"ic07": (128, 1),
        b"ic08": (256, 1),
        b"ic09": (512, 1),
        b"ic10": (1024, 1),
        b"ic11": (32, 2),   # 16@2x
        b"ic12": (64, 2),   # 32@2x
        b"ic13": (128, 2),  # 64@2x? actually 256@2x=512 — use pixel size directly
        b"ic14": (256, 2),  # 512@2x=1024 — use pixel size directly
        b"ic04": (16, 1),
        b"ic05": (32, 1),
        b"icp4": (16, 1),
        b"icp5": (32, 1),
        b"icp6": (64, 1),
    }
    # Prefer explicit pixel sizes matching Apple types
    pixel_map = {
        b"ic04": 16,
        b"ic05": 32,
        b"icp6": 64,
        b"ic07": 128,
        b"ic08": 256,
        b"ic09": 512,
        b"ic10": 1024,
        b"ic11": 32,
        b"ic12": 64,
        b"ic13": 128,
        b"ic14": 256,
    }
    chunks = []
    for typ, px in pixel_map.items():
        img = load_rgba(px, rounded=True)
        buf = BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        chunks.append((typ, data))
    body = b"".join(typ + struct.pack(">I", 8 + len(data)) + data for typ, data in chunks)
    atomic_write_bytes(path, b"icns" + struct.pack(">I", 8 + len(body)) + body)


def save_png_sizes(dest_dir: Path, *, rounded: bool = True) -> dict[int, Image.Image]:
    out = {}
    for s in PNG_SIZES:
        img = load_rgba(s, rounded=rounded)
        save_image(img, dest_dir / f"{s}x{s}.png", "PNG")
        out[s] = img
    return out


print("source size:", Image.open(SRC).size)
print("generate master + public icons...")
img1024 = load_rgba(1024)
save_image(img1024, PUBLIC_SOURCE / "kayingcode-1024.png", "PNG")
save_png_sizes(PUBLIC_ICONS)
write_ico(PUBLIC_ICONS / "icon.ico", [16, 24, 32, 48, 64, 128, 256])
write_icns(PUBLIC_ICONS / "icon.icns")

print("generate desktop build icons...")
save_png_sizes(DESKTOP_ICONS)
write_ico(
    DESKTOP_BUILD / "icon.ico",
    [16, 24, 32, 48, 64, 128, 256],
    rounded=True,
)
write_ico(DESKTOP_BUILD / "icon_installer.ico", [16, 32, 48, 64, 128, 256], rounded=True)
write_icns(DESKTOP_BUILD / "icon.icns")
write_icns(DESKTOP_BUILD / "icon_installer.icns")
save_image(load_rgba(512, rounded=True), DESKTOP_BUILD / "icon.png", "PNG")
save_image(
    load_rgba(256, rounded=True),
    DESKTOP_BUILD / "icon_windows.png",
    "PNG",
)
save_image(load_rgba(512, rounded=True), DESKTOP_BUILD / "icon_installer.png", "PNG")
# Windows 自绘顶栏与原生窗口共用品牌轮廓，防止 UI 副本停留在旧直角资产。
save_image(
    load_rgba(256, rounded=True),
    UI_ASSETS / "KayingCode-app-badge.png",
    "PNG",
)

print("generate dmag backgrounds...")
# dark neutral canvas with centered brand mark
for w, h, name in ((640, 400, "dmg_background.png"), (1280, 800, "dmg_background@2x.png")):
    bg = Image.new("RGBA", (w, h), (18, 18, 20, 255))
    mark = load_rgba(int(h * 0.22), rounded=True)
    bg.alpha_composite(mark, ((w - mark.width) // 2, int(h * 0.28)))
    save_image(bg.convert("RGB"), DESKTOP_BUILD / name, "PNG")

print("generate web favicon...")
write_ico(WEB_PUBLIC / "favicon.ico", [16, 32, 48])
fav = load_rgba(32, rounded=True)
buf = BytesIO()
fav.save(buf, format="PNG")
b64 = base64.b64encode(buf.getvalue()).decode("ascii")
print("FAVICON_B64_LEN", len(b64))
atomic_write_bytes(Path(__file__).parent / "favicon32.b64.txt", b64.encode("utf-8"))
print("done")
