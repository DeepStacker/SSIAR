import { useState, useRef, useCallback } from 'react';
import type { ZoomImage } from '@/api';

export function useCropZoom(yOffset: number = 0) {
  const [zoomImg, setZoomImg] = useState<ZoomImage | null>(null);
  const cropRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cropDataUrls = useRef<Record<string, string>>({});
  const focusedFieldRef = useRef<string | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showZoomForCrop = useCallback((key: string) => {
    const el = cropRefs.current[key];
    const src = cropDataUrls.current[key] || '';
    if (el && src) {
      const rect = el.getBoundingClientRect();
      setZoomImg({ src, x: rect.right + 20, y: rect.top + rect.height / 2 });
    }
  }, []);

  const handleCropEnter = useCallback((e: React.MouseEvent, key: string) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    const src = cropDataUrls.current[key] || '';
    if (src) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setZoomImg({ src, x: rect.left + rect.width / 2, y: rect.top });
    }
  }, []);

  const handleCropMove = useCallback((e: React.MouseEvent, key: string) => {
    const src = cropDataUrls.current[key] || '';
    if (src) setZoomImg({ src, x: e.clientX, y: e.clientY + yOffset });
  }, [yOffset]);

  const handleCropLeave = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      if (!focusedFieldRef.current) {
        setZoomImg(null);
      }
    }, 80);
  }, []);

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>, key: string) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    focusedFieldRef.current = key;
    showZoomForCrop(key);
    e.target.select();
  }, [showZoomForCrop]);

  const handleInputBlur = useCallback(() => {
    focusedFieldRef.current = null;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      if (!focusedFieldRef.current) {
        setZoomImg(null);
      }
    }, 80);
  }, []);

  return {
    zoomImg, setZoomImg,
    cropRefs, cropDataUrls,
    focusedFieldRef, leaveTimerRef,
    showZoomForCrop,
    handleCropEnter,
    handleCropMove,
    handleCropLeave,
    handleInputFocus,
    handleInputBlur,
  };
}
