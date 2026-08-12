import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronDown, 
  ChevronUp, 
  Building2, 
  Brain, 
  ListTodo, 
  History, 
  Settings2, 
  PauseCircle, 
  RefreshCw, 
  Undo2, 
  XCircle
} from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';

interface ContextBarProps {
  onOpenDrawer?: (d: "checklist" | "timeline" | "brain") => void;
}

export function ContextBar({ onOpenDrawer }: ContextBarProps) {
  const { currentCase, contextExpanded, toggleContext } = useCaseStore();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  if (!currentCase) return null;

  const openActionMenu = () => {
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 176 }); // w-44 = 176px，右对齐按钮
    }
    setShowActionMenu((v) => !v);
  };

  useEffect(() => {
    if (!showActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowActionMenu(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuBtnRef.current?.contains(target)) return;
      if ((document.getElementById('case-ops-dropdown') as HTMLElement | null)?.contains(target)) return;
      setShowActionMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [showActionMenu]);

  const handleAction = (actionName: string) => {
    setShowActionMenu(false);
    alert(`⚡ 案件操作指令: [${actionName}] 已发送至系统与 Vera 审计日志`);
  };

  return (
    <div 
      className="border-b transition-all duration-200 select-none overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      id="context-bar-container"
    >
      {/* L0 Header Bar (Single Row) */}
      <div 
        onClick={toggleContext}
        className="px-6 py-2.5 flex items-center justify-between cursor-pointer hover:opacity-95 transition-opacity"
        id="context-bar-l0"
      >
        <div className="flex items-center space-x-3 text-xs min-w-0 flex-1">
          <span className="font-bold text-sm tracking-tight flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
            {currentCase.clientName}
          </span>

          <span 
            className="px-2.5 py-0.5 rounded-full font-semibold border text-[11px] flex items-center space-x-1 flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'rgba(99,102,241,0.2)' }}
          >
            <Building2 className="w-3 h-3" />
            <span>{currentCase.lender}</span>
          </span>

          <span 
            className="px-2.5 py-0.5 rounded-full font-semibold text-[11px] flex-shrink-0 border"
            style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)', borderColor: 'rgba(16,185,129,0.2)' }}
          >
            {currentCase.stage}
          </span>

          <span className="text-[11px] truncate hidden md:inline ml-2" style={{ color: 'var(--text-secondary)' }}>
            {currentCase.summary}
          </span>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            {contextExpanded ? '收起完整上下文' : '展开 4 格事实'}
          </span>
          {contextExpanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </div>

      {/* L1 Expanded Facts & Operations Area */}
      <AnimatePresence>
        {contextExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="px-6 pb-4 pt-1 border-t space-y-3"
            style={{ borderColor: 'var(--border)' }}
            id="context-bar-l1"
          >
            {/* 4 Fact Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Card 1: Loan Amount */}
              <div 
                className="p-2.5 rounded-xl border space-y-1 shadow-2xs"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <span className="text-[10px] font-medium block" style={{ color: 'var(--text-muted)' }}>
                  贷款需求额
                </span>
                <span className="font-mono font-bold text-sm block" style={{ color: 'var(--text-primary)' }}>
                  ${(currentCase.loanAmount / 1000).toLocaleString()}万 AUD
                </span>
              </div>

              {/* Card 2: LVR */}
              <div 
                className="p-2.5 rounded-xl border space-y-1 shadow-2xs"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <span className="text-[10px] font-medium block" style={{ color: 'var(--text-muted)' }}>
                  估值 LVR
                </span>
                <span className="font-mono font-bold text-sm block" style={{ color: 'var(--yellow)' }}>
                  {currentCase.lvr}% (符合标准)
                </span>
              </div>

              {/* Card 3: Checklist Progress */}
              <div 
                className="p-2.5 rounded-xl border space-y-1 shadow-2xs"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex justify-between items-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>材料清单进度</span>
                  <span className="font-mono font-bold">{currentCase.checklistDone}/{currentCase.checklistTotal}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full rounded-full transition-all duration-300" 
                    style={{ width: `${currentCase.checklistProgress}%`, backgroundColor: 'var(--accent)' }}
                  />
                </div>
              </div>

              {/* Card 4: Finance Due */}
              <div 
                className="p-2.5 rounded-xl border space-y-1 shadow-2xs"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <span className="text-[10px] font-medium block" style={{ color: 'var(--text-muted)' }}>
                  Finance Due 截止
                </span>
                <span className="font-mono font-bold text-sm block" style={{ color: 'var(--red)' }}>
                  {currentCase.deadline}
                </span>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => onOpenDrawer?.("brain")}
                  className="px-2.5 py-1 rounded-lg border font-medium flex items-center space-x-1 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Brain className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
                  <span>AI 大脑洞察</span>
                </button>

                <button 
                  onClick={() => onOpenDrawer?.("checklist")}
                  className="px-2.5 py-1 rounded-lg border font-medium flex items-center space-x-1 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <ListTodo className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>核心清单 ({currentCase.checklistDone}/{currentCase.checklistTotal})</span>
                </button>

                <button 
                  onClick={() => onOpenDrawer?.("timeline")}
                  className="px-2.5 py-1 rounded-lg border font-medium flex items-center space-x-1 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <History className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                  <span>时间线日志</span>
                </button>
              </div>

              {/* Case Operation Dropdown Menu */}
              <div className="relative">
                <button
                  ref={menuBtnRef}
                  onClick={openActionMenu}
                  className="px-3 py-1 rounded-lg border font-semibold flex items-center space-x-1 cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  id="case-ops-menu-btn"
                >
                  <Settings2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>案件操作</span>
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>
              </div>

              {showActionMenu && menuPos && createPortal(
                <div
                  className="fixed w-44 rounded-xl border shadow-lg py-1 z-[100] text-xs"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', top: menuPos.top, left: menuPos.left }}
                  id="case-ops-dropdown"
                >
                    <button
                      onClick={() => handleAction("⏸ 暂停案件")}
                      className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <PauseCircle className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
                      <span>⏸ 暂停案件</span>
                    </button>

                    <button
                      onClick={() => handleAction("🔄 换银行重递")}
                      className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                      <span>🔄 换银行重递</span>
                    </button>

                    <button
                      onClick={() => handleAction("↩️ 客户撤回")}
                      className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Undo2 className="w-3.5 h-3.5" style={{ color: 'var(--orange)' }} />
                      <span>↩️ 客户撤回</span>
                    </button>

                    <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />

                    <button
                      onClick={() => handleAction("❌ 终止案件")}
                      className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--red)' }}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>❌ 终止案件</span>
                    </button>
                </div>,
                document.body,
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
