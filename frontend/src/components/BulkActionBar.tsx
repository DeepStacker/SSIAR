import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import { Button } from '@/components/ui/button';

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
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-[var(--bg-highlight)]">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{selectedCount} selected</span>
      <Button variant="default" size="sm" onClick={handleBulkVerify}>
        <Check size={14} /> Verify
      </Button>
      <Button variant="outline" size="sm" onClick={handleBulkReprocess}>
        <RotateCcw size={14} /> Reprocess
      </Button>
      <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="ml-auto">
        <Trash2 size={14} /> Delete
      </Button>
    </div>
  );
};
