import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Bot, X, Send, Sparkles } from 'lucide-react';
import { FloatingAIMessages, AIMessage } from './FloatingAIMessages';
import { sendChat } from '../../services/api/chat';
import { useToastStore } from '../../stores/toastStore';

export function FloatingAI() {
  const reduced = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('vera-floating-ai-pos');
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.x === 'number' && typeof p.y === 'number') return p;
      }
    } catch { /* ignore */ }
    return { x: window.innerWidth - 52 - 24, y: window.innerHeight - 52 - 24 };
  });

  // ESC 键关闭面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    isDragging: boolean;
    currentPos: { x: number; y: number };
  }>({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
    isDragging: false,
    currentPos: pos,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
      isDragging: true,
      currentPos: pos,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.isDragging) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragRef.current.moved = true;
    }

    let newX = dragRef.current.origX + dx;
    let newY = dragRef.current.origY + dy;

    newX = Math.max(8, Math.min(window.innerWidth - 60, newX));
    newY = Math.max(8, Math.min(window.innerHeight - 60, newY));

    dragRef.current.currentPos = { x: newX, y: newY };
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.isDragging) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }

    const moved = dragRef.current.moved;
    dragRef.current.isDragging = false;
    setIsDragging(false);

    if (moved) {
      localStorage.setItem('vera-floating-ai-pos', JSON.stringify(dragRef.current.currentPos));
    } else {
      setIsOpen((prev) => !prev);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const currentInput = inputText.trim();
    const userMsg: AIMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: currentInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

    if (useMock) {
      setTimeout(() => {
        let botResponse = `收到关于「${currentInput}」的问询。已基于当前案件库与银行政策完成初步分析，可继续询问具体案件或补件状态。`;

        if (currentInput.includes("周报") || currentInput.includes("总结")) {
          botResponse = "📊 **Vera 贷款周报（智能生成预览）**\n- 本周案件新增、获批与结佣数据请以今日工作台统计为准\n- 需重点跟进案件已在首页待办中列出";
        } else if (currentInput.includes("分析") || currentInput.includes("数据")) {
          botResponse = "📈 案件批复周期与银行时效分析将在联调后接入真实数据，当前为演示回复。";
        }

        const botMsg: AIMessage = {
          id: `msg-bot-${Date.now()}`,
          sender: 'bot',
          text: botResponse,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, botMsg]);
      }, 500);
      return;
    }

    try {
      const res = await sendChat({ message: currentInput });
      const botMsg: AIMessage = {
        id: `msg-bot-${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        suggestedActions: res.suggested_actions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      useToastStore.getState().showToast('error', 'AI 对话响应失败，请重试');
    }
  };

  // 动态计算面板尺寸与视口位置，防止溢出屏幕
  const panelWidth = Math.min(380, window.innerWidth - 16);
  const panelHeight = Math.min(460, window.innerHeight - 80);

  let panelLeft = pos.x + 52 - panelWidth;
  panelLeft = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, panelLeft));

  let panelTop = pos.y >= panelHeight + 20 ? pos.y - panelHeight - 12 : pos.y + 52 + 12;
  panelTop = Math.max(8, Math.min(window.innerHeight - panelHeight - 8, panelTop));

  return (
    <>
      {/* 1. Popup Assistant Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
            style={{ 
              left: panelLeft,
              top: panelTop,
              width: panelWidth,
              height: panelHeight,
              backgroundColor: 'var(--bg-card)', 
              borderColor: 'var(--border)' 
            }}
            id="floating-ai-panel"
          >
            {/* Header */}
            <div 
              className="p-3.5 border-b flex items-center justify-between flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center space-x-2.5">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--purple))' }}
                >
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                    <span>🤖 全局 AI 助手</span>
                    <Sparkles className="w-3 h-3 text-[var(--yellow)]" />
                  </h3>
                  <p className="text-[11px] text-muted">跨案件问答 · 智能周报 · 业务数据分析</p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-primary transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)' }}
                id="floating-ai-close-btn"
                aria-label="关闭 AI 助手"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Body */}
            <FloatingAIMessages messages={messages} />

            {/* Footer Input */}
            <div className="p-3 border-t flex-shrink-0" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="问任何跨案件问题、生成周报或分析数据..."
                  className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none bg-transparent"
                  style={{ 
                    backgroundColor: 'var(--bg-card)', 
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)' 
                  }}
                  id="floating-ai-input"
                />

                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={handleSend}
                  className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer shadow-xs"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                  id="floating-ai-send-btn"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Floating Action Button */}
      <motion.button
        whileHover={reduced ? undefined : { scale: 1.08 }}
        whileTap={reduced ? undefined : { scale: 0.92 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="拖动可移动，点击打开/关闭"
        className="fixed z-50 w-13 h-13 rounded-full flex items-center justify-center text-white shadow-xl"
        style={{ 
          left: pos.x,
          top: pos.y,
          background: 'linear-gradient(135deg, var(--accent), var(--purple))',
          width: '52px',
          height: '52px',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        id="floating-ai-trigger-btn"
      >
        {isOpen ? <X className="w-6 h-6 stroke-[2.5]" /> : <Bot className="w-6 h-6 stroke-[2.5]" />}
        
        {/* Pulsing Dot */}
        {!isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-[var(--yellow)] animate-pulse" />
        )}
      </motion.button>
    </>
  );
}
