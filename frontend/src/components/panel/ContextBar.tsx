import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  ChevronDown, 
  ChevronUp, 
  Building2, 
  Brain, 
  ListTodo, 
  History,
  UserCheck,
  AlertOctagon,
} from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';
import { CaseFolderCard } from '../cases/CaseFolderCard';

interface ContextBarProps {
  onOpenDrawer?: (d: "checklist" | "timeline" | "brain") => void;
}

export function ContextBar({ onOpenDrawer }: ContextBarProps) {
  const reduced = useReducedMotion();
  const { currentCase, contextExpanded, toggleContext } = useCaseStore();

  if (!currentCase) return null;

  return (
    <div 
      className="border-b transition-all duration-200 select-none overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      id="context-bar-container"
    >
      {/* Active Blocker Alert Bar if exists */}
      {currentCase.activeBlocker && (
        <div 
          onClick={() => onOpenDrawer?.("timeline")}
          className="px-6 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center justify-between cursor-pointer hover:bg-red-500/15 transition-colors"
          id="context-bar-blocker-alert"
        >
          <div className="flex items-center space-x-2 truncate">
            <AlertOctagon className="w-3.5 h-3.5 text-red-500 flex-shrink-0 animate-pulse" />
            <span className="font-bold text-red-500">案件暂停/阻断中：</span>
            <span className="truncate text-red-300">{currentCase.activeBlocker}</span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 ml-2 flex-shrink-0">
            查看时序证据 →
          </span>
        </div>
      )}

      {/* L0 Header Bar (Single Row) */}
      <div 
        onClick={toggleContext}
        className="px-6 py-2.5 flex items-center justify-between cursor-pointer hover:opacity-95 transition-opacity"
        id="context-bar-l0"
      >
        <div className="flex items-center space-x-3 text-xs min-w-0 flex-1 flex-wrap gap-y-1">
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

          {currentCase.assessorName && (
            <span 
              className="px-2.5 py-0.5 rounded-full font-semibold border text-[11px] flex items-center space-x-1 flex-shrink-0 bg-[var(--purple-soft)] text-[var(--purple)] border-purple-500/20"
            >
              <UserCheck className="w-3 h-3" />
              <span>审批官: {currentCase.assessorName}</span>
            </span>
          )}

          {currentCase.lenderRef && (
            <span 
              className="px-2.5 py-0.5 rounded-full font-mono font-bold border text-[11px] flex items-center space-x-1 flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
              <span>案号: {currentCase.lenderRef}</span>
            </span>
          )}

          <span 
            className="px-2.5 py-0.5 rounded-full font-medium border text-[11px] flex-shrink-0"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            ${(currentCase.loanAmount / 10000).toFixed(0)}万
          </span>

          <span 
            className="px-2.5 py-0.5 rounded-full font-medium border text-[11px] flex-shrink-0"
            style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)', borderColor: 'rgba(234,179,8,0.2)' }}
          >
            {currentCase.stage}
          </span>

          <div className="flex-shrink-0">
            <CaseFolderCard
              caseId={currentCase.caseId}
              folderPath={currentCase.folderPath}
              folderMode={currentCase.folderMode}
              compact
            />
          </div>

          <span 
            className="truncate text-[11px] text-muted hidden md:inline ml-2"
          >
            {currentCase.summary}
          </span>
        </div>

        <div className="flex items-center space-x-4 text-xs flex-shrink-0 ml-4">
          <span className="font-medium" style={{ color: 'var(--orange)' }}>
            {currentCase.deadline}
          </span>
          <div 
            className="w-5 h-5 rounded-full flex items-center justify-center border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {contextExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>

      {/* L1 Detail Drawer (Expanded View) */}
      <AnimatePresence>
        {contextExpanded && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="px-6 pb-4 pt-1 border-t flex flex-col space-y-3 overflow-hidden text-xs"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-panel)' }}
            id="context-bar-l1"
          >
            {/* Upper Stats Row */}
            <div className="grid grid-cols-4 gap-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-muted text-[11px] mb-0.5">申请人</div>
                <div className="font-semibold text-primary">{currentCase.clientName}</div>
              </div>
              <div>
                <div className="text-muted text-[11px] mb-0.5">贷款行 & 案号</div>
                <div className="font-semibold text-primary">
                  {currentCase.lender} {currentCase.lenderRef ? `· ${currentCase.lenderRef}` : ''} · ${(currentCase.loanAmount).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted text-[11px] mb-0.5">信贷审批官</div>
                <div className="font-semibold text-primary">
                  {currentCase.assessorName || '待指派/未提取'}
                </div>
              </div>
              <div>
                <div className="text-muted text-[11px] mb-0.5">关键截止日</div>
                <div className="font-semibold" style={{ color: 'var(--orange)' }}>{currentCase.deadline}</div>
              </div>
            </div>

            {/* Folder Integration Display */}
            <div className="py-1">
              <CaseFolderCard
                caseId={currentCase.caseId}
                folderPath={currentCase.folderPath}
                folderMode={currentCase.folderMode}
              />
            </div>

            {/* Context Summary & Quick Triggers */}
            <div className="flex items-center justify-between pt-1">
              <div className="text-secondary max-w-xl pr-4">
                <span className="font-semibold text-primary mr-1">案情摘要:</span>
                {currentCase.summary}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                <button 
                  onClick={() => onOpenDrawer?.("brain")}
                  className="px-2.5 py-1 rounded-lg border font-medium flex items-center space-x-1 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Brain className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
                  <span>客户全景</span>
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
                  <span>时间线与时序脉络</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
