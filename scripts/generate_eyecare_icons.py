"""生成护眼绿主题的 ES 方形圆角图标 (app.ico, icon.ico, icon.png, favicon.ico 等)。
背景色：温润深邃护眼绿 (#1e3f32 / #264638)
前景色：纯白精细 ES 品牌字
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def generate_eyecare_es_icons():
    # 生成 512x512 母版
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. 护眼绿 Squircle 圆角底座
    # 采用高雅护眼墨绿色 #1e3f32，顶部到深色 #142a22
    pad = 16
    radius = 112
    draw.rounded_rectangle(
        [(pad, pad), (size - pad, size - pad)],
        radius=radius,
        fill="#1e3f32",
        outline="#52b788",
        width=3,
    )

    # 顶部微光光弧
    draw.rounded_rectangle(
        [(pad + 4, pad + 4), (size - pad - 4, size - pad - 4)],
        radius=radius - 4,
        outline=(255, 255, 255, 35),
        width=1,
    )

    # 2. 绘制纯白 ES 字体
    font_es = ImageFont.load_default()
    for fp in [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/msyhbd.ttc",
    ]:
        if Path(fp).exists():
            try:
                font_es = ImageFont.truetype(fp, 210)
                break
            except Exception:
                pass

    draw.text((size // 2, size // 2 - 10), "ES", fill="#ffffff", font=font_es, anchor="mm")

    # 3. 底部微妙点缀小翡翠光点
    draw.ellipse([(size // 2 - 6, size - 50), (size // 2 + 6, size - 38)], fill="#52b788")

    # 输出目标路径
    electron_build = Path("d:/vera-workbench/electron/build")
    electron_build.mkdir(parents=True, exist_ok=True)
    frontend_public = Path("d:/vera-workbench/frontend/public")
    frontend_public.mkdir(parents=True, exist_ok=True)
    art_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")

    # 保存 PNG
    img.save(electron_build / "icon.png")
    img.save(frontend_public / "favicon.png")
    img.save(art_dir / "es_eyecare_icon.png")

    # 保存 ICO
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(electron_build / "app.ico", format="ICO", sizes=ico_sizes)
    img.save(electron_build / "icon.ico", format="ICO", sizes=ico_sizes)
    img.save(frontend_public / "favicon.ico", format="ICO", sizes=ico_sizes)

    print("Eyecare green ES icons generated successfully across all targets")


if __name__ == "__main__":
    generate_eyecare_es_icons()
