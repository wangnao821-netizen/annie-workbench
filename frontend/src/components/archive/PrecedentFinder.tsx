import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Search,
  Landmark,
  Calendar,
  Percent,
  MapPin,
  Sparkles,
  BookOpen,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { searchPrecedents } from '../../services/api/cases';
import { CasePrecedentItem } from '../../types/api';
import { KnowledgeCardModal } from './KnowledgeCardModal';

const LENDER_OPTIONS = [
  { label: '全部机构', value: 'all' },
  { label: 'ORDE', value: 'ORDE' },
  { label: 'CBA', value: 'CBA' },
  { label: 'Westpac', value: 'Westpac' },
  { label: 'Brighten', value: 'Brighten' },
  { label: 'Latrobe', value: 'Latrobe' },
];

const DOC_TYPE_OPTIONS = [
  { label: '全部类型', value: 'all' },
  { label: 'Alt Doc', value: 'Alt Doc' },
  { label: 'Full Doc', value: 'Full Doc' },
  { label: 'Lite Doc', value: 'Lite Doc' },
];

export function PrecedentFinder() {
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [selectedLender, setSelectedLender] = useState<string>('all');
  const [selectedDocType, setSelectedDocType] = useState<string>('all');
  const [keyword, setKeyword] = useState<string>('');
  const [precedents, setPrecedents] = useState<CasePrecedentItem[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchPrecedents({
        lender: selectedLender,
        doc_type: selectedDocType,
        keyword: keyword,
      });
      if (res.ok) {
        setPrecedents(res.precedents || []);
      }
    } catch (err) {
      console.error('Search precedents error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedLender, selectedDocType, keyword]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="space-y-5" id="precedent-finder-module">
      {/* 多维检索控制栏 */}
      <div
        className="p-4 rounded-2xl border space-y-3.5"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* 顶部搜索框 */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索先例关键词（如：自雇、低估价、海外、签证、Granville、PERSON_1）..."
            className="w-full pl-9.5 pr-4 py-2.5 rounded-xl border text-xs outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            id="precedent-search-input"
          />
        </div>

        {/* 筛选 Pill 列表 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* 机构与类型 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 机构选择器 */}
            <div className="flex items-center space-x-1">
              <span className="text-[11px] text-muted font-bold mr-1">机构:</span>
              {LENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedLender(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedLender === opt.value
                      ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-2xs'
                      : 'bg-[var(--bg-panel)] text-secondary hover:text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <span className="text-muted text-xs">|</span>

            {/* 方案类型 */}
            <div className="flex items-center space-x-1">
              <span className="text-[11px] text-muted font-bold mr-1">类型:</span>
              {DOC_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedDocType(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedDocType === opt.value
                      ? 'bg-[var(--purple-soft, rgba(168,85,247,0.2))] text-[var(--purple, #a855f7)] border border-[var(--purple, #a855f7)] font-bold'
                      : 'bg-[var(--bg-panel)] text-secondary hover:text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={fetchList}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>重置刷新</span>
          </motion.button>
        </div>
      </div>

      {/* 先例卡片网格流 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="p-4 rounded-2xl border animate-pulse space-y-2.5"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="h-4 bg-[var(--bg-subtle-strong)] rounded w-1/3" />
              <div className="h-3 bg-[var(--bg-subtle)] rounded w-2/3" />
              <div className="h-8 bg-[var(--bg-subtle)] rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : precedents.length === 0 ? (
        <div
          className="p-12 rounded-2xl border flex flex-col items-center justify-center text-center space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
            <BookOpen className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            未找到匹配的实战先例
          </p>
          <p className="text-xs text-muted max-w-sm">
            尝试放宽机构或类型筛选条件，或搜索更通用的关键词
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" id="precedents-card-grid">
          {precedents.map((item) => (
            <motion.div
              key={item.case_id}
              whileTap={reduced ? undefined : { scale: 0.99 }}
              onClick={() => setActiveCaseId(item.case_id)}
              className="p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer group space-y-3 relative hover:border-[var(--accent)] shadow-2xs"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
              id={`precedent-item-${item.case_id}`}
            >
              {/* 头部标题与金额 */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <h4
                      className="text-sm font-extrabold tracking-tight truncate group-hover:text-[var(--accent)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.client_name}
                    </h4>

                    {item.doc_type && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold font-mono bg-[var(--purple-soft, rgba(168,85,247,0.12))] text-[var(--purple, #a855f7)] border border-[var(--purple, #a855f7)]">
                        {item.doc_type}
                      </span>
                    )}

                    <span className="text-[10px] font-mono text-muted px-1.5 py-0.2 rounded bg-[var(--bg-subtle)]">
                      {item.case_id}
                    </span>
                  </div>

                  {item.property_address && (
                    <p
                      className="text-xs font-medium flex items-center space-x-1 truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <MapPin className="w-3 h-3 shrink-0 text-[var(--accent)]" />
                      <span className="truncate">{item.property_address}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-1 text-xs font-bold text-[var(--accent)] shrink-0">
                  <span className="hidden sm:inline">复盘知识卡</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </div>

              {/* 关键贷款事实 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-muted">
                <span className="flex items-center space-x-1 font-bold text-primary">
                  <Landmark className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{item.lender}</span>
                  <span>
                    $
                    {item.loan_amount
                      ? item.loan_amount >= 10000
                        ? `${(item.loan_amount / 10000).toFixed(0)}万`
                        : item.loan_amount.toLocaleString()
                      : '0'}
                  </span>
                </span>

                {item.interest_rate && (
                  <>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Percent className="w-3 h-3" />
                      <span>{item.interest_rate}</span>
                    </span>
                  </>
                )}

                {item.settlement_date && (
                  <>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>交割: {item.settlement_date}</span>
                    </span>
                  </>
                )}
              </div>

              {/* 亮点摘要胶囊 */}
              {item.summary_highlight && (
                <div
                  className="p-2.5 rounded-xl border text-xs flex items-start space-x-2 leading-relaxed"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--purple, #a855f7)] shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{item.summary_highlight}</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* 复盘知识卡弹窗 */}
      <KnowledgeCardModal caseId={activeCaseId} onClose={() => setActiveCaseId(null)} />
    </div>
  );
}
