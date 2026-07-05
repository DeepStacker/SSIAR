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
    <div className="flex items-center justify-center h-[60vh] flex-col gap-4">
      <div className="processing-pulse"><Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-violet)' }} /></div>
      <h3 className="text-[18px] text-[var(--text-secondary)]">Processing {doc.filename}...</h3>
      <p className="text-[13px] text-[var(--text-muted)]">Running OCR, alignment, and quality checks. Auto-refreshing...</p>
    </div>
  </div>
);
