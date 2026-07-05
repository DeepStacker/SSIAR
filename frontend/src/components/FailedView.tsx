import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Document } from '../api';
import { DocHeader } from './DocHeader';
import { Button } from '@/components/ui/button';

interface Props {
  doc: Document;
  onClose: () => void;
}

export const FailedView: React.FC<Props> = ({ doc, onClose }) => (
  <div className="app-container">
    <DocHeader title="SSIAR" onClose={onClose} />
    <div className="flex items-center justify-center h-[60vh] flex-col gap-4">
      <AlertTriangle size={40} style={{ color: '#f43f5e' }} />
      <h3 className="text-[18px] text-[#f43f5e]">Failed — {doc.filename}</h3>
      <p className="text-[13px] text-[var(--text-muted)]">Processing encountered an error. Try re-uploading or check the backend logs.</p>
      <Button variant="outline" onClick={onClose}>Back to Dashboard</Button>
    </div>
  </div>
);
