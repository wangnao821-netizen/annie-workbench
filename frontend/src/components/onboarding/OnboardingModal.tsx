import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Calculator,
  FileCheck,
  FileText,
  Landmark,
  ShieldCheck,
  Check,
  ArrowRight,
  ChevronLeft,
  X,
  User,
  Clock,
  Mail,
  Zap,
  BookOpen,
  FolderArchive,
  Lightbulb,
} from 'lucide-react';

interface OnboardingModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

interface SlideItem {
  tag: string;
  badgeBg: string;
  badgeBorder: string;
  title: string;
  subtitle: string;
  quote?: string;
  icon: typeof Sparkles;
  accentColor: string;
  content: {
    type: 'points' | 'tools';
    items: Array<{
      title: string;
      desc: string;
      icon: typeof Sparkles;
      tag?: string;
    }>;
  };
}

const SLIDES: SlideItem[] = [
  {
    tag: '01 · 核心哲学 · Core Philosophy',
    badgeBg: 'var(--accent-soft, rgba(30, 94, 65, 0.1))',
    badgeBorder: 'var(--accent, #1e5e41)',
    title: '贷款案件记忆与决策大脑',
    subtitle: '专为贷款经纪人打造的私人智能决策参谋',
    quote: '“她说，它记、它答、它建议、她拍板。”',
    icon: Sparkles,
    accentColor: 'var(--accent, #1e5e41)',
    content: {
      type: 'points',
      items: [
        {
          title: '零数据源强依赖 · 零信任成本',
          desc: '客户信息 100% 通过日常自然对话与内置流程主动梳理补齐，绝不静默抓取外部数据。',
          icon: User,
        },
        {
          title: '全局上下文深度注入',
          desc: '告别 AI 盲猜。AI 深度掌握客户全景与办件历史，给出精准、贴切且切中要害的决策建议。',
          icon: Zap,
        },
        {
          title: '人机协作确认闭环',
          desc: 'AI 始终只出草稿与方案，每一次关键记录与对外沟通由您亲自确认，掌控全局。',
          icon: Check,
        },
      ],
    },
  },
  {
    tag: '02 · 智能建档 · Smart Intake',
    badgeBg: 'var(--accent-soft, rgba(30, 94, 65, 0.1))',
    badgeBorder: 'var(--accent, #1e5e41)',
    title: '一句话建档与客户资产全景',
    subtitle: '摆脱繁琐录入，自然沉淀多维案卷图谱',
    icon: User,
    accentColor: 'var(--accent, #1e5e41)',
    content: {
      type: 'points',
      items: [
        {
          title: '一句话自然语言解析',
          desc: '直接粘贴客户发来的零散微信或邮件文本，秒级提取姓名、目标银行、贷款额、房价与 LVR。',
          icon: FileText,
        },
        {
          title: '多房产与家庭资产全图谱',
          desc: '多套房产、现有抵押贷款、家庭负债与关联人结构清晰呈现，案卷全貌一屏掌握。',
          icon: Landmark,
        },
        {
          title: '三层时序记忆底座',
          desc: '事件账本（L1）+ 案件全景（L2）+ 过件经验（L3），让 AI 越用越懂您的办件逻辑。',
          icon: Clock,
        },
      ],
    },
  },
  {
    tag: '03 · 核心工具 · Core Tools',
    badgeBg: 'var(--accent-soft, rgba(30, 94, 65, 0.1))',
    badgeBorder: 'var(--accent, #1e5e41)',
    title: '全流程智能辅助工具箱',
    subtitle: '覆盖算力、清单、政策与邮件时序的全套原子能力',
    icon: Calculator,
    accentColor: 'var(--accent, #1e5e41)',
    content: {
      type: 'tools',
      items: [
        {
          title: '服务能力与贷款计算器',
          desc: '内置主流银行计算规则模型，精准测算借贷上限、还款压力与承债能力。',
          icon: Calculator,
          tag: 'Servicing Calc',
        },
        {
          title: '银行标准材料清单',
          desc: '建档即对齐 15+ 银行标准，缺口自动透视，一键生成中英双语催件清单。',
          icon: FileCheck,
          tag: 'Smart Checklist',
        },
        {
          title: '政策库智能查询',
          desc: '实时检索各大银行政策、LVR 限制与差异化准入规则，秒出选行建议。',
          icon: Landmark,
          tag: 'Policy Search',
        },
        {
          title: '文件智能识别提取',
          desc: 'PDF/图片/流水单据智能 OCR 提取，离线本地解析，自动回填案卷数据。',
          icon: FileText,
          tag: 'OCR & Parse',
        },
        {
          title: '邮件进度与时序同步',
          desc: '真实邮件时序引擎，自动解析银行批复与时间节点，完整回溯办件历程。',
          icon: Mail,
          tag: 'Timeline Sync',
        },
        {
          title: '重要节点与到期日程',
          desc: '自动追踪 Finance Clause 与 Settlement 关键到期日，预防逾期卡点。',
          icon: Clock,
          tag: 'Schedule',
        },
      ],
    },
  },
  {
    tag: '04 · 档案与知识中心 · Knowledge & Precedents',
    badgeBg: 'var(--accent-soft, rgba(30, 94, 65, 0.1))',
    badgeBorder: 'var(--accent, #1e5e41)',
    title: '档案与知识中心 · 经验沉淀与复用',
    subtitle: '打通存量案卷经验，越办件越聪明的私域知识大脑',
    icon: BookOpen,
    accentColor: 'var(--accent, #1e5e41)',
    content: {
      type: 'points',
      items: [
        {
          title: '客户经验沉淀与二次经营',
          desc: '自动沉淀完结案卷画像、客户偏好与恒定材料（如护照/地契），二次转贷一键无缝继承。',
          icon: FolderArchive,
        },
        {
          title: '银行批复偏好与过件先例',
          desc: '自动关联各大银行 Assessor 审核偏好、常见补件倾向与过件判例，新案自动推荐最佳对策。',
          icon: Lightbulb,
        },
        {
          title: '申报平台经验与避坑指南',
          desc: '沉淀 ApplyOnline / 银行网关专有系统的录单技巧、材料归纳与避坑先例，大幅减少返工。',
          icon: Landmark,
        },
      ],
    },
  },
  {
    tag: '05 · 隐私与安全 · Privacy & Safety',
    badgeBg: 'var(--accent-soft, rgba(30, 94, 65, 0.1))',
    badgeBorder: 'var(--accent, #1e5e41)',
    title: '100% 本地物理隔离 · 绝对隐私安全',
    subtitle: '数据不出设备，本地自主掌控的纯粹体验',
    icon: ShieldCheck,
    accentColor: 'var(--accent, #1e5e41)',
    content: {
      type: 'points',
      items: [
        {
          title: '纯本地物理存储',
          desc: '客户数据库与所有原始资料 100% 存放在您的电脑本地磁盘，绝不回传第三方云服务器。',
          icon: ShieldCheck,
        },
        {
          title: '离线引擎与断网可用',
          desc: '内置独立离线运行环境与本地 OCR 字库，断网或无网络环境下依然稳健工作。',
          icon: Zap,
        },
        {
          title: '每日自动安全快照备份',
          desc: '后台每日无锁热备份，自动滚动保留 7 天历史快照，软件升级换代零数据丢失风险。',
          icon: FileCheck,
        },
      ],
    },
  },
];

