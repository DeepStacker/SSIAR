import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { api } from '@/api';

interface Props {
  docId: string;
  pageNum: 1 | 2;
  onClose: () => void;
  onChangePage?: (num: 1 | 2) => void;
}

export const PageViewer: React.FC<Props> = ({ docId, pageNum, onClose, onChangePage }) => {
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const reset = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }); }, []);

  const zoomAt = useCallback((newScale: number, cx: number, cy: number) => {
    const clamped = Math.max(0.25, Math.min(10, newScale));
    const ratio = clamped / scale;
    setPos(p => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
    setScale(clamped);
  }, [scale]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAt(scale * delta, cx, cy);
  }, [scale, zoomAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    }
  }, [pos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.x),
        y: dragStart.current.py + (e.clientY - dragStart.current.y),
      });
    }
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'r' || e.key === 'R') reset();
      if (onChangePage) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Tab') {
          e.preventDefault();
          onChangePage(pageNum === 1 ? 2 : 1);
        }
        if (e.key === '1') {
          e.preventDefault();
          onChangePage(1);
        }
        if (e.key === '2') {
          e.preventDefault();
          onChangePage(2);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, reset, pageNum, onChangePage]);

  const zoomIn = useCallback(() => zoomAt(scale * 1.4, 0, 0), [scale, zoomAt]);
  const zoomOut = useCallback(() => zoomAt(scale / 1.4, 0, 0), [scale, zoomAt]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      role="dialog" aria-modal="true" aria-label="Page viewer"
      onClick={onClose}
    >
      <div
        className="relative w-[95vw] h-[95vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center py-2 shrink-0">
          <div className="flex items-center gap-3">
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>
              Page {pageNum} <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '8px' }}>(Press 1 or 2, Tab, or Arrow keys to switch)</span>
            </span>
            <span style={{ color: '#64748b', fontSize: '12px' }} className="font-mono">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={zoomOut} title="Zoom Out"
              className="bg-white/10 hover:bg-white/20 text-white rounded-md p-1.5">
              <ZoomOut size={16} />
            </button>
            <button onClick={reset} title="Reset Zoom (R)"
              className="bg-white/10 hover:bg-white/20 text-white rounded-md p-1.5">
              <RotateCcw size={16} />
            </button>
            <button onClick={zoomIn} title="Zoom In"
              className="bg-white/10 hover:bg-white/20 text-white rounded-md p-1.5">
              <ZoomIn size={16} />
            </button>
            <button onClick={onClose}
              className="bg-white/10 hover:bg-white/20 text-white rounded-md p-1.5 flex items-center gap-1 text-sm">
              <X size={16} /> Close
            </button>
          </div>
        </div>

        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="flex-1 overflow-hidden relative flex items-center justify-center"
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          {!loaded && (
            <div className="flex items-center justify-center absolute inset-0" style={{ color: '#64748b' }}>
              Loading...
            </div>
          )}
          <img
            ref={imgRef}
            src={api.getPageUrl(docId, pageNum)}
            alt={`Page ${pageNum}`}
            onLoad={() => setLoaded(true)}
            draggable={false}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              borderRadius: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              display: loaded ? 'block' : 'none',
              maxWidth: '100%', maxHeight: '100%',
              userSelect: 'none', pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
};
