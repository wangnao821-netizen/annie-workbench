"""生成【圆润简笔无横线】版本的 Annie LOGO 系列方案。
用户指示：
1. 去除尖锐感，改为圆润弧度 (Smooth Rounded Corners / Arcs)
2. 简笔线条，不要 A 中间的那一横
3. 突出安家屋檐与批复通过对勾 ✓
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def draw_squircle_bg(img, size, fill_color, border_color):
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(16, 16), (size - 16, size - 16)],
        radius=112,
        fill=fill_color,
        outline=border_color,
        width=2,
    )
    # 内发光
    draw.rounded_rectangle(
        [(22, 22), (size - 22, size - 22)],
        radius=106,
        outline=(255, 255, 255, 20),
        width=1,
    )


def create_rounded_v1(size=512) -> Image.Image:
    """V1 · 极简圆润屋檐拱门 + 独立悬浮暖金批复勾 (纯净无横线)"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_squircle_bg(img, size, "#090f1d", "#38bdf8")
    draw = ImageDraw.Draw(img)

    # 1. 顶部柔和环境光
    for r in range(140, 0, -10):
        alpha = int((140 - r) * 0.3)
        draw.ellipse([(256 - r, 40 - r), (256 + r, 40 + r)], fill=(56, 189, 248, alpha))

    # 2. 简笔圆润 A 屋顶（无横线，粗度 32px，大圆头）
    # 左腿 (155, 375) -> 顶端大圆弧 (256, 140) -> 右腿 (357, 375)
    # 用高精度多段圆弧绘制平滑线条
    draw.line([(160, 365), (240, 165)], fill="#2dd4bf", width=34)
    draw.line([(272, 165), (352, 365)], fill="#2dd4bf", width=34)
    # 顶部大圆弧平滑连接
    draw.arc([(220, 125), (292, 197)], start=180, end=360, fill="#2dd4bf", width=34)
    # 底部两端大圆角端点
    draw.ellipse([(143, 348), (177, 382)], fill="#2dd4bf")
    draw.ellipse([(335, 348), (369, 382)], fill="#2dd4bf")
    # 顶部高光圆头
    draw.ellipse([(239, 125), (273, 159)], fill="#38bdf8")

    # 3. 温暖的独立批复对勾 ✓ (悬浮在 A 的中央下方，温暖明亮，粗度 30px)
    draw.line([(185, 275), (245, 335)], fill="#fbbf24", width=30)
    draw.line([(245, 335), (395, 185)], fill="#fbbf24", width=30)
    # 对勾各端点圆润化
    draw.ellipse([(170, 260), (200, 290)], fill="#fbbf24")
    draw.ellipse([(230, 320), (260, 350)], fill="#fbbf24")
    draw.ellipse([(380, 170), (410, 200)], fill="#fbbf24")

    # 4. 微光高光星芒
    draw.ellipse([(250, 85), (262, 97)], fill="#fef08a")

    return img


