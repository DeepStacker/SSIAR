import React from 'react';
import { Loader2 } from 'lucide-react';
import { Document } from '../api';
import { DocHeader } from './DocHeader';

interface Props {
  doc: Document;
  onClose: () => void;
}

export const ProcessingView: React.FC<Props> = ({ doc, onClose }) => (
  <div className="app-container">
    <DocHeader title="SSIAR — Quick Review" onClose={onClose} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
      <div className="processing-pulse"><Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-violet)' }} /></div>
      <h3 style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>Processing {doc.filename}...</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Running OCR, alignment, and quality checks. Auto-refreshing...</p>
    </div>
  </div>
);
