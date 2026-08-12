import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles, User, ChevronDown, Check, BrainCircuit } from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';

interface MemoryItem {
  id: string;
  type: 'ai' | 'vera';
  title: string;
  content: string;
  timestamp: string;
}

const MOCK_MEMORIES: Record<string, MemoryItem[]> = {
  default: [
    {
      id: 'm-1',
      type: 'ai',
      title: 'NOA 与 Payslip 自动比对记忆',
      content: '已匹配 PERSON_1 2025-2026 财年 NOA 与 Payslip 差异 $80，符合银行 $100 容错区间，无需补充雇主说明信。',
      timestamp: '2026-08-08 14:30',
    },
    {
      id: 'm-2',
      type: 'vera',
      title: '客户期望与 Timing 特别交代',
      content: '客户注重买房 Timing，要求在 Finance Due 之前 3 天完成全部条件解下，请跟进 NAB BDM 优先处理。',
      timestamp: '2026-08-07 10:15',
    },
    {
      id: 'm-3',
      type: 'ai',
      title: '海外汇款流水与 Gift Letter 匹配',
      content: '已检测到上传的解扣款转账凭证 $50,000，付款人为海外父母账户，系统已跟进附带标准 Gift Letter。',
      timestamp: '2026-08-06 16:20',
    },
  ],
};

export function CaseMemoryTab() {
  const reduced = useReducedMotion();
  const { cases, currentCase } = useCaseStore();
  const [selectedCaseId, setSelectedCaseId] = useState<string>(currentCase?.caseId || cases[0]?.caseId || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCase = cases.find((c) => c.caseId === selectedCaseId) || currentCase || cases[0];
  const memories = MOCK_MEMORIES[selectedCaseId] || MOCK_MEMORIES.default;

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  return (
    <div className="space-y-4" id="case-memory-tab">
      {/* Selector bar */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2.5">
          <BrainCircuit className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>当前查看案件：</span>
        </div>

        <div className="relative" ref={dropdownRef}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="case-memory-select"
          >
            <span>{selectedCase ? `${selectedCase.clientName} (${selectedCase.lender})` : '请选择案件'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted" />
          </motion.button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 4 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="absolute right-0 top-full z-30 w-64 p-1.5 rounded-2xl border shadow-xl flex flex-col space-y-1"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-overlay)' }}
              >
                {cases.map((c) => (
                  <motion.button
                    key={c.caseId}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setSelectedCaseId(c.caseId);
                      setDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                      selectedCaseId === c.caseId ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
                    }`}
                  >
                    <span>{c.clientName} - {c.lender}</span>
                    {selectedCaseId === c.caseId && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[11px] font-mono text-muted">
        TODO(WO-03/后端): 需要 GET /api/cases/&#123;id&#125;/brain 记忆列表端点
      </p>

      {/* Memory items */}
      <div className="space-y-3">
        {memories.map((m) => {
          const isAi = m.type === 'ai';
          return (
            <motion.div
              key={m.id}
              whileHover={{ y: -1 }}
              className="p-4 rounded-2xl border space-y-2 transition-transform duration-100"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`p-1.5 rounded-lg text-xs font-bold flex items-center ${isAi ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'}`}>
                    {isAi ? <Sparkles className="w-3.5 h-3.5 mr-1" /> : <User className="w-3.5 h-3.5 mr-1" />}
                    {isAi ? 'AI 自动提取' : 'Vera 手动记录'}
                  </span>
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</h4>
                </div>
                <span className="text-[10px] font-mono text-muted">{m.timestamp}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{m.content}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
