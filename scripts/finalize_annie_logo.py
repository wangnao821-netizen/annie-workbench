"""生成 Annie (小安) 最终官方定稿 LOGO (方案 1 · 黄金内嵌包裹款)。
包含：
1. annie_logo_official.svg (高精矢量文件)
2. annie_logo_official_1024.png (1024x1024 超清母版)
3. annie_official.ico (Windows 标准多尺寸图标)
4. 全套自适应 PNG 尺寸 (512, 256, 128, 64, 32, 16)
5. annie_official_brand_guide.png (终极品牌规范设计大板)
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def draw_official_logo(size=1024) -> Image.Image:
    scale = size / 512.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Apple Squircle 标准圆角容器 (半径 112 * scale)
    pad = int(16 * scale)
    radius = int(112 * scale)

    # 绘制深海金融蓝底座
    draw.rounded_rectangle(
        [(pad, pad), (size - pad, size - pad)],
        radius=radius,
        fill="#080e1e",
        outline="#38bdf8",
        width=max(2, int(3.5 * scale)),
    )

    # 顶部天顶微光光晕 (Ambient Glow)
    glow_r = int(250 * scale)
    glow_x = size // 2
    glow_y = int(50 * scale)
    for r in range(glow_r, 0, -int(12 * scale)):
        alpha = int((glow_r - r) / glow_r * 40)
        draw.ellipse([(glow_x - r, glow_y - r), (glow_x + r, glow_y + r)], fill=(56, 189, 248, alpha))

    # 内部 1px 呼吸感高光边框
    inner_pad = pad + int(4 * scale)
    draw.rounded_rectangle(
        [(inner_pad, inner_pad), (size - inner_pad, size - inner_pad)],
        radius=radius - int(4 * scale),
        outline=(255, 255, 255, 30),
        width=max(1, int(1.5 * scale)),
    )

    # 2. 核心主体 ①：翡翠青绿【拱形门 (The Arch of Home)】
    # 尺寸与位置 (黄金比例)
    arch_w = int(36 * scale)
    arch_left = int(135 * scale)
    arch_right = int(377 * scale)
    arch_top = int(115 * scale)
    arch_bottom = int(380 * scale)
    arch_radius = (arch_right - arch_left) // 2

    # 2.1 顶部半圆拱
    arc_box = [(arch_left, arch_top), (arch_right, arch_top + arch_radius * 2)]
    draw.arc(arc_box, start=180, end=360, fill="#2dd4bf", width=arch_w)

    # 2.2 两侧垂直立柱
    straight_top = arch_top + arch_radius
    draw.line([(arch_left + arch_w // 2, straight_top), (arch_left + arch_w // 2, arch_bottom)], fill="#2dd4bf", width=arch_w)
    draw.line([(arch_right - arch_w // 2, straight_top), (arch_right - arch_w // 2, arch_bottom)], fill="#2dd4bf", width=arch_w)

    # 2.3 两端平滑圆头
    half_w = arch_w // 2
    draw.ellipse([(arch_left, arch_bottom - half_w), (arch_left + arch_w, arch_bottom + half_w)], fill="#2dd4bf")
    draw.ellipse([(arch_right - arch_w, arch_bottom - half_w), (arch_right, arch_bottom + half_w)], fill="#2dd4bf")

    # 3. 核心主体 ②：澳洲阳光暖金【黄金内嵌批复对号 ✓】
    # 严守内嵌包裹原则：端点完全收敛在拱门内部，舒展优雅
    chk_w = int(32 * scale)
    chk_p1 = (int(190 * scale), int(270 * scale))
    chk_p2 = (int(242 * scale), int(322 * scale))
    chk_p3 = (int(322 * scale), int(218 * scale))

    draw.line([chk_p1, chk_p2], fill="#fbbf24", width=chk_w)
    draw.line([chk_p2, chk_p3], fill="#fbbf24", width=chk_w)

    # 对号端点圆角化
    chk_half = chk_w // 2
    for p in [chk_p1, chk_p2, chk_p3]:
        draw.ellipse([(p[0] - chk_half, p[1] - chk_half), (p[0] + chk_half, p[1] + chk_half)], fill="#fbbf24")

    # 4. 拱顶微光智慧星芒
    star_x = size // 2
    star_y = arch_top - int(12 * scale)
    draw.ellipse(
        [(star_x - int(7 * scale), star_y - int(7 * scale)), (star_x + int(7 * scale), star_y + int(7 * scale))],
        fill="#fef08a",
    )

    return img


def generate_final_assets():
    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. 1024x1024 官方超清母版
    master_1024 = draw_official_logo(1024)
    master_1024.save(out_dir / "annie_logo_official_1024.png")

    # 2. 全尺寸自适应 PNG
    sizes = [512, 256, 128, 64, 32, 16]
    for s in sizes:
        resized = master_1024.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(out_dir / f"annie_logo_{s}.png")

    # 3. Windows 标准多尺寸 ICO
    master_1024.save(
        out_dir / "annie_official.ico",
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )

    # 4. 最终高精矢量 SVG
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080e1e" />
      <stop offset="60%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="12%" r="65%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#3b82f6" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="arch" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#2dd4bf" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="check" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="45%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6" />
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#38bdf8" flood-opacity="0.25" />
    </filter>
  </defs>

  <rect x="16" y="16" width="480" height="480" rx="112" ry="112" fill="url(#bg)" stroke="#38bdf8" stroke-width="3" />
  <rect x="16" y="16" width="480" height="480" rx="112" ry="112" fill="url(#glow)" />
  <rect x="20" y="20" width="472" height="472" rx="108" ry="108" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />

  <g filter="url(#shadow)">
    <!-- 拱形门 (The Arch) -->
    <path d="M 153 380 L 153 236 A 103 103 0 0 1 359 236 L 359 380" 
          fill="none" 
          stroke="url(#arch)" 
          stroke-width="36" 
          stroke-linecap="round" 
          stroke-linejoin="round" />

    <!-- 黄金内嵌批复对号 (The Enclosed Checkmark ✓) -->
    <path d="M 190 270 L 242 322 L 322 218" 
          fill="none" 
          stroke="url(#check)" 
          stroke-width="32" 
          stroke-linecap="round" 
          stroke-linejoin="round" />

    <!-- 拱顶智慧星芒 -->
    <circle cx="256" cy="121" r="6" fill="#fef08a" />
  </g>
</svg>
"""
    (out_dir / "annie_logo_official.svg").write_text(svg_content.strip(), encoding="utf-8")

    # 5. 官方终极品牌规范展示图 (1800x1000)
    canvas = Image.new("RGB", (1800, 1000), "#060a12")
    draw = ImageDraw.Draw(canvas)

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

    draw.text((100, 60), "Annie · 小安", fill="#ffffff", font=font_hero)
    draw.text((100, 115), "官方定稿超级符号与设计规范稿 (Official Brand Identity Specification · Final)", fill="#94a3b8", font=font_sub)
    draw.line([(100, 155), (1700, 155)], fill="#1e293b", width=2)

    master_540 = master_1024.resize((540, 540), Image.Resampling.LANCZOS)
    canvas.paste(master_540, (100, 200), master_540)

    draw.text((370, 770), "定稿主图标 (Primary App Icon)", fill="#38bdf8", font=font_sec, anchor="mm")
    draw.text((370, 805), "方案 1 · 黄金内嵌包裹款 · 1024×1024 Ultra HD", fill="#64748b", font=font_body, anchor="mm")

    right_x = 720
    draw.text((right_x, 200), "📐 定稿超级符号结构释义", fill="#ffffff", font=font_sec)
    
    meanings = [
        ("• 拱形门 (The Arch of Home)", "圆润半圆拱门象征新家与置业，大写字母 A 的极简抽象，温润安稳、毫无棱角。"),
        ("• 黄金内嵌批复勾 (The Enclosed Checkmark ✓)", "澳洲阳光金对号完全被拱门温柔包裹，象征“材料齐备、银行批复通过、安心交割”，绝不穿出越界，安全感拉满。"),
        ("• 金融信任蓝 + 澳洲阳光金", "深邃金融蓝底座提供最高信任保障，翡翠青绿与阳光暖金赋予 AI 助手温度与亲和力。"),
    ]
    
    y = 245
    for title, desc in meanings:
        draw.text((right_x, y), title, fill="#2dd4bf", font=font_body)
        y += 24
        draw.text((right_x + 16, y), desc, fill="#cbd5e1", font=font_body)
        y += 38

    draw.line([(right_x, 485), (1700, 485)], fill="#1e293b", width=1)
    draw.text((right_x, 505), "🎨 品牌标准调色盘 (Color System)", fill="#ffffff", font=font_sec)

    colors = [
        ("#080e1e", "深海金融蓝", "#080E1E", "底座 / 专业信任"),
        ("#2dd4bf", "翡翠青绿", "#2DD4BF", "拱门 / 安家合规"),
        ("#fbbf24", "澳洲阳光金", "#FBBF24", "批复勾 / 高光交割"),
        ("#38bdf8", "天青高光", "#38BDF8", "外边框 / 智慧"),
    ]

    swatch_x = right_x
    for hex_val, cn_name, en_hex, role in colors:
        draw.rounded_rectangle([(swatch_x, 545), (swatch_x + 60, 605)], radius=8, fill=hex_val, outline="#334155", width=1)
        draw.text((swatch_x + 72, 552), cn_name, fill="#ffffff", font=font_body)
        draw.text((swatch_x + 72, 574), en_hex, fill="#94a3b8", font=font_body)
        draw.text((swatch_x + 72, 592), role, fill="#64748b", font=font_body)
        swatch_x += 240

    draw.line([(right_x, 640), (1700, 640)], fill="#1e293b", width=1)
    draw.text((right_x, 660), "📱 多端应用尺寸适配规范 (Scale Hierarchy)", fill="#ffffff", font=font_sec)

    icon_128 = master_1024.resize((128, 128), Image.Resampling.LANCZOS)
    canvas.paste(icon_128, (right_x, 710), icon_128)
    draw.text((right_x + 64, 855), "128×128", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 64, 875), "系统托盘/Dock", fill="#64748b", font=font_body, anchor="mm")

    icon_64 = master_1024.resize((64, 64), Image.Resampling.LANCZOS)
    canvas.paste(icon_64, (right_x + 190, 742), icon_64)
    draw.text((right_x + 222, 855), "64×64", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 222, 875), "桌面快捷方式", fill="#64748b", font=font_body, anchor="mm")

    icon_32 = master_1024.resize((32, 32), Image.Resampling.LANCZOS)
    canvas.paste(icon_32, (right_x + 340, 758), icon_32)
    draw.text((right_x + 356, 855), "32×32", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 356, 875), "窗口标题栏", fill="#64748b", font=font_body, anchor="mm")

    icon_16 = master_1024.resize((16, 16), Image.Resampling.LANCZOS)
    canvas.paste(icon_16, (right_x + 450, 766), icon_16)
    draw.text((right_x + 458, 855), "16×16", fill="#94a3b8", font=font_body, anchor="mm")
    draw.text((right_x + 458, 875), "Favicon 标", fill="#64748b", font=font_body, anchor="mm")

    draw.text((900, 955), "“把案子安顿到交割” · Settled with Annie · EverStones Intelligence", fill="#475569", font=font_body, anchor="mm")

    canvas.save(out_dir / "annie_official_brand_guide.png")
    print("Final official brand assets generated successfully")


if __name__ == "__main__":
    generate_final_assets()
