import { useRef, useState } from 'react';

interface PanelDividerProps {
  orientation: 'vertical' | 'horizontal';
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
}

export function PanelDivider({ orientation, initialWidth, minWidth, maxWidth, onResize }: PanelDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startPos: number; startSize: number; active: boolean }>({
    startPos: 0,
    startSize: 0,
    active: false,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startPos = orientation === 'vertical' ? e.clientX : e.clientY;
    dragRef.current = { startPos, startSize: initialWidth, active: true };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const currentPos = orientation === 'vertical' ? e.clientX : e.clientY;
    const delta = currentPos - dragRef.current.startPos;
    const newSize = Math.max(minWidth, Math.min(maxWidth, dragRef.current.startSize - delta));
    onResize(newSize);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    dragRef.current.active = false;
    setIsDragging(false);
  };

  const isVert = orientation === 'vertical';

  return (
    <div
      id="panel-divider"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`${
        isVert ? 'w-1.5 h-full cursor-col-resize border-l' : 'h-1.5 w-full cursor-row-resize border-t'
      } flex-shrink-0 transition-colors touch-none select-none ${
        isDragging ? 'bg-[var(--accent)] opacity-60' : 'hover:bg-[var(--accent-soft)] bg-transparent'
      }`}
      style={{ borderColor: 'var(--border)' }}
      title={isVert ? '拖动调整对话框宽度' : '拖动调整对话框高度'}
    />
  );
}
