"""生成与前端护眼绿完全一致的 ES 品牌图标 (app.ico, icon.ico, favicon.ico 等)。
底色：翡翠森林绿 (#1e5e41) 完全对齐前端 var(--accent)
边框：翡翠清亮外边框 (#34d399)
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

    # 1. 绘制与前端完全一致的翡翠绿底座 (#1e5e41)
    draw.rounded_rectangle(
        [(pad, pad), (size - pad, size - pad)],
        radius=radius,
        fill="#1e5e41",
        outline="#34d399",
        width=3,
    )

    # 2. 顶部微光光弧
    draw.rounded_rectangle(
        [(pad + 4, pad + 4), (size - pad - 4, size - pad - 4)],
        radius=radius - 4,
        outline=(255, 255, 255, 60),
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

    # 动态相对路径
    root = Path(__file__).resolve().parent.parent
    electron_build = root / "electron" / "build"
    electron_build.mkdir(parents=True, exist_ok=True)
    frontend_public = root / "frontend" / "public"
    frontend_public.mkdir(parents=True, exist_ok=True)

    img.save(electron_build / "icon.png")
    img.save(frontend_public / "favicon.png")

    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(electron_build / "app.ico", format="ICO", sizes=ico_sizes)
    img.save(electron_build / "icon.ico", format="ICO", sizes=ico_sizes)
    img.save(frontend_public / "favicon.ico", format="ICO", sizes=ico_sizes)

    print("True eyecare green ES icons matching #1e5e41 generated successfully!")


if __name__ == "__main__":
    generate_true_eyecare_icons()
