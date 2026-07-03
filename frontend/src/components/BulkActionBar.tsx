import React from 'react';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import { Document } from '../api';

interface Props {
  selectedCount: number;
  docIds: string[];
  onDone: () => void;
}

export const BulkActionBar: React.FC<Props> = ({ selectedCount, docIds, onDone }) => {
  const { show } = useToast();

  const handleBulkVerify = async () => {
    if (!confirm(`Verify ${selectedCount} selected documents?`)) return;
    try {
      await api.bulkVerify(docIds);
      show(`Verified ${selectedCount} documents`);
      onDone();
    } catch { show("Bulk verify failed", 'error'); }
  };

  const handleBulkReprocess = async () => {
    if (!confirm(`Reprocess ${selectedCount} selected documents?`)) return;
    try {
      await Promise.all(docIds.map(id => api.reprocessDocument(id)));
      show(`Reprocessing ${selectedCount} documents`);
      onDone();
    } catch { show("Bulk reprocess failed", 'error'); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedCount} selected documents?`)) return;
    try {
      await api.bulkDelete(docIds);
      show(`Deleted ${selectedCount} documents`);
      onDone();
    } catch { show("Bulk delete failed", 'error'); }
  };

  if (!selectedCount) return null;

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-highlight)' }}>
      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{selectedCount} selected</span>
      <button onClick={handleBulkVerify} className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }}>
        <Check size={12} /> Verify
      </button>
      <button onClick={handleBulkReprocess} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>
        <RotateCcw size={12} /> Reprocess
      </button>
      <button onClick={handleBulkDelete} className="btn btn-danger" style={{ padding: '4px 12px', fontSize: '12px', marginLeft: 'auto' }}>
        <Trash2 size={12} /> Delete
      </button>
    </div>
  );
};
