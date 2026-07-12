import React from 'react';
import type { ZoomImage } from '@/api';

interface Props {
  zoom: ZoomImage | null;
}

export const ZoomPopup: React.FC<Props> = ({ zoom }) => {
  if (!zoom) return null;
  return (
    <div
      className="fixed pointer-events-none z-[99999] overflow-hidden rounded-[10px]"
      style={{
        left: zoom.x + 20,
        top: zoom.y - 80,
        transform: 'translateY(-50%)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
        border: '2px solid var(--accent-violet)',
      }}
    >
      <img
        src={zoom.src}
        alt=""
        className="block w-[440px] max-h-[180px] object-contain"
        style={{ background: 'rgba(0,0,0,0.4)' }}
      />
    </div>
  );
};
