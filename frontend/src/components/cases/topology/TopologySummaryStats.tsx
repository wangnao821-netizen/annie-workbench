import { motion, useReducedMotion } from 'motion/react';
import {
  Layers,
  FileCheck,
  UserCheck,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Users,
} from 'lucide-react';
import { TopologyScanSummary } from '../../../types/api';

export type ClientFilterCategory = 'all' | 'multi_case' | 'single_case' | 'lead';

interface TopologySummaryStatsProps {
  summary: TopologyScanSummary;
  activeCategory: ClientFilterCategory;
  onSelectCategory: (cat: ClientFilterCategory) => void;
  searchKeyword: string;
  onSearchChange: (keyword: string) => void;
  isAllExpanded: boolean;
  onToggleExpandAll: () => void;
}

export function TopologySummaryStats({
  summary,
  activeCategory,
  onSelectCategory,
  searchKeyword,
  onSearchChange,
  isAllExpanded,
  onToggleExpandAll,
}: TopologySummaryStatsProps) {
  const reduced = useReducedMotion();

  const filterTabs: Array<{
    key: ClientFilterCategory;
    label: string;
    icon: any;
    count: number;
    tip?: string;
  }> = [
    {
      key: 'all',
      label: '全部客户',
      icon: Users,
      count: summary.total_clients,
    },
    {
      key: 'multi_case',
      label: '多案卷客户',
      icon: Layers,
      count: summary.multi_case_clients,
      tip: '包含多个历史再融资/新购案卷',
    },
    {
      key: 'single_case',
      label: '标准单案卷',
      icon: FileCheck,
      count: summary.single_case_clients,
      tip: '单笔清晰贷款案卷',
    },
    {
      key: 'lead',
      label: '咨询潜客',
      icon: UserCheck,
      count: summary.lead_clients,
      tip: '潜客默认不建为主案',
    },
  ];

  return (
    <div
      className="p-4 rounded-2xl border space-y-3 shadow-2xs"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border)',
      }}
      id="topology-summary-stats-panel"
    >
      {/* 顶部统计卡片与推荐主案提示 */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div
            className="p-2 rounded-xl"
            style={{
              backgroundColor: 'var(--purple-soft)',
              color: 'var(--purple)',
            }}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                客户根目录拓扑识别完成
              </h3>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold border"
                style={{
                  backgroundColor: 'var(--green-soft)',
                  borderColor: 'rgba(5, 150, 105, 0.3)',
                  color: 'var(--green)',
                }}
              >
                ✓ 两层树状拓扑
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              共扫描出 <strong>{summary.total_clients}</strong> 位客户 · <strong>{summary.total_cases}</strong> 个案卷（其中 <strong>{summary.recommended_active_cases}</strong> 个推荐在途主案）
            </p>
          </div>
        </div>

        {/* 一键全部展开/折叠 */}
        <button
          type="button"
          onClick={onToggleExpandAll}
          className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          {isAllExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>全部折叠</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>全部展开</span>
            </>
          )}
        </button>
      </div>

      {/* 快捷形态分流 Filter Pills + 搜索输入框 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5">
        {/* 分类切换 Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeCategory === tab.key;
            return (
              <motion.button
                key={tab.key}
                whileTap={reduced ? undefined : { scale: 0.96 }}
                type="button"
                onClick={() => onSelectCategory(tab.key)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-all border relative"
                style={{
                  backgroundColor: isActive ? 'var(--purple-soft)' : 'var(--bg-card)',
                  borderColor: isActive ? 'var(--purple)' : 'var(--border)',
                  color: isActive ? 'var(--purple)' : 'var(--text-secondary)',
                }}
                title={tab.tip}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span
                  className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-extrabold"
                  style={{
                    backgroundColor: isActive ? 'var(--purple)' : 'var(--bg-input)',
                    color: isActive ? 'var(--on-purple)' : 'var(--text-muted)',
                  }}
                >
                  {tab.count}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* 搜索框 */}
        <div className="relative min-w-[200px] sm:w-64">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索客户 / 推荐人 / 物业 / Lender..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    </div>
  );
}
