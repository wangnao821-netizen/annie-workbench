"""生成 Annie (小安) 官方【拱形门 + 批复对号】的高精矢量 SVG 与 Windows 多尺寸 .ico 图标。"""

from pathlib import Path
from PIL import Image

def generate_svg_and_ico():
    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- 背景渐变：深邃金融深海蓝 -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080e1e" />
      <stop offset="60%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <!-- 顶部微光弧 -->
    <radialGradient id="top-glow" cx="50%" cy="12%" r="65%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.32" />
      <stop offset="60%" stop-color="#3b82f6" stop-opacity="0.06" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- 拱形门渐变：天青蓝到翡翠青绿 -->
    <linearGradient id="arch-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#2dd4bf" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>

    <!-- 批复通过对号渐变：澳洲阳光暖金 -->
    <linearGradient id="check-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="45%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>

    <!-- 阴影 -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.65" />
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#38bdf8" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- 1. Apple Squircle 底座容器 (半径 112) -->
  <rect x="16" y="16" width="480" height="480" rx="112" ry="112" fill="url(#bg-grad)" stroke="#38bdf8" stroke-width="2.5" />
  
  <!-- 2. 顶部微光 -->
  <rect x="16" y="16" width="480" height="480" rx="112" ry="112" fill="url(#top-glow)" />

  <!-- 3. 内高光边框 -->
  <rect x="20" y="20" width="472" height="472" rx="108" ry="108" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />

  <!-- 4. 核心主体组合 (拱门 + 对号) -->
  <g filter="url(#shadow)">
    <!-- 4.1 拱形门 (The Arch) - 粗度 36，圆头连接 -->
    <path d="M 158 375 L 158 236 A 98 98 0 0 1 354 236 L 354 375" 
          fill="none" 
          stroke="url(#arch-grad)" 
          stroke-width="36" 
          stroke-linecap="round" 
          stroke-linejoin="round" />

    <!-- 4.2 批复对号 (The Checkmark ✓) - 粗度 34，圆头 -->
    <path d="M 180 270 L 240 330 L 360 195" 
          fill="none" 
          stroke="url(#check-grad)" 
          stroke-width="34" 
          stroke-linecap="round" 
          stroke-linejoin="round" />

    <!-- 4.3 拱顶高光星芒 -->
    <circle cx="256" cy="126" r="6.5" fill="#fef08a" />
  </g>
</svg>
"""
    (out_dir / "annie_master_arch.svg").write_text(svg_content.strip(), encoding="utf-8")

    # 生成包含多尺寸 (256, 128, 64, 48, 32, 16) 的 Windows .ico
    master_png = Image.open(out_dir / "annie_logo_master_1024.png")
    master_png.save(
        out_dir / "annie_master.ico",
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )
    print("Generated SVG & ICO successfully")

if __name__ == "__main__":
    generate_svg_and_ico()
