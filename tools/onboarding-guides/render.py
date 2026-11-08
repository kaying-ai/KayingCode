"""Render deterministic, non-scannable onboarding diagrams for both mobile apps.

The screen furniture follows the current desktop and mobile entry points. The
diagrams deliberately avoid real connection data and are labelled as examples.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [
    ROOT / "apps/kayingcode-mobile-taro/src/assets/onboarding",
    ROOT / "apps/kayingcode-mobile-flutter/assets/images/onboarding",
]

W, H = 1200, 680
BG = "#10151d"
PANEL = "#1b232d"
PANEL_2 = "#242d38"
STROKE = "#46515f"
TEXT = "#edf2f8"
MUTED = "#aab6c6"
BLUE = "#5a8dff"
BLUE_SOFT = "#243d75"
AMBER = "#ffbd67"

FONT_ROOT = ROOT / "apps/kayingcode-mobile-flutter/assets/fonts"
REG = FONT_ROOT / "Zflow-UI-Regular.ttf"
BOLD = FONT_ROOT / "Zflow-UI-Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD if bold else REG, size)


def rect(draw: ImageDraw.ImageDraw, box, fill=PANEL, outline=STROKE, radius=18, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def txt(draw: ImageDraw.ImageDraw, xy, value, size=30, color=TEXT, bold=False):
    draw.text(xy, value, font=font(size, bold), fill=color)


def marker(draw: ImageDraw.ImageDraw, box, number, label, label_xy=None):
    draw.rounded_rectangle(box, radius=18, outline=AMBER, width=7)
    x, y = box[0], box[1]
    draw.ellipse((x - 22, y - 22, x + 43, y + 43), fill=AMBER)
    txt(draw, (x - 5, y - 16), str(number), 31, BG, True)
    if label_xy:
        lx, ly = label_xy
        text_box = draw.textbbox((0, 0), label, font=font(34, True))
        tw = text_box[2] - text_box[0]
        rect(draw, (lx, ly, lx + tw + 42, ly + 60), "#332b24", AMBER, 14, 2)
        txt(draw, (lx + 21, ly + 8), label, 34, AMBER, True)


def base(kicker: str):
    image = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(image)
    txt(d, (42, 22), kicker, 29, MUTED, True)
    txt(d, (1002, 24), "界面示意", 25, MUTED)
    return image, d


def desktop(d, x=42, y=76, w=1116, h=548, brand="KayingCode"):
    rect(d, (x, y, x + w, y + h), PANEL, STROKE, 22, 3)
    d.rounded_rectangle((x, y, x + w, y + 62), radius=22, fill=PANEL_2)
    d.rectangle((x, y + 38, x + w, y + 62), fill=PANEL_2)
    for i, color in enumerate(("#e27477", "#dcb56e", "#74b99a")):
        d.ellipse((x + 22 + i * 27, y + 23, x + 36 + i * 27, y + 37), fill=color)
    txt(d, (x + 144, y + 12), brand, 30, TEXT, True)
    d.line((x + 256, y + 62, x + 256, y + h), fill=STROKE, width=2)
    return x, y, w, h


def phone(d, x, y, w, h, title):
    rect(d, (x, y, x + w, y + h), "#090d12", "#718091", 46, 4)
    rect(d, (x + 12, y + 14, x + w - 12, y + h - 12), BG, BG, 34, 1)
    d.rounded_rectangle((x + w // 2 - 40, y + 17, x + w // 2 + 40, y + 29), radius=8, fill="#05080c")
    txt(d, (x + 35, y + 48), title, 27, TEXT, True)
    d.line((x + 20, y + 99, x + w - 20, y + 99), fill=STROKE, width=2)


def qr_placeholder(d, box):
    x1, y1, x2, y2 = box
    rect(d, box, "#e7edf4", "#e7edf4", 12, 1)
    # Intentional visual placeholder: no finder patterns or encoded modules.
    for row in range(5):
        for col in range(5):
            if (row + col) % 3 != 1:
                px, py = x1 + 28 + col * 28, y1 + 28 + row * 28
                d.rounded_rectangle((px, py, px + 14, py + 14), radius=3, fill="#7c8ca0")
    d.line((x1 + 18, y2 - 28, x2 - 18, y1 + 28), fill="#e25f68", width=10)
    d.rounded_rectangle((x1 + 20, y2 - 48, x2 - 20, y2 - 12), radius=8, fill="#e7edf4")
    txt(d, (x1 + 40, y2 - 48), "不可扫码", 23, "#394659", True)


def phone_icon(d, x, y):
    d.rounded_rectangle((x, y, x + 31, y + 39), radius=7, outline=TEXT, width=4)
    d.line((x + 11, y + 31, x + 20, y + 31), fill=TEXT, width=3)


def ready():
    image, d = base("01  先打开电脑工作区")
    desktop(d, 42, 76, 732, 548)
    txt(d, (76, 166), "工作区", 26, MUTED)
    rect(d, (70, 222, 268, 282), BLUE_SOFT, BLUE, 13, 2)
    txt(d, (100, 231), "workspace", 29, TEXT, True)
    txt(d, (325, 154), "已有工作区和会话", 38, TEXT, True)
    for i, title in enumerate(("最近会话", "项目文件", "运行任务")):
        rect(d, (323, 231 + i * 89, 711, 293 + i * 89), PANEL_2, STROKE, 12, 1)
        txt(d, (350, 243 + i * 89), title, 27, MUTED)
    marker(d, (61, 211, 278, 293), 1, "先选本地工作区", (313, 485))
    phone(d, 818, 87, 335, 523, "会话")
    rect(d, (850, 233, 1120, 300), PANEL_2, STROKE, 14, 2)
    txt(d, (878, 247), "workspace", 29, TEXT, True)
    txt(d, (861, 345), "桌面会话在此显示", 23, MUTED)
    return image


def kayingcode():
    image, d = base("02  KayingCode 桌面端")
    desktop(d)
    txt(d, (75, 160), "工作区", 26, MUTED)
    rect(d, (73, 223, 264, 282), PANEL_2, STROKE, 12, 1)
    txt(d, (96, 234), "workspace", 27, TEXT)
    d.line((66, 541, 278, 541), fill=STROKE, width=2)
    rect(d, (80, 554, 154, 607), BLUE_SOFT, BLUE, 12, 2)
    phone_icon(d, 101, 560)
    marker(d, (68, 545, 169, 613), 1, "左下角：连接手机", (214, 547))
    rect(d, (500, 151, 1079, 555), "#202936", "#697686", 22, 3)
    txt(d, (542, 172), "移动端远程控制", 35, TEXT, True)
    txt(d, (542, 229), "已连接  ·  当前工作区", 27, MUTED)
    qr_placeholder(d, (559, 285, 753, 487))
    marker(d, (543, 273, 770, 505), 2, "扫码或复制连接信息", (795, 388))
    return image


def zcode():
    image, d = base("03  ZCode 桌面端")
    desktop(d, brand="ZCode")
    txt(d, (75, 155), "文件", 25, MUTED)
    for i, label in enumerate(("workspace", "src", "README.md")):
        txt(d, (86 + i * 12, 222 + i * 68), label, 24, MUTED)
    d.line((66, 541, 278, 541), fill=STROKE, width=2)
    rect(d, (80, 553, 154, 605), BLUE_SOFT, BLUE, 12, 2)
    phone_icon(d, 101, 559)
    marker(d, (68, 544, 169, 612), 1, "左下角：手机图标", (219, 547))
    rect(d, (510, 149, 1083, 552), "#202936", "#697686", 22, 3)
    txt(d, (545, 171), "移动端远程控制", 35, TEXT, True)
    qr_placeholder(d, (559, 272, 753, 474))
    rect(d, (784, 284, 1041, 337), PANEL_2, STROKE, 10, 1)
    txt(d, (797, 291), "连接地址", 25, MUTED)
    marker(d, (543, 260, 770, 492), 2, "扫码或复制完整地址", (792, 393))
    return image


def add_bot():
    image, d = base("04  手机端添加 Bot")
    phone(d, 94, 82, 428, 548, "Bot")
    txt(d, (129, 196), "连接你的桌面端", 32, TEXT, True)
    rect(d, (125, 260, 491, 344), PANEL_2, STROKE, 16, 2)
    txt(d, (152, 276), "连接 KayingCode", 31, TEXT, True)
    rect(d, (125, 363, 491, 447), PANEL_2, STROKE, 16, 2)
    txt(d, (152, 379), "连接 ZCode", 31, TEXT, True)
    marker(d, (110, 245, 505, 460), 1, "选择对应桌面端", (136, 512))
    phone(d, 679, 82, 428, 548, "添加设备")
    rect(d, (712, 241, 1074, 335), PANEL_2, STROKE, 16, 2)
    txt(d, (746, 256), "扫码添加", 32, TEXT, True)
    rect(d, (712, 359, 1074, 453), PANEL_2, STROKE, 16, 2)
    txt(d, (746, 374), "粘贴链接添加", 32, TEXT, True)
    marker(d, (697, 226, 1090, 469), 2, "扫码或粘贴", (766, 512))
    return image


def sessions():
    image, d = base("05  进入工作区与会话")
    phone(d, 94, 82, 428, 548, "会话")
    txt(d, (128, 183), "选择工作区", 31, TEXT, True)
    rect(d, (125, 265, 491, 366), PANEL_2, STROKE, 17, 2)
    txt(d, (152, 287), "workspace", 33, TEXT, True)
    marker(d, (111, 249, 506, 381), 1, "点击工作区", (165, 508))
    phone(d, 679, 82, 428, 548, "workspace")
    txt(d, (713, 190), "最近会话", 31, TEXT, True)
    rect(d, (713, 264, 1072, 343), PANEL_2, STROKE, 15, 2)
    txt(d, (741, 279), "继续之前的对话", 28, TEXT)
    rect(d, (987, 169, 1070, 236), BLUE_SOFT, BLUE, 14, 2)
    txt(d, (1012, 170), "+", 45, TEXT, True)
    marker(d, (975, 156, 1082, 248), 2, "新建会话", (789, 493))
    return image


IMAGES = {
    "01-desktop-ready.png": ready,
    "02-kayingcode-pair.png": kayingcode,
    "03-zcode-pair.png": zcode,
    "04-mobile-add.png": add_bot,
    "05-mobile-session.png": sessions,
}

for destination in TARGETS:
    destination.mkdir(parents=True, exist_ok=True)
    for filename, draw_image in IMAGES.items():
        draw_image().save(destination / filename, optimize=True)
        print(destination / filename)
