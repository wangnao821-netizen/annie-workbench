import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileText, Inbox, RefreshCw, AlertCircle, CheckCircle2, Send, Clock, User, Hash, ChevronRight } from 'lucide-react';
import { listDrafts } from '../services/api/drafts';
import { DraftListItem } from '../types/api';
import { DraftDetailModal } from '../components/panel/DraftDetailModal';

const MOCK_DRAFTS: DraftListItem[] = [
  { id: 1, action_id: 101, case_id: 'CASE_001', client_name: 'PERSON_1', subject: '关于补充 2025 NOA 及银行 3 个月月结单的说明邮件', status: 'draft', version: 2, updated_at: '10 分钟前' },
  { id: 2, action_id: 102, case_id: 'CASE_002', client_name: 'PERSON_2', subject: '转案评估报告及 CBA 利率优惠确认函 ($100,000 预审核)', status: 'confirmed', version: 1, updated_at: '2 小时前' },
  { id: 3, action_id: 103, case_id: 'CASE_003', client_name: 'PERSON_3', subject: '预审完成跟进与护照身份证明复核确认通知', status: 'sent', version: 1, updated_at: '昨天 16:20' },
];

type FilterStatus = 'all' | 'draft' | 'confirmed' | 'sent';

export function DraftsBox() {
  const reduced = useReducedMotion();
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setDrafts(MOCK_DRAFTS);
      setLoading(false);
      return;
    }
    try {
      const res = await listDrafts({ limit: 50 });
      setDrafts(res || []);
    } catch (err: any) {
      setError(err?.message || '获取草稿列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const filteredDrafts = drafts.filter((item) => filter === 'all' || item.status === filter);

  const renderStatusBadge = (status: string) => {
    if (status === 'draft') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)] flex items-center space-x-1"><FileText className="w-3 h-3" /><span>草稿</span></span>;
    if (status === 'confirmed') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] flex items-center space-x-1"><CheckCircle2 className="w-3 h-3" /><span>已确认</span></span>;
    if (status === 'sent') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--accent)] flex items-center space-x-1"><Send className="w-3 h-3" /><span>已发送</span></span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600">{status}</span>;
  };

  return (
    <div className="flex-1 p-4 md:p-8 space-y-5 overflow-y-auto no-scrollbar max-w-5xl mx-auto w-full" style={{ backgroundColor: 'var(--bg-app)' }} id="drafts-page">
      {/* 头部标题 */}
      <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>草稿箱 (Drafts Box)</h1>
            <p className="text-xs text-muted">管理与追溯由 AI 自动生成或协同编写的所有邮件草稿</p>
          </div>
        </div>
        <motion.button whileTap={reduced ? undefined : { scale: 0.97 }} onClick={fetchDrafts} disabled={loading} className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </motion.button>
      </div>

      {/* 筛选 Tab */}
      <div className="flex items-center space-x-2 border-b pb-2 text-xs" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'all', label: `全部 (${drafts.length})` },
          { key: 'draft', label: `草稿 (${drafts.filter((d) => d.status === 'draft').length})` },
          { key: 'confirmed', label: `已确认 (${drafts.filter((d) => d.status === 'confirmed').length})` },
          { key: 'sent', label: `已发送 (${drafts.filter((d) => d.status === 'sent').length})` },
        ].map((tab) => (
          <button key={tab.key} type="button" onClick={() => setFilter(tab.key as FilterStatus)} className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer font-medium ${filter === tab.key ? 'bg-[var(--purple-soft)] text-[var(--purple)] font-bold' : 'text-muted hover:text-primary'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 错误提示条 */}
      {error && (
        <div className="p-3.5 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>
          <button type="button" onClick={fetchDrafts} className="underline font-bold cursor-pointer">重试</button>
        </div>
      )}

      {/* 骨架屏 / 空状态 / 列表 */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-4 rounded-2xl border animate-pulse space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="h-4 bg-[var(--bg-subtle-strong)] rounded w-2/3" />
              <div className="h-3 bg-[var(--bg-subtle)] rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="rounded-2xl p-12 border flex flex-col items-center justify-center text-center space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--purple-soft)] text-[var(--purple)]"><Inbox className="w-6 h-6" /></div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>草稿箱为空</p>
          <p className="text-xs text-muted max-w-sm">AI 生成草稿或经人工编辑确认后会出现在这里</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredDrafts.map((draft) => (
            <motion.div
              key={draft.id}
              id={`draft-item-${draft.id}`}
              whileTap={reduced ? undefined : { scale: 0.99 }}
              onClick={() => setSelectedDraftId(draft.id)}
              className="p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all hover:border-[var(--accent)] hover:shadow-sm cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  {renderStatusBadge(draft.status)}
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-muted">v{draft.version}</span>
                  <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{draft.subject}</h3>
                </div>
                <div className="flex items-center space-x-3 text-xs text-muted font-mono flex-wrap gap-y-1">
                  {draft.client_name && <span className="flex items-center space-x-1"><User className="w-3 h-3 text-[var(--purple)]" /><span>{draft.client_name}</span></span>}
                  {draft.case_id && <span className="flex items-center space-x-1"><Hash className="w-3 h-3 text-[var(--accent)]" /><span>{draft.case_id}</span></span>}
                </div>
              </div>
              <div className="flex items-center space-x-3 text-[11px] font-mono text-muted flex-shrink-0 self-end md:self-center">
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{draft.updated_at ? new Date(draft.updated_at).toLocaleDateString('zh-CN') : '刚刚'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted opacity-60" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* 草稿详情 Modal */}
      <DraftDetailModal
        draftId={selectedDraftId}
        isOpen={Boolean(selectedDraftId)}
        onClose={() => setSelectedDraftId(null)}
      />
    </div>
  );
}
