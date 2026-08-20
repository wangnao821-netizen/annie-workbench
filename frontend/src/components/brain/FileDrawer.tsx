import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  Folder,
  FileText,
  RefreshCw,
  Plus,
  Eye,
  Edit3,
  FolderInput,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Check,
  ShieldCheck,
  Loader2,
  FileCheck2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Info,
} from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import {
  FileItem,
  FilePreviewResponse,
  NamingSuggestResponse,
} from '../../types/api';
import {
  getCaseFolderFiles,
  getCaseFilePreview,
  previewRawFileUrl,
  renameCaseFile,
  moveCaseFile,
  importCaseFile,
  getNamingSuggest,
} from '../../services/api/fileOps';

interface FileDrawerProps {
  caseId?: string | null;
}

export function FileDrawer({ caseId: propCaseId }: FileDrawerProps) {
  const reduced = useReducedMotion();
  const isOpen = useUiStore((s) => s.fileDrawerOpen);
  const setOpen = useUiStore((s) => s.setFileDrawerOpen);
  const { currentCase } = useCaseStore();

  const activeCaseId = propCaseId || currentCase?.caseId || 'CASE_001';
  const clientName = currentCase?.clientName || '关联客户';

  // State
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Preview State
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<FileItem | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'raw' | 'parsed'>('raw');
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState<boolean>(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [showFullScreenPreview, setShowFullScreenPreview] = useState<boolean>(false);
  const [fullScreenZoom, setFullScreenZoom] = useState<number>(1);
  const [fullScreenRotation, setFullScreenRotation] = useState<number>(0);

  // Rename Modal State
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [newNameInput, setNewNameInput] = useState<string>('');
  const [namingSuggest, setNamingSuggest] = useState<NamingSuggestResponse | null>(null);
  const [suggestLoading, setSuggestLoading] = useState<boolean>(false);
  const [renameSubmitting, setRenameSubmitting] = useState<boolean>(false);

  // Move Modal State
  const [moveTarget, setMoveTarget] = useState<FileItem | null>(null);
  const [selectedMoveDir, setSelectedMoveDir] = useState<string>('');
  const [moveSubmitting, setMoveSubmitting] = useState<boolean>(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFileObj, setImportFileObj] = useState<File | null>(null);
  const [importTargetDir, setImportTargetDir] = useState<string>('');
  const [importSubmitting, setImportSubmitting] = useState<boolean>(false);

  // Available directory list for Move and Import modals
  const availableDirs = ['', '_Inbox', 'Send to Lender', 'Bank Statements', 'Identity & Income'];

  // Load directory contents
  const loadFiles = useCallback(async (pathStr: string) => {
    setLoading(true);
    try {
      const res = await getCaseFolderFiles(activeCaseId, pathStr);
      setCurrentPath(res.current_path || pathStr);
      setFiles(res.items || []);
    } catch (err: any) {
      useToastStore.getState().showToast('error', `加载文件夹失败: ${err?.detail || err?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [activeCaseId]);

  useEffect(() => {
    if (isOpen) {
      loadFiles(currentPath);
    }
  }, [isOpen, loadFiles, currentPath]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showFullScreenPreview) {
          setShowFullScreenPreview(false);
          return;
        }
        if (renameTarget) {
          setRenameTarget(null);
          return;
        }
        if (moveTarget) {
          setMoveTarget(null);
          return;
        }
        if (showImportModal) {
          setShowImportModal(false);
          return;
        }
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showFullScreenPreview, renameTarget, moveTarget, showImportModal, setOpen]);

  // Handle file preview
  const handleOpenPreview = async (file: FileItem) => {
    setSelectedFileForPreview(file);
    setPreviewLoading(true);
    setPreviewData(null);
    setRawLoading(true);
    setRawUrl(null);
    setRawError(null);
    setActivePreviewTab('raw');

    // 1. Fetch Parsed Content
    const fetchParsed = getCaseFilePreview(activeCaseId, file.rel_path)
      .then((data) => {
        setPreviewData(data);
      })
      .catch((err) => {
        console.warn('Parsed preview error:', err);
      })
      .finally(() => {
        setPreviewLoading(false);
      });

    // 2. Fetch Raw Stream / File URL
    const fetchRaw = previewRawFileUrl(activeCaseId, file.rel_path)
      .then((urlStr) => {
        if (urlStr.startsWith('UNSUPPORTED_FORMAT')) {
          setRawError('该格式暂不支持在线原文渲染');
          setActivePreviewTab('parsed');
        } else {
          setRawUrl(urlStr);
        }
      })
      .catch((err: any) => {
        setRawError(`文件原文未能成功加载 (${err?.message || '网络或接口异常'})`);
        setActivePreviewTab('parsed'); // Fallback to parsed tab automatically
      })
      .finally(() => {
        setRawLoading(false);
      });

    await Promise.allSettled([fetchParsed, fetchRaw]);
  };

  // Handle Rename Modal trigger
  const handleStartRename = (file: FileItem) => {
    setRenameTarget(file);
    setNewNameInput(file.name);
    setNamingSuggest(null);
  };

  // Fetch AI Naming Suggestion
  const handleFetchNamingSuggest = async () => {
    if (!renameTarget) return;
    setSuggestLoading(true);
    try {
      const res = await getNamingSuggest(activeCaseId, renameTarget.name);
      setNamingSuggest(res);
      if (res.suggested) {
        setNewNameInput(res.suggested);
        useToastStore.getState().showToast('success', '已生成并套用 AI 规范命名建议');
      }
    } catch (err: any) {
      useToastStore.getState().showToast('error', `无法获取命名建议: ${err?.detail || err?.message || '系统错误'}`);
    } finally {
      setSuggestLoading(false);
    }
  };

  // Submit Rename
  const handleConfirmRename = async () => {
    if (!renameTarget || !newNameInput.trim()) return;
    setRenameSubmitting(true);
    try {
      await renameCaseFile(activeCaseId, {
        source: renameTarget.rel_path,
        new_name: newNameInput.trim(),
      });
      useToastStore.getState().showToast('success', `重命名成功: ${newNameInput.trim()}`);
      setRenameTarget(null);
      loadFiles(currentPath);
    } catch (err: any) {
      useToastStore.getState().showToast('error', `重命名失败: ${err?.detail || err?.message || '操作被拒绝'}`);
    } finally {
      setRenameSubmitting(false);
    }
  };

  // Handle Move Modal trigger
  const handleStartMove = (file: FileItem) => {
    setMoveTarget(file);
    setSelectedMoveDir(currentPath);
  };

  // Submit Move
  const handleConfirmMove = async () => {
    if (!moveTarget) return;
    setMoveSubmitting(true);
    try {
      await moveCaseFile(activeCaseId, {
        source: moveTarget.rel_path,
        target_dir: selectedMoveDir,
      });
      useToastStore.getState().showToast('success', `已将文件移动至: ${selectedMoveDir || '根目录'}`);
      setMoveTarget(null);
      loadFiles(currentPath);
    } catch (err: any) {
      useToastStore.getState().showToast('error', `移动文件失败: ${err?.detail || err?.message || '操作被拒绝'}`);
    } finally {
      setMoveSubmitting(false);
    }
  };

  // Submit Import
  const handleConfirmImport = async () => {
    if (!importFileObj) {
      useToastStore.getState().showToast('info', '请先选择需要放入的文件');
      return;
    }
    setImportSubmitting(true);
    try {
      await importCaseFile(activeCaseId, importFileObj, importTargetDir);
      useToastStore.getState().showToast('success', '已复制到案件文件夹（原文件保留）');
      setShowImportModal(false);
      setImportFileObj(null);
      loadFiles(currentPath);
    } catch (err: any) {
      useToastStore.getState().showToast('error', err?.detail || err?.message || '导入文件失败');
    } finally {
      setImportSubmitting(false);
    }
  };

  // Helper formatting
  const formatSize = (bytes?: number) => {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Breadcrumbs navigation
  const pathParts = currentPath.split('/').filter(Boolean);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0  }}
        animate={{ opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0  }}
        className="absolute inset-0 bg-[var(--bg-subtle-strong)] dark:bg-[var(--bg-app)]/60 z-30 backdrop-blur-xs flex items-center justify-center p-4 select-none"
        onClick={() => setOpen(false)}
        id="file-drawer-backdrop"
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-[640px] max-w-[94%] h-[min(820px,92%)] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden relative"
          style={{ borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="file-drawer-panel"
        >
          {/* Top Header */}
          <div
            className="p-4 border-b flex items-center justify-between flex-shrink-0 glass-panel"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
              <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex-shrink-0">
                <Folder className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    案件文件夹：{clientName}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                    {activeCaseId}
                  </span>
                </div>

                {/* Breadcrumbs */}
                <div className="flex items-center space-x-1 text-xs text-muted mt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCurrentPath('')}
                    className={`hover:text-primary transition-colors cursor-pointer ${
                      currentPath === '' ? 'font-bold text-primary' : ''
                    }`}
                    id="breadcrumb-root-btn"
                  >
                    根目录
                  </button>
                  {pathParts.map((part, idx) => {
                    const subPath = pathParts.slice(0, idx + 1).join('/');
                    const isLast = idx === pathParts.length - 1;
                    return (
                      <div key={idx} className="flex items-center space-x-1">
                        <ChevronRight className="w-3 h-3 text-muted" />
                        <button
                          type="button"
                          onClick={() => setCurrentPath(subPath)}
                          className={`hover:text-primary transition-colors cursor-pointer ${
                            isLast ? 'font-bold text-primary' : ''
                          }`}
                          id={`breadcrumb-part-${idx}`}
                        >
                          {part}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => loadFiles(currentPath)}
                className="p-1.5 rounded-xl border text-muted hover:text-primary cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                title="刷新目录"
                id="file-drawer-refresh-btn"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  setShowImportModal(true);
                  setImportTargetDir(currentPath);
                  setImportFileObj(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--on-accent)] shadow-xs flex items-center space-x-1 cursor-pointer transition-opacity bg-[var(--accent)] hover:bg-[var(--accent)]"
                id="file-drawer-import-btn"
              >
                <Plus className="w-4 h-4" />
                <span>放入文件</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl border text-muted hover:text-primary cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="file-drawer-close-btn"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" id="file-drawer-body">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted text-xs space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                <span>正在读取文件夹数据...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted border border-dashed rounded-2xl p-6" style={{ borderColor: 'var(--border)' }}>
                <Folder className="w-8 h-8 mx-auto text-muted/40 mb-2" />
                <p>当前目录下无任何文件或子文件夹</p>
                <p className="text-[11px] mt-1 text-muted/70">点击右上角「放入文件」添加材料到此案件目录</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Subdirectories First */}
                {files
                  .filter((f) => f.is_dir)
                  .map((dirItem, idx) => (
                    <motion.div
                      key={`dir-${idx}`}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setCurrentPath(dirItem.rel_path)}
                      className="p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors hover:bg-[var(--accent-soft)] group"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                      id={`dir-item-${idx}`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <Folder className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                        <span className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                          {dirItem.name}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted group-hover:text-[var(--accent)] transition-colors" />
                    </motion.div>
                  ))}

                {/* File Items */}
                {files
                  .filter((f) => !f.is_dir)
                  .map((fileItem, idx) => (
                    <div
                      key={`file-${idx}`}
                      className="p-3 rounded-xl border space-y-2 transition-all hover:border-[var(--accent-soft)]"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                      id={`file-item-${idx}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                              {fileItem.name}
                            </h4>
                            <div className="flex items-center space-x-2 text-[11px] text-muted mt-0.5">
                              <span>{formatSize(fileItem.size)}</span>
                              <span>•</span>
                              <span>{fileItem.mtime || '最近更新'}</span>
                              {fileItem.doc_type && (
                                <span className="px-1.5 py-0.2 rounded font-mono font-bold bg-[var(--bg-subtle)] text-secondary">
                                  {fileItem.doc_type}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* File Action Buttons */}
                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(fileItem)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer flex items-center space-x-1 transition-colors"
                            id={`btn-preview-${idx}`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>预览</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartRename(fileItem)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border border-[var(--purple-soft)] bg-[var(--purple-soft)] text-[var(--purple)] hover:bg-[var(--purple-soft)] cursor-pointer flex items-center space-x-1 transition-colors"
                            id={`btn-rename-${idx}`}
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>改名</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartMove(fileItem)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border border-[var(--yellow-soft)] bg-[var(--yellow-soft)] text-[var(--yellow)] hover:bg-[var(--yellow-soft)] cursor-pointer flex items-center space-x-1 transition-colors"
                            id={`btn-move-${idx}`}
                          >
                            <FolderInput className="w-3 h-3" />
                            <span>移动</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* In-line Dual-Tab Preview Panel */}
            <AnimatePresence>
              {selectedFileForPreview && (
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
                  className="p-4 rounded-2xl border bg-[var(--accent-soft)] border-[var(--accent-soft)] space-y-3 mt-4"
                  id="file-preview-panel"
                >
                  {/* Top Bar with Title and Close */}
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--accent-soft)]">
                    <div className="flex items-center space-x-2 truncate">
                      <FileCheck2 className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                      <h4 className="text-xs font-extrabold text-[var(--accent)] dark:text-[var(--accent)] truncate">
                        文件预览: {selectedFileForPreview.name}
                      </h4>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* 全屏预览按钮 */}
                      <button
                        type="button"
                        onClick={() => {
                          setFullScreenZoom(1);
                          setFullScreenRotation(0);
                          setShowFullScreenPreview(true);
                        }}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold border border-[var(--accent)]/30 bg-[var(--bg-card)] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                        title="打开全屏大悬浮窗预览"
                        id="btn-fullscreen-preview"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>⛶ 全屏预览</span>
                      </button>

                      {/* Dual Tabs (原文 / 解析内容) */}
                      <div className="flex items-center space-x-1 border rounded-lg p-0.5 bg-[var(--bg-subtle)]" style={{ borderColor: 'var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab('raw')}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                            activePreviewTab === 'raw'
                              ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                              : 'text-muted hover:text-primary'
                          }`}
                          id="tab-preview-raw-btn"
                        >
                          原文
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab('parsed')}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                            activePreviewTab === 'parsed'
                              ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                              : 'text-muted hover:text-primary'
                          }`}
                          id="tab-preview-parsed-btn"
                        >
                          解析内容
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedFileForPreview(null)}
                        className="p-1 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                        id="close-preview-panel-btn"
                        aria-label="关闭内嵌预览"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Tab 1: 原文 Preview */}
                  {activePreviewTab === 'raw' && (
                    <div className="space-y-2">
                      {rawLoading ? (
                        <div className="py-8 flex items-center justify-center space-x-2 text-xs text-muted">
                          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                          <span>正在加载底层原生文件...</span>
                        </div>
                      ) : rawError ? (
                        <div className="p-3 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)] text-xs space-y-2">
                          <div className="flex items-center space-x-1.5 font-bold text-[var(--yellow)] dark:text-[var(--yellow)]">
                            <AlertTriangle className="w-4 h-4" />
                            <span>原生文件未能直接展示</span>
                          </div>
                          <p className="text-[11px] leading-relaxed opacity-90">{rawError}</p>
                          <button
                            type="button"
                            onClick={() => setActivePreviewTab('parsed')}
                            className="px-3 py-1 rounded-lg text-[11px] font-bold bg-[var(--yellow)] text-white cursor-pointer hover:opacity-90"
                          >
                            查看解析文本内容
                          </button>
                        </div>
                      ) : rawUrl ? (
                        <div className="rounded-xl border overflow-hidden bg-[var(--bg-subtle-strong)] min-h-[220px] max-h-[420px] flex items-center justify-center" style={{ borderColor: 'var(--border)' }}>
                          {selectedFileForPreview.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img src={rawUrl} className="max-h-[380px] object-contain rounded-lg p-2" alt="原生图片" />
                          ) : (
                            <iframe
                              src={rawUrl}
                              className="w-full h-[380px] border-0 bg-white dark:bg-slate-900"
                              title="原生文件预览"
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Tab 2: 解析内容 Preview */}
                  {activePreviewTab === 'parsed' && (
                    <div>
                      {previewLoading ? (
                        <div className="py-6 flex items-center justify-center space-x-2 text-xs text-muted">
                          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                          <span>正在深度解析文本内容...</span>
                        </div>
                      ) : previewData?.parse_error ? (
                        <div className="p-3 rounded-xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs space-y-1">
                          <div className="flex items-center space-x-1.5 font-bold text-[var(--red)]">
                            <AlertTriangle className="w-4 h-4" />
                            <span>文件解析受阻 (parse_error)</span>
                          </div>
                          <p className="text-[11px] leading-relaxed opacity-90">{previewData.parse_error}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="p-3 rounded-xl border bg-[var(--bg-subtle)] text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto select-text" style={{ borderColor: 'var(--border)' }}>
                            {previewData?.text_preview || '文本提炼完成，暂无更多明细内容'}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                            <span>相对路径: {previewData?.rel_path}</span>
                            <span>类型标记: {previewData?.doc_type || 'standard'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Safety Notice */}
          <div
            className="p-3.5 border-t glass-panel flex items-center justify-center space-x-1.5 text-[11px] text-muted flex-shrink-0"
            style={{ borderColor: 'var(--border)' }}
            id="file-drawer-footer-notice"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--green)] flex-shrink-0" />
            <span>操作只作用于当前案件文件夹；目标已存在将拒绝；不会覆盖任何文件。</span>
          </div>

          {/* -------------------- Rename Modal -------------------- */}
          <AnimatePresence>
            {renameTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 glass-panel"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center space-x-2">
                      <Edit3 className="w-4 h-4 text-[var(--purple)]" />
                      <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>文件重命名确认</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRenameTarget(null)}
                      className="p-1 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                      id="close-rename-modal-btn"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-muted block mb-1">当前旧文件名：</span>
                      <p className="font-mono p-2 rounded-xl border bg-[var(--bg-subtle)] truncate" style={{ borderColor: 'var(--border)' }}>
                        {renameTarget.name}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted">新文件名：</span>
                        <button
                          type="button"
                          onClick={handleFetchNamingSuggest}
                          disabled={suggestLoading}
                          className="text-[11px] font-bold text-[var(--purple)] hover:underline cursor-pointer flex items-center space-x-1"
                          id="btn-ai-naming-suggest"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{suggestLoading ? '智能推演中...' : 'AI 规范命名建议'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={newNameInput}
                        onChange={(e) => setNewNameInput(e.target.value)}
                        className="w-full p-2.5 rounded-xl border font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                        style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        placeholder="请输入新文件名"
                        id="rename-input-field"
                      />
                    </div>

                    {/* AI Suggestion Panel */}
                    {namingSuggest && (
                      <div className="p-3 rounded-xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--purple)] text-[11px]">
                            推演建议规范：{namingSuggest.doc_type}
                          </span>
                          <span className="text-[11px] text-[var(--purple)] font-mono">
                            {namingSuggest.suggested}
                          </span>
                        </div>
                        <ul className="space-y-1 text-[11px] text-[var(--purple)] dark:text-[var(--purple)] list-disc list-inside">
                          {namingSuggest.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setRenameTarget(null)}
                      className="px-3.5 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--border)' }}
                      id="cancel-rename-btn"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRename}
                      disabled={renameSubmitting || !newNameInput.trim()}
                      className="px-4 py-1.5 rounded-xl bg-[var(--purple)] hover:bg-[var(--purple)] text-[var(--on-purple)] font-bold text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-md disabled:opacity-50"
                      id="confirm-rename-btn"
                    >
                      {renameSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>确认修改</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* -------------------- Move Modal -------------------- */}
          <AnimatePresence>
            {moveTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 glass-panel"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center space-x-2">
                      <FolderInput className="w-4 h-4 text-[var(--yellow)]" />
                      <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>移动文件到子目录</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMoveTarget(null)}
                      className="p-1 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                      id="close-move-modal-btn"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-muted block mb-1">移动目标文件：</span>
                      <p className="font-mono p-2 rounded-xl border bg-[var(--bg-subtle)] truncate" style={{ borderColor: 'var(--border)' }}>
                        {moveTarget.rel_path}
                      </p>
                    </div>

                    <div>
                      <span className="text-muted block mb-1">选择目标子目录：</span>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto p-1">
                        {availableDirs.map((dirName, idx) => (
                          <div
                            key={idx}
                            onClick={() => setSelectedMoveDir(dirName)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              selectedMoveDir === dirName
                                ? 'bg-[var(--yellow-soft)] border-[var(--yellow)] text-[var(--yellow)] font-bold'
                                : 'bg-[var(--bg-card)] border-[var(--border)] text-muted hover:text-primary'
                            }`}
                            id={`select-dir-btn-${idx}`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <Folder className="w-3.5 h-3.5" />
                              <span className="truncate">{dirName || '根目录 (/)'}</span>
                            </div>
                            {selectedMoveDir === dirName && <Check className="w-3.5 h-3.5" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setMoveTarget(null)}
                      className="px-3.5 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--border)' }}
                      id="cancel-move-btn"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmMove}
                      disabled={moveSubmitting}
                      className="px-4 py-1.5 rounded-xl bg-[var(--yellow)] hover:bg-[var(--yellow)] text-white font-bold text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-md disabled:opacity-50"
                      id="confirm-move-btn"
                    >
                      {moveSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>确认移动</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* -------------------- Import (放入文件) Modal -------------------- */}
          <AnimatePresence>
            {showImportModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 glass-panel"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center space-x-2">
                      <Plus className="w-4 h-4 text-[var(--accent)]" />
                      <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>放入文件至案件文件夹</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="p-1 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                      id="close-import-modal-btn"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-muted block mb-1">选择本地文件：</span>
                      <input
                        type="file"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setImportFileObj(e.target.files[0]);
                          }
                        }}
                        className="w-full p-2 rounded-xl border text-xs cursor-pointer focus:outline-none"
                        style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
                        id="import-file-input"
                      />
                      {importFileObj && (
                        <p className="text-[11px] text-[var(--green)] mt-1 font-mono">
                          已选择: {importFileObj.name} ({formatSize(importFileObj.size)})
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="text-muted block mb-1">选择目标存放子目录：</span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto p-1">
                        {availableDirs.map((dirName, idx) => (
                          <div
                            key={idx}
                            onClick={() => setImportTargetDir(dirName)}
                            className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              importTargetDir === dirName
                                ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] dark:text-[var(--accent)] font-bold'
                                : 'bg-[var(--bg-card)] border-[var(--border)] text-muted hover:text-primary'
                            }`}
                            id={`import-dir-btn-${idx}`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <Folder className="w-3.5 h-3.5" />
                              <span className="truncate">{dirName || '根目录 (/)'}</span>
                            </div>
                            {importTargetDir === dirName && <Check className="w-3.5 h-3.5" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[11px] text-[var(--yellow)]">
                      💡 提示：放入文件为复制模式，原始文件将完好保留；若目标目录已存在同名文件将拒绝操作。
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="px-3.5 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--border)' }}
                      id="cancel-import-btn"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={importSubmitting || !importFileObj}
                      className="px-4 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)] text-[var(--on-accent)] font-bold text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-md disabled:opacity-50"
                      id="confirm-import-btn"
                    >
                      {importSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>确认放入</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* -------------------- Full Screen Large Preview Modal -------------------- */}
          <AnimatePresence>
            {showFullScreenPreview && selectedFileForPreview && (() => {
              const previewExt = selectedFileForPreview.name.toLowerCase().split('.').pop() || '';
              const isPreviewImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(previewExt);
              const isPreviewPdf = previewExt === 'pdf';
              const isPreviewOffice = ['doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods', 'ppt', 'pptx', 'pptm', 'odp', 'csv', 'tsv'].includes(previewExt);
              const fullScreenOfficeUrl = selectedFileForPreview.file_id ? `/api/files/${encodeURIComponent(selectedFileForPreview.file_id)}/preview` : null;
              const effectiveDownloadUrl = selectedFileForPreview.file_id
                ? `/api/files/${encodeURIComponent(selectedFileForPreview.file_id)}/preview`
                : (rawUrl || `/api/cases/${encodeURIComponent(activeCaseId)}/folder/files/raw?path=${encodeURIComponent(selectedFileForPreview.rel_path)}`);

              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-xs"
                  onClick={() => setShowFullScreenPreview(false)}
                  id="file-fullscreen-preview-backdrop"
                >
                  <motion.div
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="max-w-[92vw] w-full max-h-[90vh] h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden relative"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    id="file-fullscreen-preview-modal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="p-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center space-x-2 min-w-0">
                        <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                            {selectedFileForPreview.name}
                          </h3>
                          <span className="text-[11px] font-mono text-muted">
                            {selectedFileForPreview.doc_type || 'standard'} · {selectedFileForPreview.rel_path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {effectiveDownloadUrl && (
                          <a
                            href={effectiveDownloadUrl}
                            download={selectedFileForPreview.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer flex items-center space-x-1 text-xs"
                            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
                            title="下载文件"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setShowFullScreenPreview(false)}
                          className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
                          id="fullscreen-preview-close"
                          aria-label="关闭全屏预览"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>

                    {/* Toolbar for Zoom & Rotate (Images/PDFs/Office with file_id) */}
                    {(isPreviewImage || isPreviewPdf || (isPreviewOffice && fullScreenOfficeUrl)) && (
                      <div className="px-4 py-2 border-b flex items-center justify-between text-xs font-mono text-muted flex-shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setFullScreenZoom((z) => Math.max(z - 0.25, 0.5))}
                            className="p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer"
                            title="缩小"
                          >
                            <ZoomOut className="w-4 h-4" />
                          </button>
                          <span>{(fullScreenZoom * 100).toFixed(0)}%</span>
                          <button
                            onClick={() => setFullScreenZoom((z) => Math.min(z + 0.25, 2.5))}
                            className="p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer"
                            title="放大"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          onClick={() => setFullScreenRotation((r) => (r + 90) % 360)}
                          className="p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center space-x-1"
                          title="旋转 90°"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span>{fullScreenRotation}°</span>
                        </button>
                      </div>
                    )}

                    {/* Content Area */}
                    <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center relative bg-[var(--bg-app)]">
                      {isPreviewImage ? (
                        <div className="w-full h-full flex items-center justify-center overflow-auto">
                          <img
                            src={rawUrl || ''}
                            alt={selectedFileForPreview.name}
                            className="max-w-full max-h-full object-contain transition-transform duration-200"
                            style={{
                              transform: `scale(${fullScreenZoom}) rotate(${fullScreenRotation}deg)`,
                            }}
                          />
                        </div>
                      ) : isPreviewPdf ? (
                        rawUrl ? (
                          <iframe
                            src={rawUrl}
                            title={selectedFileForPreview.name}
                            className="w-full h-full rounded-xl border-none bg-white dark:bg-slate-900"
                            style={{
                              transform: `scale(${fullScreenZoom}) rotate(${fullScreenRotation}deg)`,
                              transformOrigin: 'center center',
                            }}
                          />
                        ) : (
                          <div className="p-6 text-center space-y-2 text-xs text-muted">
                            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto" />
                            <span>加载 PDF 预览中...</span>
                          </div>
                        )
                      ) : isPreviewOffice ? (
                        selectedFileForPreview.file_id ? (
                          <iframe
                            src={`/api/files/${encodeURIComponent(selectedFileForPreview.file_id)}/preview`}
                            title={selectedFileForPreview.name}
                            className="w-full h-full rounded-xl border-none bg-white dark:bg-slate-900"
                            style={{
                              transform: `scale(${fullScreenZoom}) rotate(${fullScreenRotation}deg)`,
                              transformOrigin: 'center center',
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col space-y-3">
                            <div className="p-3 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] text-xs flex items-center space-x-2 flex-shrink-0">
                              <Info className="w-4 h-4 flex-shrink-0" />
                              <span className="font-semibold">原样排版预览将随文件库关联自动启用（当前展示解析文本）</span>
                            </div>
                            <div className="flex-1 p-4 rounded-xl border bg-[var(--bg-card)] font-mono text-xs whitespace-pre-wrap overflow-auto select-text" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                              {previewData?.text_preview || '文本提炼中或暂无解析内容'}
                            </div>
                          </div>
                        )
                      ) : (
                        /* Text, Msg or Fallback */
                        <div className="w-full h-full flex flex-col space-y-3">
                          {previewExt === 'msg' && (
                            <div className="p-3 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] text-xs flex items-center space-x-2 flex-shrink-0">
                              <Info className="w-4 h-4 flex-shrink-0" />
                              <span className="font-semibold">MSG 邮件格式仅支持文本提炼解析预览</span>
                            </div>
                          )}
                          <pre className="flex-1 p-4 rounded-xl border bg-[var(--bg-card)] font-mono text-xs whitespace-pre-wrap overflow-auto select-text" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                            {previewData?.text_preview || (rawUrl ? '文本内容加载完成' : '暂无解析内容')}
                          </pre>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              );
            })()}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