const STORAGE_KEY = 'annie_onboarding_seen_v2_2_1';

export function OnboardingModal({ forceOpen, onClose }: OnboardingModalProps) {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setCurrentIndex(0);
      return;
    }

    try {
      const hasSeen = localStorage.getItem(STORAGE_KEY);
      if (!hasSeen) {
        const timer = setTimeout(() => {
          setOpen(true);
        }, 300);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, [forceOpen]);

  const handleClose = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    if (onClose) onClose();
  }, [onClose]);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  useEffect(() => {
    if (!open && !forceOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, forceOpen, currentIndex, handleClose]);

  if (!open && !forceOpen) return null;

  const currentSlide = SLIDES[currentIndex];
  const IconComponent = currentSlide.icon;
  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        {/* 背景轻柔毛玻璃遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-md transition-all duration-300"
        />

        {/* 主卡片：通透温润的 Apple 极简护眼绿设计 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {/* 顶部微弱翡翠绿光弧 */}
          <div
            className="absolute top-0 left-0 right-0 h-32 pointer-events-none transition-all duration-500 ease-out z-0 opacity-20"
            style={{
              background: 'radial-gradient(ellipse at 50% -20%, var(--accent) 0%, transparent 70%)',
            }}
          />

          {/* 顶部工具栏：分类徽标 + 关闭按钮 */}
          <div 
            className="relative z-10 flex items-center justify-between px-7 pt-6 pb-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide border transition-all duration-300"
              style={{
                backgroundColor: 'var(--accent-soft, rgba(30, 94, 65, 0.08))',
                color: 'var(--accent, #1e5e41)',
                borderColor: 'var(--accent, #1e5e41)',
              }}
            >
              <IconComponent className="w-3.5 h-3.5" />
              <span>{currentSlide.tag}</span>
            </div>

            <button
              onClick={handleClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer text-muted hover:text-primary"
              title="关闭导览 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 动态内容滑动区域 */}
          <div className="relative z-10 px-7 py-5 flex-1 overflow-y-auto min-h-[380px] flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className="space-y-4.5"
              >
                {/* 标题区 */}
                <div className="space-y-1.5">
                  <h2 
                    className="text-2xl sm:text-[26px] font-black tracking-tight leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {currentSlide.title}
                  </h2>
                  <p 
                    className="text-sm sm:text-base leading-relaxed font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {currentSlide.subtitle}
                  </p>
                  {currentSlide.quote && (
                    <div 
                      className="mt-2.5 px-4 py-2 rounded-2xl border text-xs sm:text-sm font-semibold italic"
                      style={{
                        backgroundColor: 'var(--accent-soft, rgba(30, 94, 65, 0.06))',
                        borderColor: 'var(--border)',
                        color: 'var(--accent, #1e5e41)',
                      }}
                    >
                      {currentSlide.quote}
                    </div>
                  )}
                </div>

                {/* 动态内容：列表型 vs 工具矩阵型 */}
                {currentSlide.content.type === 'points' ? (
                  <div className="space-y-2.5 pt-1">
                    {currentSlide.content.items.map((item, idx) => {
                      const ItemIcon = item.icon;
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border transition-all duration-200 flex items-start space-x-3.5 hover:shadow-xs"
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            borderColor: 'var(--border)',
                          }}
                        >
                          <div
                            className="p-2 rounded-xl flex-shrink-0 mt-0.5"
                            style={{
                              backgroundColor: 'var(--accent-soft, rgba(30, 94, 65, 0.12))',
                              color: 'var(--accent, #1e5e41)',
                            }}
                          >
                            <ItemIcon className="w-4 h-4" />
                          </div>
                          <div className="space-y-0.5">
                            <h4 
                              className="text-sm font-bold tracking-wide"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {item.title}
                            </h4>
                            <p 
                              className="text-xs leading-relaxed"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {item.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 核心工具 6 宫格矩阵 */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {currentSlide.content.items.map((tool, idx) => {
                      const ToolIcon = tool.icon;
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between"
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            borderColor: 'var(--border)',
                          }}
                        >
                          <div className="flex items-center justify-between pb-1">
                            <div className="flex items-center space-x-2">
                              <div
                                className="p-1.5 rounded-lg"
                                style={{
                                  backgroundColor: 'var(--accent-soft, rgba(30, 94, 65, 0.12))',
                                  color: 'var(--accent, #1e5e41)',
                                }}
                              >
                                <ToolIcon className="w-3.5 h-3.5" />
                              </div>
                              <span 
                                className="text-xs font-bold"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {tool.title}
                              </span>
                            </div>
                            {tool.tag && (
                              <span 
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                                style={{
                                  backgroundColor: 'var(--bg-card)',
                                  borderColor: 'var(--border)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {tool.tag}
                              </span>
                            )}
                          </div>
                          <p 
                            className="text-[11px] leading-relaxed mt-1"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {tool.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 底部控制栏：胶囊指示器 + 翻页按钮 */}
          <div 
            className="relative z-10 flex items-center justify-between px-7 py-4 border-t"
            style={{ 
              backgroundColor: 'var(--bg-subtle)', 
              borderColor: 'var(--border)' 
            }}
          >
            {/* 胶囊分页指示器 */}
            <div className="flex items-center space-x-1.5">
              {SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    currentIndex === idx
                      ? 'w-6 shadow-xs'
                      : 'w-1.5 opacity-30 hover:opacity-70'
                  }`}
                  style={{
                    backgroundColor: 'var(--accent, #1e5e41)',
                  }}
                  title={`第 ${idx + 1} 幕`}
                />
              ))}
            </div>

            {/* 左右翻页与进入操作 */}
            <div className="flex items-center space-x-2.5">
              {currentIndex > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </button>
              )}

              <button
                onClick={handleNext}
                className="px-5 py-2.5 rounded-2xl text-xs font-black transition-all duration-200 flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent, #1e5e41)',
                  color: 'var(--on-accent, #ffffff)',
                  boxShadow: '0 4px 16px -2px rgba(30, 94, 65, 0.35)',
                }}
              >
                <span>{isLast ? '✨ 开启 Annie' : '继续探索'}</span>
                {isLast ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
