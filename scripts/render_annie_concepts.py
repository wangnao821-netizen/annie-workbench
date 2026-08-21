"""生成三套高保真 Annie 品牌 LOGO 设计方案 (PNG + 组合展示图)。
基于《Annie · 小安 —— 品牌介绍与 LOGO 设计指引》：
- 意象 1：字母 A 即屋顶 (安家)
- 意象 2：对勾 / 批复章 ✓ (安心 / Settlement)
- 意象 3：澳洲阳光琥珀金高光与深海金融蓝
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def draw_squircle_bg(img, size, fill_color, border_color):
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(16, 16), (size - 16, size - 16)],
        radius=112,
        fill=fill_color,
        outline=border_color,
        width=3,
    )
    # 内发光
    draw.rounded_rectangle(
        [(22, 22), (size - 22, size - 22)],
        radius=106,
        outline=(255, 255, 255, 25),
        width=1,
    )


def create_concept_a(size=512) -> Image.Image:
    """方案 A：经典【安家 + 批复】· 翡翠青绿屋顶 A + 澳洲阳光金对勾 ✓"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_squircle_bg(img, size, "#0a1128", "#38bdf8")
    draw = ImageDraw.Draw(img)

    # 1. 顶部发光
    for r in range(120, 0, -10):
        alpha = int((120 - r) * 0.4)
        draw.ellipse([(256 - r, 30 - r), (256 + r, 30 + r)], fill=(56, 189, 248, alpha))

    # 2. 绘制 A (屋顶) 骨架 - 翡翠青绿与天空蓝
    roof_outer = [
        (130, 390),
        (244, 130),
        (256, 118),
        (268, 130),
        (382, 390),
        (336, 390),
        (308, 320),
        (204, 320),
        (176, 390),
    ]
    draw.polygon(roof_outer, fill="#2dd4bf")

    # 内部镂空三角
    inner_tri = [(256, 180), (292, 275), (220, 275)]
    draw.polygon(inner_tri, fill="#0a1128")

    # 3. 绘制金色批复对勾 ✓ (贯穿横梁)
    check_pts = [
        (160, 285),
        (236, 360),
        (395, 200),
        (370, 175),
        (236, 310),
        (185, 260),
    ]
    draw.polygon(check_pts, fill="#fbbf24")

    # 4. 顶点微光星芒
    draw.ellipse([(250, 95), (262, 107)], fill="#fef08a")

    return img


def create_concept_b(size=512) -> Image.Image:
    """方案 B：极简【几何流线 A】· 纯净极简屋檐 + 融入横梁的升空对勾"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_squircle_bg(img, size, "#090d16", "#10b981")
    draw = ImageDraw.Draw(img)

    # 优雅线框 A (宽度 24px)
    draw.line([(140, 385), (256, 125)], fill="#38bdf8", width=26)
    draw.line([(256, 125), (372, 385)], fill="#10b981", width=26)

    # 顶点圆润连接
    draw.ellipse([(243, 112), (269, 138)], fill="#38bdf8")

    # 穿透而出的金色对勾 ✓
    draw.line([(175, 290), (240, 355)], fill="#f59e0b", width=24)
    draw.line([(240, 355), (410, 185)], fill="#f59e0b", width=24)
    draw.ellipse([(163, 278), (187, 302)], fill="#f59e0b")
    draw.ellipse([(398, 173), (422, 197)], fill="#f59e0b")

    return img


def create_concept_c(size=512) -> Image.Image:
    """方案 C：拟人温暖【小安安家徽标】· 柔和双色暖金与深蓝弧形 A"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_squircle_bg(img, size, "#0f172a", "#f59e0b")
    draw = ImageDraw.Draw(img)

    # 左翼（深海金融蓝）
    left_pts = [(140, 385), (256, 130), (256, 210), (195, 385)]
    draw.polygon(left_pts, fill="#3b82f6")

    # 右翼（翡翠青绿）
    right_pts = [(372, 385), (256, 130), (256, 210), (317, 385)]
    draw.polygon(right_pts, fill="#10b981")

    # 核心金色批复对勾
    check_pts = [
        (170, 275),
        (240, 345),
        (385, 200),
        (360, 175),
        (240, 295),
        (195, 250),
    ]
    draw.polygon(check_pts, fill="#fbbf24")

    return img


def create_showcase():
    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    out_dir.mkdir(parents=True, exist_ok=True)

    img_a = create_concept_a()
    img_b = create_concept_b()
    img_c = create_concept_c()

    img_a.save(out_dir / "annie_logo_concept_a.png")
    img_b.save(out_dir / "annie_logo_concept_b.png")
    img_c.save(out_dir / "annie_logo_concept_c.png")

    # 生成 3 套方案对比大画板 (宽 1200 x 高 460)
    board = Image.new("RGB", (1200, 480), "#090d16")
    draw = ImageDraw.Draw(board)

    # 缩放至 300x300
    thumb_a = img_a.resize((280, 280), Image.Resampling.LANCZOS)
    thumb_b = img_b.resize((280, 280), Image.Resampling.LANCZOS)
    thumb_c = img_c.resize((280, 280), Image.Resampling.LANCZOS)

    board.paste(thumb_a, (80, 90), thumb_a)
    board.paste(thumb_b, (460, 90), thumb_b)
    board.paste(thumb_c, (840, 90), thumb_c)

    # 绘制文字
    font_lg = ImageFont.load_default()
    font_md = ImageFont.load_default()
    for fp in ["C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/simhei.ttf"]:
        if Path(fp).exists():
            try:
                font_lg = ImageFont.truetype(fp, 18)
                font_md = ImageFont.truetype(fp, 13)
                break
            except Exception:
                pass

    draw.text((600, 45), "Annie (小安) · 官方 LOGO 设计提案 (Apple 极简圆角标准)", fill="#ffffff", font=font_lg, anchor="mm")

    draw.text((220, 395), "方案 A · 经典安家批复款", fill="#38bdf8", font=font_md, anchor="mm")
    draw.text((220, 420), "A型尖顶屋檐 + 澳洲阳光金对勾", fill="#94a3b8", font=font_md, anchor="mm")

    draw.text((600, 395), "方案 B · 极简流线几何款", fill="#10b981", font=font_md, anchor="mm")
    draw.text((600, 420), "极简线条屋脊 + 穿透式审批勾", fill="#94a3b8", font=font_md, anchor="mm")

    draw.text((980, 395), "方案 C · 双色信贷信任款", fill="#fbbf24", font=font_md, anchor="mm")
    draw.text((980, 420), "金融蓝绿双翼 + 居中安心勾", fill="#94a3b8", font=font_md, anchor="mm")

    board.save(out_dir / "annie_logo_showcase.png")
    print("Showcase board generated successfully")


if __name__ == "__main__":
    create_showcase()
