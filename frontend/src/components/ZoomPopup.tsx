import React from 'react';
import type { ZoomImage } from '@/api';

interface Props {
  zoom: ZoomImage | null;
}

export const ZoomPopup: React.FC<Props> = ({ zoom }) => {
  if (!zoom) return null;
  return (
    <div
      className="fixed pointer-events-none z-[99999] overflow-hidden rounded-[10px] border-2 border-primary shadow-[0_8px_40px_var(--shadow-base)]"
      style={{
        left: zoom.x + 20,
        top: zoom.y - 80,
        transform: 'translateY(-50%)',
      }}
    >
      <img
        src={zoom.src}
        alt=""
        className="block w-[80vw] max-w-[440px] max-h-[180px] object-contain bg-black/40"
      />
    </div>
  );
};
