"""生成真正 Apple 级深邃翡翠墨绿 ES 品牌图标 (app.ico, icon.ico, favicon.ico 等)。
底色：深邃冷墨绿 (#113327)
边框：翡翠高光 (#2dd4bf)
前景色：纯白高亮 ES 品牌字
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def generate_true_eyecare_icons():
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = 16
    radius = 112

    # 1. 绘制深邃冷墨绿底座 (#113327 -> #0b221a)
    draw.rounded_rectangle(
        [(pad, pad), (size - pad, size - pad)],
        radius=radius,
        fill="#113327",
        outline="#2dd4bf",
        width=3,
    )

    # 2. 顶部微光光弧
    draw.rounded_rectangle(
        [(pad + 4, pad + 4), (size - pad - 4, size - pad - 4)],
        radius=radius - 4,
        outline=(255, 255, 255, 45),
        width=1,
    )

    # 3. 绘制纯白 ES 字体
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

    # 4. 底部点缀高亮翡翠绿小呼吸灯
    draw.ellipse([(size // 2 - 7, size - 52), (size // 2 + 7, size - 38)], fill="#10b981")

    # 输出目标路径
    electron_build = Path("d:/vera-workbench/electron/build")
    electron_build.mkdir(parents=True, exist_ok=True)
    frontend_public = Path("d:/vera-workbench/frontend/public")
    frontend_public.mkdir(parents=True, exist_ok=True)
    art_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")

    img.save(electron_build / "icon.png")
    img.save(frontend_public / "favicon.png")
    img.save(art_dir / "es_eyecare_icon_v2.png")

    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(electron_build / "app.ico", format="ICO", sizes=ico_sizes)
    img.save(electron_build / "icon.ico", format="ICO", sizes=ico_sizes)
    img.save(frontend_public / "favicon.ico", format="ICO", sizes=ico_sizes)

    print("True eyecare green ES icons generated successfully!")


if __name__ == "__main__":
    generate_true_eyecare_icons()
