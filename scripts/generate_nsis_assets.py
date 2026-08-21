"""生成 Annie 护眼绿主题的高质量 BMP 侧边栏与头部海报。"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def create_sidebar_bmp(out_path: Path):
    # NSIS Modern UI 标准 Sidebar 尺寸：164 x 314
    width, height = 164, 314
    img = Image.new("RGB", (width, height), color="#142820")
    draw = ImageDraw.Draw(img)

    # 1. 绘制深邃护眼绿暗光渐变
    for y in range(height):
        ratio = y / height
        r = int(18 + ratio * 6)
        g = int(38 + ratio * 15)
        b = int(28 + ratio * 10)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # 2. 顶部微光发光圆弧
    draw.ellipse([(-40, -40), (width + 40, 90)], fill="#1e3f32", outline="#52b788", width=1)

    # 3. 尝试加载系统字体
    font_bold = None
    font_normal = None
    font_sm = None
    font_paths = [
        "C:/Windows/Fonts/msyhbd.ttc",  # 微软雅黑粗体
        "C:/Windows/Fonts/simhei.ttf",   # 黑体
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for fp in font_paths:
        if Path(fp).exists():
            try:
                font_bold = ImageFont.truetype(fp, 15)
                font_normal = ImageFont.truetype(fp, 11)
                font_sm = ImageFont.truetype(fp, 9)
                break
            except Exception:
                pass

    if not font_bold:
        font_bold = font_normal = font_sm = ImageFont.load_default()

    # 4. 绘制 ES 方形圆角 Logo (护眼绿背景)
    logo_size = 36
    logo_x = (width - logo_size) // 2
    logo_y = 20
    draw.rounded_rectangle(
        [(logo_x, logo_y), (logo_x + logo_size, logo_y + logo_size)],
        radius=8,
        fill="#1e3f32",
        outline="#52b788",
        width=2,
    )
    draw.text((logo_x + 8, logo_y + 9), "ES", fill="#ffffff", font=font_bold)

    # 5. 产品主标题
    draw.text((width // 2, 70), "Annie", fill="#ffffff", font=font_bold, anchor="mm")
    draw.text((width // 2, 88), "信贷助手 · 案件决策大脑", fill="#a7d7c5", font=font_sm, anchor="mm")

    # 分割线
    draw.line([(20, 104), (width - 20, 104)], fill="#2d6a4f", width=1)

    # 6. 核心亮点特性清单
    features = [
        ("•", "一句话智能建档"),
        ("•", "资产与负债全景"),
        ("•", "贷款能力计算器"),
        ("•", "银行标准材料清单"),
        ("•", "档案与知识中心"),
        ("•", "100% 纯本地隐私"),
    ]

    start_y = 120
    for i, (bullet, text) in enumerate(features):
        y = start_y + i * 24
        # 微卡片背景
        draw.rounded_rectangle(
            [(12, y - 2), (width - 12, y + 17)],
            radius=4,
            fill="#1e382d",
            outline="#2d6a4f",
            width=1,
        )
        draw.text((20, y + 1), bullet, fill="#52b788", font=font_bold)
        draw.text((32, y + 2), text, fill="#e8f5e9", font=font_normal)

    # 7. 底部版本号与安全锁标识
    draw.line([(20, 275), (width - 20, 275)], fill="#2d6a4f", width=1)
    draw.text((width // 2, 288), "v2.2.0 · 纯本地运行", fill="#81c784", font=font_sm, anchor="mm")
    draw.text((width // 2, 300), "EverStones Intelligence", fill="#66bb6a", font=font_sm, anchor="mm")

    # 保存为标准 24-bit Windows BMP
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="BMP")
    print(f"Generated sidebar: {out_path} ({width}x{height})")


def create_header_bmp(out_path: Path):
    # NSIS Modern UI Header 尺寸：150 x 57
    width, height = 150, 57
    img = Image.new("RGB", (width, height), color="#142820")
    draw = ImageDraw.Draw(img)

    for x in range(width):
        ratio = x / width
        r = int(18 + ratio * 8)
        g = int(38 + ratio * 20)
        b = int(28 + ratio * 12)
        draw.line([(x, 0), (x, height)], fill=(r, g, b))

    # 右侧 ES Logo
    font_bold = ImageFont.load_default()
    for fp in ["C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/simhei.ttf"]:
        if Path(fp).exists():
            try:
                font_bold = ImageFont.truetype(fp, 13)
                break
            except Exception:
                pass

    logo_size = 32
    lx = width - logo_size - 14
    ly = (height - logo_size) // 2
    draw.rounded_rectangle(
        [(lx, ly), (lx + logo_size, ly + logo_size)],
        radius=6,
        fill="#1e3f32",
        outline="#52b788",
        width=1,
    )
    draw.text((lx + 7, ly + 8), "ES", fill="#ffffff", font=font_bold)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="BMP")
    print(f"Generated header: {out_path} ({width}x{height})")


if __name__ == "__main__":
    base_dir = Path("d:/vera-workbench/electron/build")
    create_sidebar_bmp(base_dir / "installerSidebar.bmp")
    create_header_bmp(base_dir / "installerHeader.bmp")
