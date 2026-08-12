import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Archive as ArchiveIcon, FolderArchive, RefreshCw, AlertCircle, Landmark, CheckCircle2, Calendar, FileText } from 'lucide-react';
import { listArchivedCases } from '../services/api/cases';
import { ArchivedCase } from '../types/api';

const MOCK_ARCHIVED_CASES: ArchivedCase[] = [
  {
    case_id: 'CASE_ARCH_01',
    client_name: 'PERSON_1',
    lender: 'CBA',
    loan_amount: 850000,
    stage: '交割完成',
    checklist_done: 12,
    checklist_total: 12,
    progress_pct: 100,
    stage_days: 0,
    last_activity: '2026-05-10T10:00:00Z',
    closed_at: '2026-05-10',
    close_reason: '已无条件批复并完成 Final Settlement 交割',
  },
  {
    case_id: 'CASE_ARCH_02',
    client_name: 'PERSON_2',
    lender: 'ANZ Bank',
    loan_amount: 620000,
    stage: '案件终止',
    checklist_done: 5,
    checklist_total: 10,
    progress_pct: 50,
    stage_days: 0,
    last_activity: '2026-04-18T14:30:00Z',
    closed_at: '2026-04-18',
    close_reason: '客户因个人原因撤回申请或改买现房',
  },
];

export function Archive() {
  const [cases, setCases] = useState<ArchivedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setCases(MOCK_ARCHIVED_CASES);
      setLoading(false);
      return;
    }
    try {
      const res = await listArchivedCases(100);
      setCases(res || []);
    } catch (err: any) {
      setError(err?.message || '获取归档列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  return (
    <div
      className="flex-1 p-4 md:p-8 space-y-5 overflow-y-auto no-scrollbar max-w-5xl mx-auto w-full"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="archive-page"
    >
      {/* 头部标题 */}
      <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
            <ArchiveIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              档案库 (Archive)
            </h1>
            <p className="text-xs text-muted">
              查阅与归档已完成交割或退案终止的历史案件
            </p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={fetchArchived}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </motion.button>
      </div>

      {/* 错误提示条 */}
      {error && (
        <div className="p-3.5 rounded-2xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchArchived} className="underline font-bold cursor-pointer">
            重试
          </button>
        </div>
      )}

      {/* 三态渲染 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="p-4 rounded-2xl border animate-pulse space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/3" />
              <div className="h-3 bg-black/5 dark:bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-2xl p-12 border flex flex-col items-center justify-center text-center space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
            <FolderArchive className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>归档记录为空</p>
          <p className="text-xs text-muted max-w-sm">
            当案件完成交割或关闭后，将自动沉淀至档案库
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <motion.div
              key={c.case_id}
              id={`archive-item-${c.case_id}`}
              whileTap={{ scale: 0.99 }}
              className="p-4 rounded-2xl border space-y-2.5 transition-colors hover:border-[var(--accent)]"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-start justify-between min-w-0">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {c.client_name}
                    </h3>
                    <span className="text-xs font-mono text-muted px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10">
                      {c.case_id}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs font-mono text-muted mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Landmark className="w-3 h-3" />
                      <span>{c.lender}</span>
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-primary">
                      ${c.loan_amount ? (c.loan_amount >= 10000 ? `${(c.loan_amount / 10000).toFixed(0)}万` : c.loan_amount.toLocaleString()) : '0'}
                    </span>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-600 border border-slate-500/20">
                  {c.stage}
                </span>
              </div>

              {c.close_reason && (
                <div className="text-xs text-muted bg-black/5 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5 flex items-start space-x-1.5">
                  <FileText className="w-3.5 h-3.5 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>归档说明：{c.close_reason}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-mono text-muted pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>清单全套: {c.checklist_done}/{c.checklist_total} ({c.progress_pct}%)</span>
                </span>
                {c.closed_at && (
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>归档时间: {c.closed_at}</span>
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
