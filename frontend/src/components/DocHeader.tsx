import React from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  center?: React.ReactNode;
}

export const DocHeader: React.FC<Props> = ({ title, onClose, center }) => (
  <header className="main-header">
    <div className="logo" style={{ fontSize: '18px' }}>
      <span>{title}</span>
    </div>
    {center && <div style={{ flex: 1, textAlign: 'center' }}>{center}</div>}
    <button onClick={onClose} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
      <X size={14} /> Close
    </button>
  </header>
);
