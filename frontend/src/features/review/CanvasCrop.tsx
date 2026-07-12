import React, { useRef, useEffect, useState } from 'react';

interface CanvasCropProps {
  pageUrl: string;
  polygon?: number[]; // [x0, y0, x1, y1, x2, y2, x3, y3, ...]
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
  polygon,
  className,
  style,
  paddingPercent = 0.05,
  onDataUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resizeKey, setResizeKey] = useState(0);
  const dataUrlRef = useRef<string>('');

  useEffect(() => {
    const handleResize = () => setResizeKey(k => k + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    if (!polygon || polygon.length < 8) {
      setError(true);
      setLoading(false);
      return;
    }

    const [x0, y0, x1, y1, x2, y2, x3, y3] = polygon;

    const negCount = [x0, x1, x2, x3].filter(v => v < 0).length + [y0, y1, y2, y3].filter(v => v < 0).length;
    if (negCount > 2) {
      setError(true);
      setLoading(false);
      return;
    }

    const w = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    const h = Math.sqrt((x3 - x0) ** 2 + (y3 - y0) ** 2);

    if (w < 10 || w > 5000 || h < 10 || h > 5000) {
      setError(true);
      setLoading(false);
      return;
    }

    if (w <= 0 || h <= 0) {
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

      const dpr = window.devicePixelRatio || 1;

      const theta = Math.atan2(y1 - y0, x1 - x0);

      const padX = w * paddingPercent;
      const padY = h * paddingPercent;

      const cropW = Math.ceil(w + 2 * padX);
      const cropH = Math.ceil(h + 2 * padY);

      canvas.width = cropW * dpr;
      canvas.height = cropH * dpr;

      ctx.scale(dpr, dpr);

      ctx.save();
      ctx.translate(padX, padY);
      ctx.rotate(-theta);
      ctx.translate(-x0, -y0);
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      setLoading(false);

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
  }, [isVisible, pageUrl, polygon, paddingPercent, onDataUrl, resizeKey]);

  if (!isVisible) {
    return <div ref={containerRef} className={className} style={style} />;
  }

  if (error) {
    return (
      <div ref={containerRef} className="text-xs p-2 border border-dashed rounded text-center text-[var(--text-muted)] border-[var(--color-border)]">
        No crop
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {loading && (
        <div className="absolute inset-0 bg-black/5 flex items-center justify-center text-[11px] text-[var(--text-secondary)] rounded">
          …
        </div>
      )}
      <canvas
        key={resizeKey}
        ref={canvasRef}
        role="img"
        aria-label="OCR field crop"
        className={"block rounded" + (className ? " " + className : "")}
        style={style}
      />
    </div>
  );
};

// Helper hook: manages a map of field key → data URL for zoom
export function useCropDataUrls() {
  const map = useRef<Record<string, string>>({});
  const setUrl = (key: string, url: string) => {
    map.current[key] = url;
  };
  const getUrl = (key: string) => map.current[key] || '';
  return { setUrl, getUrl };
}
