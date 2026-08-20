import { useState, useEffect } from 'react';
import { Folder, CheckCircle2, AlertTriangle, Copy, FolderPlus, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import { pickExistingFolder } from '../../services/folderPicker';

interface CaseFolderCardProps {
  caseId: string;
  folderPath?: string | null;
  folderMode?: string | null;
  compact?: boolean;
}

export function CaseFolderCard({
  caseId,
  folderPath: initialFolderPath,
  folderMode: initialFolderMode,
  compact = false,
}: CaseFolderCardProps) {
  const reduced = useReducedMotion();
  const [folderPath, setFolderPath] = useState<string | null>(initialFolderPath ?? null);
  const [folderMode, setFolderMode] = useState<string | null>(initialFolderMode ?? null);
  const [isOpening, setIsOpening] = useState(false);

  const { currentCase, setCurrentCase } = useCaseStore();
  const showToast = useToastStore((s) => s.showToast);

  // Sync prop changes
  useEffect(() => {
    if (initialFolderPath !== undefined) {
      setFolderPath(initialFolderPath ?? null);
    }
  }, [initialFolderPath]);

  const handleCopyPath = () => {
    if (!folderPath) return;
    navigator.clipboard.writeText(folderPath);
    showToast('success', '文件夹路径已复制到剪贴板');
  };

  const handleOpenFolderPicker = async () => {
    setIsOpening(true);
    try {
      const res = await pickExistingFolder({
        caseId,
        clientName: currentCase?.clientName,
        title: `关联案件文件夹 (${caseId})`,
        initialPath: folderPath || undefined,
      });

      if (res && res.path) {
        setFolderPath(res.path);
        const resolvedMode = res.mode || 'existing';
        setFolderMode(resolvedMode);

        if (currentCase && currentCase.caseId === caseId) {
          setCurrentCase({
            ...currentCase,
            folderPath: res.path,
            folderMode: resolvedMode,
          });
        }
      }
    } finally {
      setIsOpening(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2 text-xs" id="case-folder-card-compact">
        {folderPath ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-[var(--green-soft)] border border-[var(--green-soft)] text-[var(--green)]">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold text-[11px]">已关联</span>
            <code className="font-mono text-[11px] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded truncate max-w-[180px]" title={folderPath}>
              {folderPath}
            </code>
            <button
              type="button"
              onClick={handleCopyPath}
              className="p-0.5 hover:bg-[var(--bg-subtle-strong)] rounded cursor-pointer"
              title="复制路径"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleOpenFolderPicker}
              className="text-xs font-bold underline ml-1 hover:opacity-80 cursor-pointer"
            >
              更改
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-xl bg-[var(--yellow-soft)] border border-[var(--yellow-soft)] text-[var(--yellow)]">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold text-[11px]">未关联文件夹</span>
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.95 }}
              type="button"
              onClick={handleOpenFolderPicker}
              disabled={isOpening}
              className="px-2 py-0.5 rounded text-xs font-extrabold bg-[var(--yellow)] text-white hover:opacity-90 cursor-pointer shadow-xs flex items-center space-x-1"
            >
              {isOpening ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FolderPlus className="w-3 h-3" />}
              <span>关联文件夹</span>
            </motion.button>
          </div>
        )}
      </div>
    );
  }

  // Full Card layout for Overview Facts
  return (
    <div
      className="p-3.5 rounded-2xl border space-y-2"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="overview-folder-card"
    >
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
          <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>案件文件夹关联</span>
        </span>
        {folderPath ? (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>已关联 ✅</span>
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)] flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>未关联 ⚠️</span>
          </span>
        )}
      </div>

      {folderPath ? (
        <div className="space-y-1.5 pt-0.5">
          <div className="p-2 rounded-xl bg-[var(--bg-app)] border text-xs flex items-center justify-between font-mono" style={{ borderColor: 'var(--border)' }}>
            <span className="truncate text-primary text-[11px]" title={folderPath}>{folderPath}</span>
            <button
              type="button"
              onClick={handleCopyPath}
              className="p-1 rounded hover:bg-[var(--bg-subtle-strong)] text-muted cursor-pointer flex-shrink-0"
              title="复制路径"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>模式: {folderMode === 'existing' ? '关联已有文件夹' : '在父目录下新建'}</span>
            <button
              type="button"
              onClick={handleOpenFolderPicker}
              className="font-bold underline text-[var(--accent)] hover:opacity-80 cursor-pointer"
            >
              重新关联文件夹
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pt-0.5">
          <p className="text-[11px] text-muted">
            支持选择已有客户文件夹（可共享资料）或在选定父目录下新建。
          </p>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            type="button"
            onClick={handleOpenFolderPicker}
            disabled={isOpening}
            className="w-full py-1.5 rounded-xl text-xs font-extrabold bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90 cursor-pointer shadow-xs flex items-center justify-center space-x-1"
          >
            {isOpening ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
            <span>关联文件夹（选已有 / 父目录新建）</span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