def create_rounded_v2(size=512) -> Image.Image:
    """V2 · 一笔连贯生命体【小安流线】· 左侧圆润屋檐顺势向上挑出通过勾"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_squircle_bg(img, size, "#0a1128", "#10b981")
    draw = ImageDraw.Draw(img)

    # 左侧拱形屋檐 (天青蓝 -> 翡翠绿)
    draw.line([(150, 365), (245, 155)], fill="#38bdf8", width=32)
    draw.line([(267, 155), (325, 280)], fill="#2dd4bf", width=32)
    # 顶部大圆角
    draw.arc([(225, 120), (287, 182)], start=180, end=360, fill="#38bdf8", width=32)
    draw.ellipse([(134, 349), (166, 381)], fill="#38bdf8")
    draw.ellipse([(240, 120), (272, 152)], fill="#38bdf8")

    # 右侧顺势连贯上扬的金色对勾（象征审批破浪前行）
    draw.line([(220, 345), (325, 280)], fill="#f59e0b", width=30)
    draw.line([(220, 345), (170, 295)], fill="#f59e0b", width=30)
    draw.line([(325, 280), (415, 170)], fill="#f59e0b", width=30)

    draw.ellipse([(155, 280), (185, 310)], fill="#f59e0b")
    draw.ellipse([(205, 330), (235, 360)], fill="#f59e0b")
    draw.ellipse([(400, 155), (430, 185)], fill="#f59e0b")

    return img


def create_rounded_v3(size=512) -> Image.Image:
    """V3 · 双弧拥抱形【安稳小屋】· 柔和圆润双弧倒U型屋顶 + 居中安心小笑脸对勾"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_squircle_bg(img, size, "#0c1322", "#f59e0b")
    draw = ImageDraw.Draw(img)

    # 饱满的极简圆弧倒 U 屋顶（无尖角、纯圆弧拱门）
    # 顶部是一个完全平滑的半圆拱
    draw.arc([(150, 130), (362, 342)], start=180, end=360, fill="#38bdf8", width=34)
    # 两侧垂直立柱
    draw.line([(150, 236), (150, 365)], fill="#38bdf8", width=34)
    draw.line([(362, 236), (362, 365)], fill="#38bdf8", width=34)
    # 两端圆头
    draw.ellipse([(133, 348), (167, 382)], fill="#38bdf8")
    draw.ellipse([(345, 348), (379, 382)], fill="#38bdf8")

    # 居中安心批复对勾（饱满温润）
    draw.line([(195, 275), (245, 325)], fill="#fbbf24", width=28)
    draw.line([(245, 325), (345, 215)], fill="#fbbf24", width=28)
    draw.ellipse([(181, 261), (209, 289)], fill="#fbbf24")
    draw.ellipse([(231, 311), (259, 339)], fill="#fbbf24")
    draw.ellipse([(331, 201), (359, 229)], fill="#fbbf24")

    return img


def create_v2_showcase():
    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    out_dir.mkdir(parents=True, exist_ok=True)

    img1 = create_rounded_v1()
    img2 = create_rounded_v2()
    img3 = create_rounded_v3()

    img1.save(out_dir / "annie_rounded_v1.png")
    img2.save(out_dir / "annie_rounded_v2.png")
    img3.save(out_dir / "annie_rounded_v3.png")

    # 生成 3 款圆润简笔对比展板
    board = Image.new("RGB", (1200, 480), "#080c14")
    draw = ImageDraw.Draw(board)

    thumb1 = img1.resize((280, 280), Image.Resampling.LANCZOS)
    thumb2 = img2.resize((280, 280), Image.Resampling.LANCZOS)
    thumb3 = img3.resize((280, 280), Image.Resampling.LANCZOS)

    board.paste(thumb1, (80, 90), thumb1)
    board.paste(thumb2, (460, 90), thumb2)
    board.paste(thumb3, (840, 90), thumb3)

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

    draw.text((600, 45), "Annie (小安) · 圆润简笔版 LOGO 优化提案 (无横线·温润亲和)", fill="#ffffff", font=font_lg, anchor="mm")

    draw.text((220, 395), "款 1 · 圆润简笔屋檐 + 暖金对勾", fill="#38bdf8", font=font_md, anchor="mm")
    draw.text((220, 420), "去尖角大圆头 · 无横线 · 极简通透", fill="#94a3b8", font=font_md, anchor="mm")

    draw.text((600, 395), "款 2 · 连贯流线【一笔破浪勾】", fill="#2dd4bf", font=font_md, anchor="mm")
    draw.text((600, 420), "左侧圆弧屋脊 · 顺势挑出金色批复", fill="#94a3b8", font=font_md, anchor="mm")

    draw.text((980, 395), "款 3 · 饱满拱门【安稳居所】", fill="#fbbf24", font=font_md, anchor="mm")
    draw.text((980, 420), "纯半圆拱形屋檐 · 居中安心通过", fill="#94a3b8", font=font_md, anchor="mm")

    board.save(out_dir / "annie_rounded_showcase.png")
    print("Rounded showcase generated successfully")


if __name__ == "__main__":
    create_v2_showcase()
