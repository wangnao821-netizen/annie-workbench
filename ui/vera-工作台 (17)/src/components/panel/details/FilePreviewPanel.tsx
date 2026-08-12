import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X, ZoomIn, ZoomOut, RotateCw, FileText, Image as ImageIcon } from 'lucide-react';

interface FilePreviewPanelProps {
  filename: string;
  docType: string;
  onClose: () => void;
}

export function FilePreviewPanel({ filename, docType, onClose }: FilePreviewPanelProps) {
  const reduced = useReducedMotion();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const isImage = filename.toLowerCase().endsWith('.png') || filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg');

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] shadow-2xl border-l flex flex-col"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="file-preview-panel"
    >
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 min-w-0">
          <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {filename}
            </h3>
            <span className="text-[10px] font-mono text-muted">{docType}</span>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
          id="file-preview-close"
        >
          <X className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Toolbar for Zoom & Rotate */}
      <div className="px-4 py-2 border-b flex items-center justify-between text-xs font-mono text-muted flex-shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span>{(zoom * 100).toFixed(0)}%</span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleRotate}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer flex items-center space-x-1"
          title="旋转 90°"
        >
          <RotateCw className="w-4 h-4" />
          <span>{rotation}°</span>
        </button>
      </div>

      {/* Preview Content Area */}
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center text-center space-y-4">
        <div
          className="w-full max-w-sm aspect-[3/4] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 space-y-3 transition-transform duration-200"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-app)',
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          {isImage ? (
            <ImageIcon className="w-12 h-12 text-purple-500/60" />
          ) : (
            <FileText className="w-12 h-12 text-blue-500/60" />
          )}

          <div className="space-y-1">
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              {filename}
            </p>
            <p className="text-[11px] text-muted">
              文件类型: {isImage ? '图片文件' : 'PDF 文档'}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px] font-mono leading-relaxed max-w-xs">
            📄 预览功能待后端就绪
          </div>
        </div>

        <p className="text-[10px] font-mono text-muted">
          TODO(WO-03): GET /api/files/&#123;id&#125;/preview
        </p>
      </div>
    </motion.div>
  );
}
