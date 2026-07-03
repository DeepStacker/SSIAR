import React from 'react';
import { ZoomImage } from '../api';

interface Props {
  zoom: ZoomImage | null;
}

export const ZoomPopup: React.FC<Props> = ({ zoom }) => {
  if (!zoom) return null;
  return (
    <div style={{
      position: 'fixed', left: zoom.x + 20, top: zoom.y - 80, zIndex: 99999,
      boxShadow: '0 8px 40px rgba(0,0,0,0.8)', borderRadius: '10px', overflow: 'hidden',
      border: '2px solid var(--accent-violet)', pointerEvents: 'none',
      transform: 'translateY(-50%)',
    }}>
      <img src={zoom.src} alt="" style={{ width: '440px', maxHeight: '180px', objectFit: 'contain', background: 'rgba(0,0,0,0.4)', display: 'block' }} />
    </div>
  );
};
