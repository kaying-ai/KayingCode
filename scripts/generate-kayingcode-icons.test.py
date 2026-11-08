from pathlib import Path
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DESKTOP_BUILD = ROOT / "packages/desktop/build"
UI_ASSETS = ROOT / "packages/ui/src/assets"
# 加粗断言的基线必须是未加粗的原始母版；此前用 icon.png 当基线，
# 品牌素材统一加粗后基线自身也会变粗，比值恒为 1 导致断言失真。
SOURCE_IMAGE = ROOT / "assets/brand/kayingcode.png"
BRAND_GLYPH_WEIGHT_SCALE = 1.5


def first_white_run_width(image: Image.Image, y_ratio: float = 100 / 256) -> int:
    rgba = image.convert("RGBA")
    y = round(rgba.height * y_ratio)
    white_x = [
        x
        for x in range(rgba.width)
        if rgba.getpixel((x, y))[0] >= 200 and rgba.getpixel((x, y))[3] >= 200
    ]
    if not white_x:
        return 0
    start = previous = white_x[0]
    for x in white_x[1:]:
        if x > previous + 1:
            return previous - start + 1
        previous = x
    return previous - start + 1


def assert_transparent_rounded_corners(
    testcase: unittest.TestCase, image: Image.Image, label: str
) -> None:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    for point in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        testcase.assertEqual(rgba.getpixel(point)[3], 0, f"{label} corner {point}")
    testcase.assertEqual(
        rgba.getpixel((width // 2, height // 2))[3], 255, f"{label} center"
    )


class DesktopIconAssetsTest(unittest.TestCase):
    def setUp(self) -> None:
        with Image.open(SOURCE_IMAGE) as source:
            self.baseline_width_ratio = first_white_run_width(source) / source.width

    def assert_glyph_weight_matches_brand_scale(self, image: Image.Image, label: str) -> None:
        width_ratio = first_white_run_width(image) / image.width
        self.assertAlmostEqual(
            width_ratio / self.baseline_width_ratio,
            BRAND_GLYPH_WEIGHT_SCALE,
            delta=0.08,
            msg=label,
        )

    def test_brand_glyph_is_fifty_percent_bolder_across_platforms(self) -> None:
        png_targets = [
            DESKTOP_BUILD / "icon_windows.png",
            DESKTOP_BUILD / "icon.png",
            DESKTOP_BUILD / "icon_installer.png",
            DESKTOP_BUILD / "icons" / "512x512.png",
        ]
        for path in png_targets:
            with Image.open(path) as image:
                self.assert_glyph_weight_matches_brand_scale(image, str(path))

        for name in ("icon.ico", "icon_installer.ico"):
            with Image.open(DESKTOP_BUILD / name) as icon:
                frame = icon.ico.getimage((256, 256))
                self.assert_glyph_weight_matches_brand_scale(frame, f"{name} 256")

        for name in ("icon.icns", "icon_installer.icns"):
            with Image.open(DESKTOP_BUILD / name) as image:
                self.assert_glyph_weight_matches_brand_scale(image, name)

    def test_window_png_uses_transparent_rounded_corners(self) -> None:
        with Image.open(DESKTOP_BUILD / "icon_windows.png") as image:
            assert_transparent_rounded_corners(self, image, "icon_windows.png")

    def test_ui_titlebar_badge_uses_transparent_rounded_corners(self) -> None:
        with Image.open(UI_ASSETS / "KayingCode-app-badge.png") as image:
            assert_transparent_rounded_corners(self, image, "KayingCode-app-badge.png")

    def test_every_taskbar_ico_size_uses_transparent_rounded_corners(self) -> None:
        with Image.open(DESKTOP_BUILD / "icon.ico") as image:
            for size in image.ico.sizes():
                assert_transparent_rounded_corners(
                    self, image.ico.getimage(size), f"icon.ico {size[0]}x{size[1]}"
                )

    def test_every_installer_ico_size_uses_transparent_rounded_corners(self) -> None:
        with Image.open(DESKTOP_BUILD / "icon_installer.ico") as image:
            for size in image.ico.sizes():
                assert_transparent_rounded_corners(
                    self,
                    image.ico.getimage(size),
                    f"icon_installer.ico {size[0]}x{size[1]}",
                )

    def test_mac_icns_uses_transparent_rounded_corners(self) -> None:
        for name in ("icon.icns", "icon_installer.icns"):
            with Image.open(DESKTOP_BUILD / name) as image:
                assert_transparent_rounded_corners(self, image, name)


if __name__ == "__main__":
    unittest.main()
