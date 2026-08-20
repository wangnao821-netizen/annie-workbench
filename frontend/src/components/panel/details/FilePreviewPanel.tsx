import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X, ZoomIn, ZoomOut, RotateCw, FileText, Download, AlertCircle, RefreshCw } from 'lucide-react';

interface FilePreviewPanelProps {
  fileId?: string;
  filename: string;
  docType: string;
  onClose: () => void;
}

export function FilePreviewPanel({ fileId, filename, docType, onClose }: FilePreviewPanelProps) {
  const reduced = useReducedMotion();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const effectiveId = fileId || filename;
  const previewUrl = `/api/files/${encodeURIComponent(effectiveId)}/preview`;

  const ext = filename.toLowerCase().split('.').pop() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods', 'ppt', 'pptx', 'pptm', 'odp', 'csv', 'tsv'].includes(ext);
  const isText = ['txt', 'json', 'md', 'log', 'xml'].includes(ext);

  // Esc key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (isText && effectiveId) {
      setLoadingText(true);
      setPreviewError(false);
      fetch(previewUrl)
        .then((res) => {
          if (!res.ok) throw new Error('网络响应异常');
          return res.text();
        })
        .then((text) => {
          setTextContent(text);
        })
        .catch(() => {
          setPreviewError(true);
        })
        .finally(() => {
          setLoadingText(false);
        });
    }
  }, [isText, effectiveId, previewUrl]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="max-w-[92vw] w-full max-h-[90vh] h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden relative"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        id="file-preview-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2 min-w-0">
            <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {filename}
              </h3>
              <span className="text-[11px] font-mono text-muted">{docType}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href={previewUrl}
              download={filename}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer flex items-center space-x-1 text-xs"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
              title="下载文件"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
              id="file-preview-close"
              aria-label="关闭预览"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Toolbar for Zoom & Rotate (Images/PDFs/Office) */}
        {(isImage || isPdf || isOffice) && (
          <div className="px-4 py-2 border-b flex items-center justify-between text-xs font-mono text-muted flex-shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleZoomOut}
                className="p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer"
                title="缩小"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span>{(zoom * 100).toFixed(0)}%</span>
              <button
                onClick={handleZoomIn}
                className="p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer"
                title="放大"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleRotate}
              className="p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center space-x-1"
              title="旋转 90°"
            >
              <RotateCw className="w-4 h-4" />
              <span>{rotation}°</span>
            </button>
          </div>
        )}

        {/* Preview Content Area */}
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center relative bg-[var(--bg-app)]">
          {previewError ? (
            <div className="p-6 text-center space-y-3 rounded-2xl border max-w-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
              <AlertCircle className="w-8 h-8 text-[var(--red)] mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>预览不可用</p>
                <p className="text-[11px] text-muted">服务端未找到该文件流或类型受限。</p>
              </div>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--on-accent)] text-xs font-semibold"
              >
                尝试直接下载
              </a>
            </div>
          ) : (isPdf || isOffice) ? (
            <iframe
              src={previewUrl}
              title={filename}
              onError={() => setPreviewError(true)}
              className="w-full h-full rounded-xl border-none bg-white dark:bg-slate-900"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
            />
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center overflow-auto">
              <img
                src={previewUrl}
                alt={filename}
                onError={() => setPreviewError(true)}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          ) : isText ? (
            loadingText ? (
              <div className="flex items-center space-x-2 text-xs text-muted">
                <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
                <span>加载文本预览...</span>
              </div>
            ) : (
              <pre className="w-full h-full p-4 rounded-xl border font-mono text-xs whitespace-pre-wrap overflow-auto" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                {textContent}
              </pre>
            )
          ) : (
            /* General fallback for non-previewable format */
            <div className="p-6 text-center space-y-3 rounded-2xl border max-w-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
              <FileText className="w-10 h-10 text-[var(--accent)] mx-auto" />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{filename}</p>
                <p className="text-[11px] text-muted">{docType} · 格式无法内置直显</p>
              </div>
              <a
                href={previewUrl}
                download={filename}
                className="inline-block px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--on-accent)] text-xs font-semibold"
              >
                点击下载原文件
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
