import React from 'react';
import { FileText, Archive, DownloadCloud, Database, ArrowLeft } from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';

export const DraftsView: React.FC = () => {
  const { setCurrentView } = useWorkbenchStore((s) => ({ setCurrentView: s.setCurrentView }));
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center space-x-3 pb-2 border-b border-[var(--border)]">
        <button onClick={() => setCurrentView('home')} className="p-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileText className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold text-[var(--text-primary)]">草稿箱 (Drafts & Templates)</h1>
      </div>
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2 text-xs">
        <p className="font-semibold text-[var(--text-primary)]">当前包含 2 份未发送跟进草稿：</p>
        <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
          <p className="font-bold text-[var(--accent)]">草稿 1: 给 PERSON_1 的 CBA HECS 补件催请短信</p>
          <p className="text-[var(--text-secondary)]">“您好，CBA 审理员需要您提供 HECS 结清证明文件以便在 24 小时内批复...”</p>
        </div>
      </div>
    </div>
  );
};

export const ArchiveView: React.FC = () => {
  const { setCurrentView } = useWorkbenchStore((s) => ({ setCurrentView: s.setCurrentView }));
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center space-x-3 pb-2 border-b border-[var(--border)]">
        <button onClick={() => setCurrentView('home')} className="p-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Archive className="w-5 h-5 text-blue-500" />
        <h1 className="text-lg font-bold text-[var(--text-primary)]">结案档案库 (Archive)</h1>
      </div>
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-muted)] text-center py-8">
        已将 2025 年度所有顺利 Settlement 放款案件归档存盘，可随时搜索回溯。
      </div>
    </div>
  );
};

export const ImportHistoryView: React.FC = () => {
  const { setCurrentView } = useWorkbenchStore((s) => ({ setCurrentView: s.setCurrentView }));
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center space-x-3 pb-2 border-b border-[var(--border)]">
        <button onClick={() => setCurrentView('home')} className="p-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <DownloadCloud className="w-5 h-5 text-purple-500" />
        <h1 className="text-lg font-bold text-[var(--text-primary)]">银行文件导入历史 (Import History)</h1>
      </div>
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-secondary)] space-y-2">
        <p>• 2026-08-11 10:15: 导入 CBA_Valuation_Report_PERSON_1.pdf (解析成功)</p>
        <p>• 2026-08-08 15:30: 导入 NAB_Signed_Contract.pdf (自动关联案例 CASE-004)</p>
      </div>
    </div>
  );
};

export const MigrationView: React.FC = () => {
  const { setCurrentView } = useWorkbenchStore((s) => ({ setCurrentView: s.setCurrentView }));
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center space-x-3 pb-2 border-b border-[var(--border)]">
        <button onClick={() => setCurrentView('home')} className="p-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Database className="w-5 h-5 text-emerald-500" />
        <h1 className="text-lg font-bold text-[var(--text-primary)]">数据迁移与备份 (Migration)</h1>
      </div>
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text-secondary)] space-y-2">
        <p className="font-semibold text-[var(--text-primary)]">加密备份与导出中心：</p>
        <p>一键导出当前 14 笔活跃案件 JSON/CSV 压缩包，全站脱敏合规。</p>
      </div>
    </div>
  );
};
