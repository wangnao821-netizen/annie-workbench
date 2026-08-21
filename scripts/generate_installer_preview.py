from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def generate_mockup():
    sidebar_path = Path("d:/vera-workbench/electron/build/installerSidebar.bmp")
    if not sidebar_path.exists():
        print("Sidebar bmp not found")
        return

    sidebar = Image.open(sidebar_path)
    
    # 模拟真实 NSIS Modern UI 窗口尺寸：500 x 385
    win_w, win_h = 500, 385
    installer_img = Image.new("RGB", (win_w, win_h), "#ffffff")
    
    # 粘贴左侧海报 (164 x 314)
    installer_img.paste(sidebar, (0, 0))
    # 补充左侧底部空白为深色
    draw = ImageDraw.Draw(installer_img)
    draw.rectangle([(0, 314), (164, win_h)], fill="#0e1117")

    # 尝试加载字体
    font_title = ImageFont.load_default()
    font_text = ImageFont.load_default()
    font_btn = ImageFont.load_default()
    for fp in ["C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/simhei.ttf"]:
        if Path(fp).exists():
            try:
                font_title = ImageFont.truetype(fp, 13)
                font_text = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 9)
                font_btn = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 9)
                break
            except Exception:
                pass

    # 右侧区域绘制
    draw.text((180, 25), "欢迎使用 Vera 工作台 2.2.0 安装向导", fill="#0f172a", font=font_title)

    desc_lines = [
        "Vera 是专为贷款经纪人打造的案件记忆与决策大脑。",
        "",
        "✨ 本次 2.2.0 版本核心亮点：",
        "  • 一句话智能建档与客户多维资产全景",
        "  • 贷款能力计算器与 15+ 银行标准清单",
        "  • 档案与知识中心，沉淀银行与平台过件先例",
        "  • 100% 纯本地物理隔离与每日自动安全热备",
        "",
        "在继续安装之前，建议关闭其他应用程序。",
        "",
        "点击“下一步”继续安装并开启 Apple 极简体验。",
    ]
    
    y = 58
    for line in desc_lines:
        if line.startswith("✨"):
            draw.text((180, y), line, fill="#2563eb", font=font_text)
        elif line.strip().startswith("•"):
            draw.text((180, y), line, fill="#0f172a", font=font_text)
        else:
            draw.text((180, y), line, fill="#64748b", font=font_text)
        y += 18

    # 底部分割线
    draw.line([(0, 340), (win_w, 340)], fill="#e2e8f0", width=1)

    # 绘制按钮
    def draw_btn(x, y, text, primary=False):
        bw, bh = 78, 24
        fill = "#2563eb" if primary else "#f8fafc"
        txt_fill = "#ffffff" if primary else "#334155"
        border_color = "#1d4ed8" if primary else "#cbd5e1"
        draw.rounded_rectangle([(x, y), (x+bw, y+bh)], radius=4, fill=fill, outline=border_color, width=1)
        draw.text((x + bw//2, y + bh//2), text, fill=txt_fill, font=font_btn, anchor="mm")

    draw_btn(225, 349, "< 上一步(B)")
    draw_btn(315, 349, "下一步(N) >", primary=True)
    draw_btn(405, 349, "取消(C)")

    out_dir = Path("C:/Users/Yaruo/.gemini/antigravity-ide/brain/bc170625-e858-48c2-8b2c-577cbcea4f88")
    out_dir.mkdir(parents=True, exist_ok=True)
    installer_img.save(out_dir / "installer_preview.png")
    sidebar.save(out_dir / "sidebar_poster.png")
    print("Mockup saved to artifacts successfully")

if __name__ == "__main__":
    generate_mockup()
