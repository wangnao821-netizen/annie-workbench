; ==============================================================================
; Vera 工作台 NSIS 深度定制安装脚本 (installer.nsh)
; 包含深色品牌侧边栏海报、欢迎页产品亮点与完成页自动启动
; ==============================================================================

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "欢迎使用 Annie 2.2.0"
  !define MUI_WELCOMEPAGE_TEXT "Annie（小安）是专为贷款经纪人打造的案件记忆与决策大脑。$\r$\n$\r$\n✨ 本次 2.2.0 版本核心亮点：$\r$\n  • 一句话智能建档与客户多维资产全景$\r$\n  • 贷款能力计算器与 15+ 银行标准清单$\r$\n  • 档案与知识中心，沉淀银行与平台过件先例$\r$\n  • 100% 纯本地物理隔离与每日自动热备$\r$\n$\r$\n点击“下一步”继续安装并体验 Apple 极简开箱导览。"
  
  !define MUI_FINISHPAGE_TITLE "🎉 Annie 安装成功！"
  !define MUI_FINISHPAGE_TEXT "Annie 2.2.0 已就绪。$\r$\n$\r$\n即将为您开启 5 幕沉浸式产品亮点交互导览。"
  !define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  !define MUI_FINISHPAGE_RUN_TEXT "立即运行 Annie"
!macroend

!macro customPage
  !insertmacro MUI_PAGE_WELCOME
!macroend
