import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { History, FileSpreadsheet, RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock, FileText, Mail } from 'lucide-react';
import { listImports } from '../services/api/imports';
import { ImportRecord } from '../types/api';

const MOCK_IMPORTS: ImportRecord[] = [
  {
    id: 1,
    source: 'vba',
    status: 'done',
    file_count: 14,
    message_count: 32,
    started_at: '2026-08-10 14:00',
    finished_at: '2026-08-10 14:02',
    note: '全量同步贷款经纪 VBA 数据库及 32 封历年关联邮件',
  },
  {
    id: 2,
    source: 'libratom',
    status: 'done',
    file_count: 8,
    message_count: 120,
    started_at: '2026-08-09 09:30',
    finished_at: '2026-08-09 09:35',
    note: '批量解析 PST/MBOX 邮件历史与附件归档文档',
  },
];

export function ImportHistory() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImports = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setImports(MOCK_IMPORTS);
      setLoading(false);
      return;
    }
    try {
      const res = await listImports({ limit: 50 });
      setImports(res || []);
    } catch (err: any) {
      setError(err?.message || '获取导入历史失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  const renderSourceBadge = (source: string) => {
    switch (source.toLowerCase()) {
      case 'vba':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">VBA 数据库</span>;
      case 'libratom':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">Libratom PST</span>;
      case 'manual':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">手动导入</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">{source}</span>;
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'done') {
      return (
        <span className="flex items-center space-x-1 text-emerald-600 text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>已完成</span>
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="flex items-center space-x-1 text-rose-600 text-xs font-bold">
          <XCircle className="w-3.5 h-3.5" />
          <span>失败</span>
        </span>
      );
    }
    return (
      <span className="flex items-center space-x-1 text-amber-600 text-xs font-bold">
        <Clock className="w-3.5 h-3.5 animate-spin" />
        <span>处理中</span>
      </span>
    );
  };

  return (
    <div
      className="flex-1 p-4 md:p-8 space-y-5 overflow-y-auto no-scrollbar max-w-5xl mx-auto w-full"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="import-history-page"
    >
      {/* 标题 */}
      <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              导入历史 (Import History)
            </h1>
            <p className="text-xs text-muted">
              追溯全量邮件 PST/MBOX、旧版 VBA 数据库及手动导入批次日志
            </p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={fetchImports}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </motion.button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="p-3.5 rounded-2xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchImports} className="underline font-bold cursor-pointer">
            重试
          </button>
        </div>
      )}

      {/* 三态 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="p-4 rounded-2xl border animate-pulse space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/3" />
              <div className="h-3 bg-black/5 dark:bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : imports.length === 0 ? (
        <div className="rounded-2xl p-12 border flex flex-col items-center justify-center text-center space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-500">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>暂无导入记录</p>
          <p className="text-xs text-muted max-w-sm">
            执行外部数据导入或 PST 格式沉淀后将在此显示明细
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {imports.map((item) => (
            <motion.div
              key={item.id}
              id={`import-item-${item.id}`}
              whileTap={{ scale: 0.99 }}
              className="p-4 rounded-2xl border space-y-2.5 transition-colors hover:border-[var(--accent)]"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {renderSourceBadge(item.source)}
                  <span className="text-xs font-mono text-muted">批次 #{item.id}</span>
                </div>
                {renderStatusBadge(item.status)}
              </div>

              {item.note && (
                <p className="text-xs text-muted leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.note}
                </p>
              )}

              <div className="flex items-center justify-between text-[11px] font-mono text-muted pt-2 border-t flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-3">
                  <span className="flex items-center space-x-1">
                    <FileText className="w-3 h-3 text-blue-500" />
                    <span>文件: {item.file_count}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Mail className="w-3 h-3 text-purple-500" />
                    <span>邮件: {item.message_count}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{item.finished_at || item.started_at || '刚刚'}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
