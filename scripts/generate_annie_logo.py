"""生成 Annie (小安) 品牌的高保真矢量 SVG 与渲染 PNG/ICO。
符合《Annie · 小安 —— 品牌介绍与 LOGO 设计指引》：
- 意象：字母 A (Annie) + 房屋屋檐 (安家置业) + 批复对勾 (安心交割/Approval) + 澳洲阳光琥珀金高光
- 形态：Apple Squircle 圆角方块、深邃金融信任蓝底座、极致纯净通透。
"""

from pathlib import Path
from PIL import Image, ImageDraw


def generate_annie_svg(out_path: Path):
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- 背景渐变：深邃金融深海蓝 -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b132b" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <!-- 顶部环境光渐变 -->
    <radialGradient id="top-glow" cx="50%" cy="10%" r="70%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#3b82f6" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- 主体 A 与屋顶渐变：天空蓝到翡翠青绿 -->
    <linearGradient id="roof-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="45%" stop-color="#2dd4bf" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>

    <!-- 批复对勾横梁渐变：澳洲阳光金到琥珀橙 -->
    <linearGradient id="check-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>

    <!-- 阴影滤镜 -->
    <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.6" />
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#38bdf8" flood-opacity="0.25" />
    </filter>

    <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- 1. Apple 风格 Squircle 底座容器 (半径 115) -->
  <rect x="16" y="16" width="480" height="480" rx="112" ry="112" fill="url(#bg-grad)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="2.5" />
  
  <!-- 2. 顶部微光弧 -->
  <rect x="16" y="16" width="480" height="480" rx="112" ry="112" fill="url(#top-glow)" />

  <!-- 3. 内发光高光边框线 -->
  <rect x="20" y="20" width="472" height="472" rx="108" ry="108" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" />

  <!-- 4. 主体图标组合：A 屋顶 + 批复通过对勾 (居中) -->
  <g filter="url(#drop-shadow)" transform="translate(0, 10)">
    
    <!-- 4.1 屋脊与 A 的主轮廓 (尖顶屋檐) -->
    <!-- 左支柱与左屋顶 -->
    <path d="M 136 376 L 232 152 C 242 128 270 128 280 152 L 376 376 C 382 390 368 404 354 398 L 332 388 C 322 384 316 374 312 364 L 256 220 L 200 364 C 196 374 190 384 180 388 L 158 398 C 144 404 130 390 136 376 Z" 
          fill="url(#roof-grad)" />

    <!-- 4.2 批复对勾（Approval & Settlement Checkmark 横梁） -->
    <!-- 巧妙横跨 A 的中部，从左侧短勾上扬贯穿至右侧突破屋顶，象征审批通过与交割安心 -->
    <path d="M 172 278 L 226 332 C 234 340 248 340 256 332 L 372 216 C 384 204 404 204 416 216 C 428 228 428 248 416 260 L 264 412 C 248 428 222 428 206 412 L 132 338 C 120 326 120 306 132 294 C 144 282 164 282 172 278 Z" 
          fill="url(#check-grad)" 
          filter="url(#glow-filter)" />

    <!-- 4.3 核心亮点小星芒（象征 AI 决策与批复高光） -->
    <circle cx="256" cy="116" r="8" fill="#fef08a" opacity="0.9" />
    <path d="M 256 96 L 259 113 L 276 116 L 259 119 L 256 136 L 253 119 L 236 116 L 253 113 Z" fill="#ffffff" />
  </g>
</svg>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(svg_content.strip(), encoding="utf-8")
    print(f"Generated Annie SVG: {out_path}")


def render_annie_png(out_path: Path):
    # 使用 Pillow 绘制高保真 512x512 预览 PNG
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. 绘制底座圆角矩形
    # 背景底色
    draw.rounded_rectangle(
        [(16, 16), (size - 16, size - 16)],
        radius=112,
        fill="#0b132b",
        outline="#2dd4bf",
        width=2,
    )

    # 顶部光弧
    draw.rounded_rectangle(
        [(20, 20), (size - 20, size - 20)],
        radius=108,
        outline=(255, 255, 255, 30),
        width=1,
    )

    # 2. 绘制 A (屋顶) 主轮廓
    roof_pts = [
        (136, 380),
        (244, 140),
        (256, 132),
        (268, 140),
        (376, 380),
        (340, 380),
        (312, 310),
        (200, 310),
        (172, 380),
    ]
    draw.polygon(roof_pts, fill="#2dd4bf")

    # 内部镂空三角
    inner_pts = [(256, 185), (288, 270), (224, 270)]
    draw.polygon(inner_pts, fill="#0b132b")

    # 3. 绘制金色批复对勾 ✓ (Checkmark)
    check_pts = [
        (150, 300),
        (235, 385),
        (405, 215),
        (380, 190),
        (235, 335),
        (175, 275),
    ]
    draw.polygon(check_pts, fill="#f59e0b")

    # 4. 顶部高光星芒
    draw.ellipse([(250, 100), (262, 112)], fill="#fef08a")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG")
    print(f"Rendered Annie PNG: {out_path}")


if __name__ == "__main__":
    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    generate_annie_svg(out_dir / "annie_logo.svg")
    render_annie_png(out_dir / "annie_logo_preview.png")
