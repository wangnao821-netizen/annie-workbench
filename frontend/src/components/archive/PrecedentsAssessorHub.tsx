import { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, UserCheck } from 'lucide-react';
import { PrecedentFinder } from './PrecedentFinder';
import { AssessorRadar } from './AssessorRadar';

export function PrecedentsAssessorHub() {
  const [subTab, setSubTab] = useState<'precedents' | 'assessors'>('precedents');

  return (
    <div className="space-y-5" id="precedents-assessor-hub">
      {/* 子 Tab 切换栏 */}
      <div
        className="inline-flex items-center p-1 rounded-2xl border gap-1"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
        id="precedents-subtab-switch"
      >
        <button
          type="button"
          onClick={() => setSubTab('precedents')}
          className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
            subTab === 'precedents'
              ? 'text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          id="subtab-precedents-btn"
        >
          {subTab === 'precedents' && (
            <motion.div
              layoutId="precedents-active-subtab-indicator"
              className="absolute inset-0 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            />
          )}
          <BookOpen className="w-4 h-4 z-10 text-[var(--accent)]" />
          <span className="z-10">实战先例检索器 (Precedent Finder)</span>
          <span className="z-10 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--purple-soft, rgba(168,85,247,0.15))] text-[var(--purple, #a855f7)]">
            ★ 推荐
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('assessors')}
          className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
            subTab === 'assessors'
              ? 'text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          id="subtab-assessors-btn"
        >
          {subTab === 'assessors' && (
            <motion.div
              layoutId="precedents-active-subtab-indicator"
              className="absolute inset-0 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-card)',
                boxShadow: 'var(--shadow-card)',
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            />
          )}
          <UserCheck className="w-4 h-4 z-10 text-[var(--accent)]" />
          <span className="z-10">审批官画像库 (Assessor Radar)</span>
        </button>
      </div>

      {/* 子模块视图 */}
      {subTab === 'precedents' ? <PrecedentFinder /> : <AssessorRadar />}
    </div>
  );
}
