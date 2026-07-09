import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CanvasCropProps {
  pageUrl: string;
  bbox: number[]; // [x0, y0, x1, y1] in Azure coordinate space
  className?: string;
  style?: React.CSSProperties;
  paddingPercent?: number;
  onDataUrl?: (dataUrl: string) => void; // fired when crop is rendered, provides data URL for zoom
}

// Global cache: one Image element per page URL, shared across all CanvasCrop instances
const imageCache: Record<string, HTMLImageElement> = {};
const imageListeners: Record<string, Array<(img: HTMLImageElement) => void>> = {};

function getOrLoadImage(url: string, onReady: (img: HTMLImageElement) => void, onError: () => void) {
  if (imageCache[url]) {
    const img = imageCache[url];
    if (img.complete && img.naturalWidth > 0) {
      onReady(img);
    } else if (img.complete) {
      onError();
    } else {
      if (!imageListeners[url]) imageListeners[url] = [];
      imageListeners[url].push(onReady);
    }
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  imageCache[url] = img;
  imageListeners[url] = [onReady];

  img.onload = () => {
    const listeners = imageListeners[url] || [];
    imageListeners[url] = [];
    for (const cb of listeners) cb(img);
  };
  img.onerror = () => {
    imageListeners[url] = [];
    onError();
  };
  img.src = url;
}

export const CanvasCrop: React.FC<CanvasCropProps> = ({
  pageUrl,
  bbox,
  className,
  style,
  paddingPercent = 0.05,
  onDataUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const dataUrlRef = useRef<string>('');

  useEffect(() => {
    if (!bbox || bbox.length < 4) {
      setError(true);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderCrop = (img: HTMLImageElement) => {
      if (!isMounted) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError(true);
        setLoading(false);
        return;
      }

      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;

      let [x0, y0, x1, y1] = bbox;
      x0 = Math.max(0, x0);
      y0 = Math.max(0, y0);
      x1 = Math.min(imgW, x1);
      y1 = Math.min(imgH, y1);

      const w = x1 - x0;
      const h = y1 - y0;

      if (w <= 0 || h <= 0) {
        setError(true);
        setLoading(false);
        return;
      }

      const padX = w * paddingPercent;
      const padY = h * paddingPercent;

      const cropX = Math.max(0, Math.floor(x0 - padX));
      const cropY = Math.max(0, Math.floor(y0 - padY));
      const cropW = Math.min(imgW - cropX, Math.ceil(w + 2 * padX));
      const cropH = Math.min(imgH - cropY, Math.ceil(h + 2 * padY));

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      setLoading(false);

      // Generate data URL for zoom popup
      try {
        const url = canvas.toDataURL('image/jpeg', 0.85);
        dataUrlRef.current = url;
        if (onDataUrl) onDataUrl(url);
      } catch {
        // tainted canvas — ignore
      }
    };

    getOrLoadImage(
      pageUrl,
      (img) => renderCrop(img),
      () => { if (isMounted) { setError(true); setLoading(false); } }
    );

    return () => { isMounted = false; };
  }, [pageUrl, bbox, paddingPercent, onDataUrl]);

  // Expose the latest data URL via ref for parent hover handlers
  const getDataUrl = useCallback(() => dataUrlRef.current, []);

  if (error) {
    return (
      <div className="text-xs p-2 border border-dashed rounded text-center"
        style={{ color: 'var(--text-muted)', borderColor: 'var(--color-border)' }}>
        No crop
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', color: 'var(--text-secondary)', borderRadius: '4px',
        }}>…</div>
      )}
      <canvas
        ref={canvasRef}
        data-dataurl-getter=""
        className={className}
        style={{ display: 'block', borderRadius: '4px', ...style }}
      />
    </div>
  );
};

// Helper hook: manages a map of field key → data URL for zoom
export function useCropDataUrls() {
  const map = useRef<Record<string, string>>({});
  const setUrl = useCallback((key: string, url: string) => {
    map.current[key] = url;
  }, []);
  const getUrl = useCallback((key: string) => map.current[key] || '', []);
  return { setUrl, getUrl };
}
