import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { BookOpen, BrainCircuit, Globe, Building2, Sparkles } from 'lucide-react';
import { CaseMemoryTab } from '../components/knowledge/CaseMemoryTab';
import { GlobalExperienceTab } from '../components/knowledge/GlobalExperienceTab';
import { IndustryKnowledgeTab } from '../components/knowledge/IndustryKnowledgeTab';

type KnowledgeTab = 'memory' | 'experience' | 'industry';

const TABS: { key: KnowledgeTab; label: string; desc: string; icon: React.ElementType }[] = [
  { key: 'memory', label: '案件记忆', desc: '第一层：案件事实', icon: BrainCircuit },
  { key: 'experience', label: '全局经验', desc: '第二层：跨案件沉淀', icon: Globe },
  { key: 'industry', label: '行业知识库', desc: '第三层：政策/平台/合规', icon: Building2 },
];

export function KnowledgeCenter() {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('memory');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-5" id="knowledge-center-page">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              知识中心 (Knowledge Base)
            </h1>
            <p className="text-xs text-muted">
              三层高净值信贷经验体系：案件事实 → 团队沉淀 → 行业参数规则
            </p>
          </div>
        </div>

        <span className="text-xs font-mono px-3 py-1.5 rounded-xl border flex items-center space-x-1.5 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>AI 实时检索全库</span>
        </span>
      </div>

      {/* Main 3-layer Tabs */}
      <div className="flex items-center space-x-3 border-b pb-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 cursor-pointer transition-colors ${
                isActive ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-secondary hover:text-primary hover:bg-[var(--bg-card-hover)]'
              }`}
              id={`knowledge-tab-${tab.key}`}
            >
              <Icon className="w-4 h-4" />
              <div className="flex flex-col items-start text-left">
                <span>{tab.label}</span>
                <span className="text-[10px] text-muted font-normal">{tab.desc}</span>
              </div>

              {isActive && !reduced && (
                <motion.span
                  layoutId="knowledge-tab-underline"
                  className="absolute -bottom-2 left-2 right-2 h-[2px] rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              {isActive && reduced && (
                <span className="absolute -bottom-2 left-2 right-2 h-[2px] rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pr-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
            className="h-full"
          >
            {activeTab === 'memory' && <CaseMemoryTab />}
            {activeTab === 'experience' && <GlobalExperienceTab />}
            {activeTab === 'industry' && <IndustryKnowledgeTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
