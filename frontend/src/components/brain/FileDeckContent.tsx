import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Folder,
  FileText,
  ChevronRight,
  Eye,
  Edit3,
  FolderInput,
  Plus,
  RefreshCw,
  X,
  Check,
  Sparkles,
  Loader2,
  AlertTriangle,
  FileCheck2,
  Maximize2,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import { FileItem, FilePreviewResponse, NamingSuggestResponse } from '../../types/api';
import {
  getCaseFolderFiles,
  getCaseFilePreview,
  previewRawFileUrl,
  renameCaseFile,
  moveCaseFile,
  importCaseFile,
  getNamingSuggest,
} from '../../services/api/fileOps';

interface FileDeckContentProps {
  caseId: string | null;
}

export function FileDeckContent({ caseId }: FileDeckContentProps) {
  const reduced = useReducedMotion();
  const currentCase = useCaseStore((s) => s.currentCase);

  const activeCaseId = caseId || currentCase?.caseId || 'CASE_001';

  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // In-line Preview State
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<FileItem | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'raw' | 'parsed'>('raw');
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState<boolean>(false);
  const [rawError, setRawError] = useState<string | null>(null);

  // Full Screen Preview Modal State
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

  const availableDirs = ['', '_Inbox', 'Send to Lender', 'Bank Statements', 'Identity & Income'];

  const loadFiles = useCallback(
    async (pathStr: string) => {
      setLoading(true);
      try {
        const res = await getCaseFolderFiles(activeCaseId, pathStr);
        setCurrentPath(res.current_path || pathStr);
        setFiles(res.items || []);
      } catch (err: any) {
        useToastStore
          .getState()
          .showToast('error', `加载文件夹失败: ${err?.detail || err?.message || '未知错误'}`);
      } finally {
        setLoading(false);
      }
    },
    [activeCaseId]
  );

  useEffect(() => {
    loadFiles(currentPath);
  }, [loadFiles, currentPath]);

  const handleOpenPreview = async (file: FileItem) => {
    setSelectedFileForPreview(file);
    setPreviewLoading(true);
    setPreviewData(null);
    setRawLoading(true);
    setRawUrl(null);
    setRawError(null);
    setActivePreviewTab('raw');

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
        setActivePreviewTab('parsed');
      })
      .finally(() => {
        setRawLoading(false);
      });

    await Promise.allSettled([fetchParsed, fetchRaw]);
  };

  const handleStartRename = (file: FileItem) => {
    setRenameTarget(file);
    setNewNameInput(file.name);
    setNamingSuggest(null);
  };

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
      useToastStore
        .getState()
        .showToast('error', `无法获取命名建议: ${err?.detail || err?.message || '系统错误'}`);
    } finally {
      setSuggestLoading(false);
    }
  };

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
      window.dispatchEvent(new CustomEvent('files_updated'));
    } catch (err: any) {
      useToastStore
        .getState()
        .showToast('error', `重命名失败: ${err?.detail || err?.message || '操作被拒绝'}`);
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleStartMove = (file: FileItem) => {
    setMoveTarget(file);
    setSelectedMoveDir(currentPath);
  };

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
      window.dispatchEvent(new CustomEvent('files_updated'));
    } catch (err: any) {
      useToastStore
        .getState()
        .showToast('error', `移动文件失败: ${err?.detail || err?.message || '操作被拒绝'}`);
    } finally {
      setMoveSubmitting(false);
    }
  };

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
      window.dispatchEvent(new CustomEvent('files_updated'));
    } catch (err: any) {
      useToastStore.getState().showToast('error', err?.detail || err?.message || '导入文件失败');
    } finally {
      setImportSubmitting(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden relative select-none"
      style={{ backgroundColor: 'var(--bg-card)' }}
      id="file-deck-content"
    >
      {/* 1. Header Toolbar */}
      <div
        className="px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="font-extrabold text-xs tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
            案卷资料夹
          </span>
          <span className="text-[11px] font-mono font-bold text-muted bg-[var(--bg-subtle)] px-1.5 py-0.2 rounded-full">
            {files.filter((f) => !f.is_dir).length}
          </span>
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={() => loadFiles(currentPath)}
            className="p-1 rounded-lg border text-muted hover:text-primary cursor-pointer transition-colors"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            title="刷新目录"
            id="file-deck-refresh-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={() => {
              setShowImportModal(true);
              setImportTargetDir(currentPath);
              setImportFileObj(null);
            }}
            className="px-2.5 py-1 rounded-lg border text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] hover:opacity-90 cursor-pointer flex items-center space-x-1 shadow-xs"
            id="file-deck-import-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>放入文件</span>
          </motion.button>
        </div>
      </div>

      {/* 2. Breadcrumbs Navigation */}
      <div
        className="px-3 py-1.5 border-b flex items-center space-x-1 text-xs text-muted overflow-x-auto no-scrollbar flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          type="button"
          onClick={() => setCurrentPath('')}
          className={`hover:text-primary transition-colors cursor-pointer flex-shrink-0 ${
            currentPath === '' ? 'font-bold text-primary' : ''
          }`}
          id="deck-breadcrumb-root-btn"
        >
          根目录
        </button>
        {pathParts.map((part, idx) => {
          const subPath = pathParts.slice(0, idx + 1).join('/');
          const isLast = idx === pathParts.length - 1;
          return (
            <div key={idx} className="flex items-center space-x-1 flex-shrink-0">
              <ChevronRight className="w-3 h-3 text-muted" />
              <button
                type="button"
                onClick={() => setCurrentPath(subPath)}
                className={`hover:text-primary transition-colors cursor-pointer ${
                  isLast ? 'font-bold text-primary' : ''
                }`}
                id={`deck-breadcrumb-part-${idx}`}
              >
                {part}
              </button>
            </div>
          );
        })}
      </div>

      {/* 3. File List & In-line Preview */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar" id="file-deck-body">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted text-xs space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            <span>正在读取文件夹数据...</span>
          </div>
        ) : files.length === 0 ? (
          !currentCase?.folderPath ? (
            <div
              className="py-10 text-center text-xs text-muted border border-dashed rounded-xl p-4"
              style={{ borderColor: 'var(--border)' }}
            >
              <Folder className="w-6 h-6 mx-auto text-muted/40 mb-1.5" />
              <p>本案件尚未关联本地文件夹</p>
              <p className="text-[11px] mt-0.5 text-muted/70">请先在案件详情中关联/创建案件文件夹，即可在这里浏览案卷资料</p>
            </div>
          ) : (
            <div
              className="py-10 text-center text-xs text-muted border border-dashed rounded-xl p-4"
              style={{ borderColor: 'var(--border)' }}
            >
              <Folder className="w-6 h-6 mx-auto text-muted/40 mb-1.5" />
              <p>当前目录下无任何文件或子文件夹</p>
              <p className="text-[11px] mt-0.5 text-muted/70">点击右上角「放入文件」添加材料到此案件目录</p>
            </div>
          )
        ) : (
          <div className="space-y-1.5">
            {/* Subdirectories First */}
            {files
              .filter((f) => f.is_dir)
              .map((dirItem, idx) => (
                <motion.div
                  key={`dir-${idx}`}
                  whileTap={reduced ? undefined : { scale: 0.99 }}
                  onClick={() => setCurrentPath(dirItem.rel_path)}
                  className="p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors hover:bg-[var(--accent-soft)] group"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  id={`deck-dir-item-${idx}`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Folder className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
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
                  className="group p-2.5 rounded-xl border space-y-1.5 transition-all hover:border-[var(--accent)]"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  id={`deck-file-item-${idx}`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {fileItem.name}
                        </h4>
                        <div className="flex items-center space-x-1.5 text-[11px] text-muted mt-0.5">
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
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(fileItem)}
                        className="px-2 py-0.5 rounded-lg text-xs font-bold border border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-85 cursor-pointer flex items-center space-x-1 transition-colors"
                        id={`deck-btn-preview-${idx}`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>预览</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartRename(fileItem)}
                        className="px-2 py-0.5 rounded-lg text-xs font-bold border border-[var(--purple-soft)] bg-[var(--purple-soft)] text-[var(--purple)] hover:opacity-85 cursor-pointer flex items-center space-x-1 transition-colors opacity-0 group-hover:opacity-100"
                        id={`deck-btn-rename-${idx}`}
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>改名</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartMove(fileItem)}
                        className="px-2 py-0.5 rounded-lg text-xs font-bold border border-[var(--yellow-soft)] bg-[var(--yellow-soft)] text-[var(--yellow)] hover:opacity-85 cursor-pointer flex items-center space-x-1 transition-colors opacity-0 group-hover:opacity-100"
                        id={`deck-btn-move-${idx}`}
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
              className="p-3 rounded-2xl border bg-[var(--accent-soft)] border-[var(--accent-soft)] space-y-2 mt-3"
              id="deck-file-preview-panel"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-[var(--accent-soft)]">
                <div className="flex items-center space-x-1.5 truncate">
                  <FileCheck2 className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
                  <h4 className="text-xs font-bold text-[var(--accent)] truncate">
                    预览: {selectedFileForPreview.name}
                  </h4>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFullScreenZoom(1);
                      setFullScreenRotation(0);
                      setShowFullScreenPreview(true);
                    }}
                    className="px-2 py-0.5 rounded-lg text-[11px] font-bold border border-[var(--accent)]/30 bg-[var(--bg-card)] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all cursor-pointer flex items-center space-x-1 shadow-2xs"
                    id="deck-btn-fullscreen-preview"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>全屏</span>
                  </button>

                  <div
                    className="flex items-center space-x-0.5 border rounded-lg p-0.5 bg-[var(--bg-subtle)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePreviewTab('raw')}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                        activePreviewTab === 'raw'
                          ? 'bg-[var(--accent)] text-white shadow-xs'
                          : 'text-muted hover:text-primary'
                      }`}
                    >
                      原文
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePreviewTab('parsed')}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                        activePreviewTab === 'parsed'
                          ? 'bg-[var(--accent)] text-white shadow-xs'
                          : 'text-muted hover:text-primary'
                      }`}
                    >
                      解析
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFileForPreview(null)}
                    className="p-1 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tab 1: 原文 */}
              {activePreviewTab === 'raw' && (
                <div>
                  {rawLoading ? (
                    <div className="py-6 flex items-center justify-center space-x-2 text-xs text-muted">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                      <span>正在加载原生文件...</span>
                    </div>
                  ) : rawError ? (
                    <div className="p-2.5 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] text-xs space-y-1.5">
                      <div className="flex items-center space-x-1.5 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>原生文件未能直接展示</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{rawError}</p>
                      <button
                        type="button"
                        onClick={() => setActivePreviewTab('parsed')}
                        className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-[var(--yellow)] text-white cursor-pointer"
                      >
                        查看解析文本内容
                      </button>
                    </div>
                  ) : rawUrl ? (
                    <div
                      className="rounded-xl border overflow-hidden bg-[var(--bg-subtle-strong)] min-h-[180px] max-h-[360px] flex items-center justify-center"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {selectedFileForPreview.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img
                          src={rawUrl}
                          className="max-h-[320px] object-contain rounded-lg p-2"
                          alt="原生图片"
                        />
                      ) : (
                        <iframe
                          src={rawUrl}
                          className="w-full h-[320px] border-0 bg-white"
                          title="原生文件预览"
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Tab 2: 解析内容 */}
              {activePreviewTab === 'parsed' && (
                <div>
                  {previewLoading ? (
                    <div className="py-6 flex items-center justify-center space-x-2 text-xs text-muted">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                      <span>正在解析文本内容...</span>
                    </div>
                  ) : previewData?.parse_error ? (
                    <div className="p-2.5 rounded-xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs space-y-1">
                      <div className="flex items-center space-x-1.5 font-bold text-[var(--red)]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>解析受阻</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{previewData.parse_error}</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div
                        className="p-2.5 rounded-xl border bg-[var(--bg-subtle)] text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-y-auto select-text"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        {previewData?.text_preview || '文本提炼完成，暂无更多明细内容'}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted pt-0.5">
                        <span className="truncate">路径: {previewData?.rel_path}</span>
                        <span>类型: {previewData?.doc_type || 'standard'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. Footer Safety Notice */}
      <div
        className="p-2.5 border-t flex items-center justify-center space-x-1.5 text-[11px] text-muted flex-shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-panel)' }}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-[var(--green)] flex-shrink-0" />
        <span>操作只作用于当前案件目录；目标存在将拒绝；不会覆盖文件。</span>
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
              className="w-full max-w-md p-4 rounded-2xl border shadow-2xl space-y-3.5"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-2">
                  <Edit3 className="w-4 h-4 text-[var(--purple)]" />
                  <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                    文件重命名
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="p-1 rounded-lg text-muted hover:text-primary cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-muted block mb-1">原文件名：</span>
                  <p
                    className="font-mono p-2 rounded-xl border bg-[var(--bg-subtle)] truncate"
                    style={{ borderColor: 'var(--border)' }}
                  >
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
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{suggestLoading ? '推演中...' : 'AI 规范命名建议'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newNameInput}
                    onChange={(e) => setNewNameInput(e.target.value)}
                    className="w-full p-2 rounded-xl border font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[var(--purple)]"
                    style={{
                      backgroundColor: 'var(--bg-app)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                    placeholder="请输入新文件名"
                  />
                </div>

                {namingSuggest && (
                  <div className="p-2.5 rounded-xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--purple)] text-[11px]">
                        推演建议：{namingSuggest.doc_type}
                      </span>
                      <span className="text-[11px] text-[var(--purple)] font-mono">
                        {namingSuggest.suggested}
                      </span>
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-[var(--purple)] list-disc list-inside">
                      {namingSuggest.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-3 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRename}
                  disabled={renameSubmitting || !newNameInput.trim()}
                  className="px-4 py-1.5 rounded-xl bg-[var(--purple)] text-white font-bold text-xs cursor-pointer flex items-center space-x-1 disabled:opacity-50"
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
              className="w-full max-w-md p-4 rounded-2xl border shadow-2xl space-y-3.5"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-2">
                  <FolderInput className="w-4 h-4 text-[var(--yellow)]" />
                  <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                    移动文件
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setMoveTarget(null)}
                  className="p-1 rounded-lg text-muted hover:text-primary cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-muted block mb-1">目标文件：</span>
                  <p
                    className="font-mono p-2 rounded-xl border bg-[var(--bg-subtle)] truncate"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {moveTarget.rel_path}
                  </p>
                </div>

                <div>
                  <span className="text-muted block mb-1">选择目标子目录：</span>
                  <div className="space-y-1 max-h-40 overflow-y-auto p-1">
                    {availableDirs.map((dirName, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedMoveDir(dirName)}
                        className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          selectedMoveDir === dirName
                            ? 'bg-[var(--yellow-soft)] border-[var(--yellow)] text-[var(--yellow)] font-bold'
                            : 'bg-[var(--bg-card)] border-[var(--border)] text-muted hover:text-primary'
                        }`}
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

              <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setMoveTarget(null)}
                  className="px-3 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMove}
                  disabled={moveSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-[var(--yellow)] text-white font-bold text-xs cursor-pointer flex items-center space-x-1 disabled:opacity-50"
                >
                  {moveSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>确认移动</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- Import Modal -------------------- */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md p-4 rounded-2xl border shadow-2xl space-y-3.5"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                    放入文件到案件目录
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="p-1 rounded-lg text-muted hover:text-primary cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-muted block mb-1">选择本地文件：</span>
                  <input
                    type="file"
                    onChange={(e) => setImportFileObj(e.target.files?.[0] || null)}
                    className="w-full p-2 rounded-xl border bg-[var(--bg-input)] border-[var(--border)] text-xs"
                  />
                </div>

                <div>
                  <span className="text-muted block mb-1">存放目标子目录：</span>
                  <select
                    value={importTargetDir}
                    onChange={(e) => setImportTargetDir(e.target.value)}
                    className="w-full p-2 rounded-xl border bg-[var(--bg-input)] border-[var(--border)] text-xs"
                  >
                    {availableDirs.map((dir, idx) => (
                      <option key={idx} value={dir}>
                        {dir || '根目录 (/)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-3 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importSubmitting || !importFileObj}
                  className="px-4 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--on-accent)] font-bold text-xs cursor-pointer flex items-center space-x-1 disabled:opacity-50"
                >
                  {importSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>确认放入</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- Full Screen Preview Modal -------------------- */}
      <AnimatePresence>
        {showFullScreenPreview && selectedFileForPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/90 backdrop-blur-md">
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              className="w-full h-full max-w-6xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            >
              {/* Fullscreen Header */}
              <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-2 truncate">
                  <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                  <h3 className="font-extrabold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {selectedFileForPreview.name}
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setFullScreenZoom((z) => Math.max(0.5, z - 0.25))}
                    className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                    title="缩小"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono font-bold text-muted min-w-[40px] text-center">
                    {Math.round(fullScreenZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setFullScreenZoom((z) => Math.min(3, z + 0.25))}
                    className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                    title="放大"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullScreenRotation((r) => (r + 90) % 360)}
                    className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                    title="旋转 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  <div className="h-4 w-px bg-[var(--border)] mx-1" />

                  <button
                    type="button"
                    onClick={() => setShowFullScreenPreview(false)}
                    className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Fullscreen Body */}
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[var(--bg-subtle)]">
                {rawUrl ? (
                  selectedFileForPreview.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img
                      src={rawUrl}
                      alt="大图预览"
                      style={{
                        transform: `scale(${fullScreenZoom}) rotate(${fullScreenRotation}deg)`,
                        transition: 'transform 0.2s ease',
                      }}
                      className="max-h-[80vh] object-contain rounded-xl shadow-lg"
                    />
                  ) : (
                    <iframe
                      src={rawUrl}
                      className="w-full h-full min-h-[70vh] rounded-xl border bg-white"
                      title="全屏预览"
                    />
                  )
                ) : (
                  <div className="p-6 rounded-xl border bg-[var(--bg-card)] text-xs font-mono whitespace-pre-wrap max-w-3xl max-h-[75vh] overflow-y-auto">
                    {previewData?.text_preview || '暂无文本预览内容'}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
