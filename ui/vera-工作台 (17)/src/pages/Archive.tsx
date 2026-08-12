import { Archive as ArchiveIcon, FolderArchive } from 'lucide-react';

export function Archive() {
  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto no-scrollbar max-w-4xl mx-auto" style={{ backgroundColor: 'var(--bg-app)' }} id="page-archive">
      <div className="flex items-center space-x-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
          <ArchiveIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            档案库 (Archive)
          </h1>
          <p className="text-xs text-muted">
            档案库 — 已结算/已终止案件归档
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-12 border flex flex-col items-center justify-center text-center space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
          <FolderArchive className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>归档记录为空</p>
        <p className="text-xs text-muted font-mono">
          TODO(WO-03): 需要 /api/cases?status=archived
        </p>
      </div>
    </div>
  );
}
