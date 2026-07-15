import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  selectedCount: number;
  docIds: string[];
  onDone: () => void;
  onBulkVerify?: (docIds: string[]) => void;
  onBulkReprocess?: (docIds: string[]) => void;
  onBulkDelete?: (docIds: string[]) => void;
}

export const BulkActionBar: React.FC<Props> = ({ selectedCount, docIds, onDone, onBulkVerify, onBulkReprocess, onBulkDelete }) => {
  if (!selectedCount) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
      <span className="text-sm font-semibold text-foreground">{selectedCount} selected</span>
      {onBulkVerify && (
        <Button variant="default" size="sm" onClick={() => { onBulkVerify(docIds); onDone(); }}>
          <Check size={14} /> Verify
        </Button>
      )}
      {onBulkReprocess && (
        <Button variant="outline" size="sm" onClick={() => { onBulkReprocess(docIds); onDone(); }}>
          <RotateCcw size={14} /> Reprocess
        </Button>
      )}
      {onBulkDelete && (
        <Button variant="destructive" size="sm" onClick={() => { onBulkDelete(docIds); onDone(); }} className="ml-auto">
          <Trash2 size={14} /> Delete
        </Button>
      )}
    </div>
  );
};
