"""生成 Annie (小安) 官方定稿【拱形门 + 批复对号】2K 高清品牌设计稿与超清多尺寸图标资产。
核心意象：
- 拱形门 (The Arch of Home)：安家置业、通往新家的幸福拱门，形似圆润 A
- 批复对号 (The Settlement Checkmark ✓)：材料齐全、银行批复通过、安心交割
- 澳洲阳光金 (#fbbf24) + 深邃金融蓝 (#080e1e) + 翡翠青绿 (#2dd4bf)
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def draw_master_icon(size=1024) -> Image.Image:
    scale = size / 512.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Apple Squircle 基础圆角容器 (半径 112 * scale)
    pad = int(16 * scale)
    radius = int(112 * scale)
    
    # 绘制深海蓝底座
    draw.rounded_rectangle(
        [(pad, pad), (size - pad, size - pad)],
        radius=radius,
        fill="#080e1e",
        outline="#38bdf8",
        width=max(2, int(3 * scale)),
    )

    # 2. 顶部微光天顶弧光
    glow_r = int(240 * scale)
    glow_center_x = size // 2
    glow_center_y = int(50 * scale)
    for r in range(glow_r, 0, -int(12 * scale)):
        alpha = int((glow_r - r) / glow_r * 45)
        draw.ellipse(
            [(glow_center_x - r, glow_center_y - r), (glow_center_x + r, glow_center_y + r)],
            fill=(56, 189, 248, alpha)
        )

    # 内高光边框
    inner_pad = pad + int(4 * scale)
    draw.rounded_rectangle(
        [(inner_pad, inner_pad), (size - inner_pad, size - inner_pad)],
        radius=radius - int(4 * scale),
        outline=(255, 255, 255, 35),
        width=max(1, int(1.5 * scale)),
    )

    # 3. 绘制核心主体 1：优雅圆润半圆【拱形门】(The Arch)
    # 拱门尺寸与位置
    arch_w = int(36 * scale)  # 线宽
    arch_left = int(140 * scale)
    arch_right = int(372 * scale)
    arch_top = int(120 * scale)
    arch_bottom = int(375 * scale)
    arch_radius = (arch_right - arch_left) // 2

    # 3.1 绘制顶部半圆拱
    arc_box = [(arch_left, arch_top), (arch_right, arch_top + arch_radius * 2)]
    draw.arc(arc_box, start=180, end=360, fill="#2dd4bf", width=arch_w)

    # 3.2 绘制两侧向下立柱
    straight_top = arch_top + arch_radius
    draw.line([(arch_left + arch_w // 2, straight_top), (arch_left + arch_w // 2, arch_bottom)], fill="#2dd4bf", width=arch_w)
    draw.line([(arch_right - arch_w // 2, straight_top), (arch_right - arch_w // 2, arch_bottom)], fill="#2dd4bf", width=arch_w)

    # 3.3 拱门底部两端圆头
    half_w = arch_w // 2
    draw.ellipse(
        [(arch_left, arch_bottom - half_w), (arch_left + arch_w, arch_bottom + half_w)],
        fill="#2dd4bf"
    )
    draw.ellipse(
        [(arch_right - arch_w, arch_bottom - half_w), (arch_right, arch_bottom + half_w)],
        fill="#2dd4bf"
    )

    # 4. 绘制核心主体 2：澳洲阳光暖金【批复通过对号】✓ (The Checkmark)
    # 尺寸与空间位置：完美嵌合在拱门下半部，并向右上方自信舒展
    chk_w = int(34 * scale)
    chk_p1 = (int(180 * scale), int(270 * scale))  # 起笔
    chk_p2 = (int(240 * scale), int(330 * scale))  # 折角拐点
    chk_p3 = (int(360 * scale), int(195 * scale))  # 扬起顶点

    # 绘制金勾线条
    draw.line([chk_p1, chk_p2], fill="#fbbf24", width=chk_w)
    draw.line([chk_p2, chk_p3], fill="#fbbf24", width=chk_w)

    # 对号 3 个端点圆角化
    chk_half = chk_w // 2
    for p in [chk_p1, chk_p2, chk_p3]:
        draw.ellipse([(p[0] - chk_half, p[1] - chk_half), (p[0] + chk_half, p[1] + chk_half)], fill="#fbbf24")

    # 5. 拱门顶端高光灵动小光环（象征 AI 智慧）
    star_x = size // 2
    star_y = arch_top - int(12 * scale)
    draw.ellipse(
        [(star_x - int(7 * scale), star_y - int(7 * scale)), (star_x + int(7 * scale), star_y + int(7 * scale))],
        fill="#fef08a"
    )

    return img


def create_hd_brand_showcase():
    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. 生成 1024x1024 官方母版图标
    master_1024 = draw_master_icon(1024)
    master_1024.save(out_dir / "annie_logo_master_1024.png")

    # 2. 生成多尺寸应用图标
    icon_512 = master_1024.resize((512, 512), Image.Resampling.LANCZOS)
    icon_256 = master_1024.resize((256, 256), Image.Resampling.LANCZOS)
    icon_128 = master_1024.resize((128, 128), Image.Resampling.LANCZOS)
    icon_32 = master_1024.resize((32, 32), Image.Resampling.LANCZOS)

    icon_512.save(out_dir / "annie_logo_512.png")
    icon_128.save(out_dir / "annie_logo_128.png")
    icon_32.save(out_dir / "annie_logo_32.png")

    # 3. 制作 2K 超清品牌设计稿展示展板 (宽 1800 x 高 1000)
    canvas = Image.new("RGB", (1800, 1000), "#060a12")
    draw = ImageDraw.Draw(canvas)

    # 加载系统字体
    font_hero = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_sec = ImageFont.load_default()
    font_body = ImageFont.load_default()
    for fp in ["C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/simhei.ttf"]:
        if Path(fp).exists():
            try:
                font_hero = ImageFont.truetype(fp, 38)
                font_sub = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
                font_sec = ImageFont.truetype(fp, 22)
                font_body = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 15)
                break
            except Exception:
                pass

    # 头部标题区
    draw.text((100, 60), "Annie · 小安", fill="#ffffff", font=font_hero)
    draw.text((100, 115), "官方品牌超级符号与设计规范稿 (Official Brand Identity Specification)", fill="#94a3b8", font=font_sub)
    draw.line([(100, 155), (1700, 155)], fill="#1e293b", width=2)

    # 左侧：主 LOGO 放大展示 (540x540)
    master_540 = master_1024.resize((540, 540), Image.Resampling.LANCZOS)
    canvas.paste(master_540, (100, 200), master_540)

    draw.text((370, 770), "主图标 (Primary App Icon)", fill="#38bdf8", font=font_sec, anchor="mm")
    draw.text((370, 805), "Apple Squircle 标准圆角 · 1024×1024 Ultra HD", fill="#64748b", font=font_body, anchor="mm")

    # 右侧上部：超级符号解构与品牌理念
    right_x = 720
    draw.text((right_x, 200), "📐 超级符号设计释义", fill="#ffffff", font=font_sec)
    
    meanings = [
        ("• 拱形门 (The Arch of Home)", "源自安家置业。圆润的拱门既是新家的象征，又是大写字母 A 的极简抽象，温润安稳、没有棱角。"),
        ("• 批复对号 (The Settlement ✓)", "源自信贷交割。澳洲阳光暖金对勾从拱门内自信舒展，代表“材料齐备、银行批复通过、安心交割”。"),
        ("• 澳洲阳光与金融深海蓝", "以深海深蓝建立专业可信的金融底座，天青翡翠与暖金赋予生命体温度与阳光感。"),
    ]
    
    y = 245
    for title, desc in meanings:
        draw.text((right_x, y), title, fill="#2dd4bf", font=font_body)
        y += 24
        draw.text((right_x + 16, y), desc, fill="#cbd5e1", font=font_body)
        y += 38

    # 右侧中部：品牌标准色盘 (Color Palette)
    draw.line([(right_x, 485), (1700, 485)], fill="#1e293b", width=1)
    draw.text((right_x, 505), "🎨 品牌标准调色盘 (Color System)", fill="#ffffff", font=font_sec)

    colors = [
        ("#080e1e", "深海金融蓝", "Deep Navy #080E1E", "底座 / 专业信任"),
        ("#2dd4bf", "翡翠青绿", "Teal Emerald #2DD4BF", "拱门 / 安家合规"),
        ("#fbbf24", "澳洲阳光金", "Sunlit Amber #FBBF24", "批复勾 / 高光交割"),
        ("#38bdf8", "天青高光", "Azure Cyan #38BDF8", "外边框 / 智慧"),
    ]

    swatch_x = right_x
    for hex_val, cn_name, en_hex, role in colors:
        # 色块
        draw.rounded_rectangle([(swatch_x, 545), (swatch_x + 60, 605)], radius=8, fill=hex_val, outline="#334155", width=1)
        draw.text((swatch_x + 72, 552), cn_name, fill="#ffffff", font=font_body)
        draw.text((swatch_x + 72, 574), en_hex, fill="#94a3b8", font=font_body)
        draw.text((swatch_x + 72, 592), role, fill="#64748b", font=font_body)
        swatch_x += 240

    # 右侧下部：多端应用尺寸规格预览 (Responsive App Icons)
    draw.line([(right_x, 640), (1700, 640)], fill="#1e293b", width=1)
    draw.text((right_x, 660), "📱 多端应用尺寸适配规范 (Scale Hierarchy)", fill="#ffffff", font=font_sec)

    # 128x128
    canvas.paste(icon_128, (right_x, 710), icon_128)
    draw.text((right_x + 64, 855), "128×128", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 64, 875), "系统托盘/Dock", fill="#64748b", font=font_body, anchor="mm")

    # 64x64
    icon_64 = master_1024.resize((64, 64), Image.Resampling.LANCZOS)
    canvas.paste(icon_64, (right_x + 190, 742), icon_64)
    draw.text((right_x + 222, 855), "64×64", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 222, 875), "桌面快捷方式", fill="#64748b", font=font_body, anchor="mm")

    # 32x32
    canvas.paste(icon_32, (right_x + 340, 758), icon_32)
    draw.text((right_x + 356, 855), "32×32", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 356, 875), "窗口标题栏", fill="#64748b", font=font_body, anchor="mm")

    # 16x16
    icon_16 = master_1024.resize((16, 16), Image.Resampling.LANCZOS)
    canvas.paste(icon_16, (right_x + 450, 766), icon_16)
    draw.text((right_x + 458, 855), "16×16", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 458, 875), "Favicon 标", fill="#64748b", font=font_body, anchor="mm")

    # 底部标语
    draw.text((900, 955), "“把案子安顿到交割” · Settled with Annie · EverStones Intelligence", fill="#475569", font=font_body, anchor="mm")

    canvas.save(out_dir / "annie_brand_specification_sheet.png")
    print("Master brand specification sheet generated successfully")


if __name__ == "__main__":
    create_hd_brand_showcase()
