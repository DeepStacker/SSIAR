import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Document } from '../api';
import { DocHeader } from './DocHeader';

interface Props {
  doc: Document;
  onClose: () => void;
}

export const FailedView: React.FC<Props> = ({ doc, onClose }) => (
  <div className="app-container">
    <DocHeader title="SSIAR" onClose={onClose} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
      <AlertTriangle size={40} style={{ color: '#f43f5e' }} />
      <h3 style={{ fontSize: '18px', color: '#f43f5e' }}>Failed — {doc.filename}</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Processing encountered an error. Try re-uploading or check the backend logs.</p>
      <button onClick={onClose} className="btn btn-secondary">Back to Dashboard</button>
    </div>
  </div>
);
