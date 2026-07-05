import React, { useRef } from 'react';
import { Upload, Loader2, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  uploading: boolean;
  autoVerify: boolean;
  onAutoVerifyChange: (v: boolean) => void;
  splitPages: boolean;
  onSplitPagesChange: (v: boolean) => void;
  onUpload: (files: File[]) => void;
  failedCount: number;
  onRetryAllFailed: () => void;
  isDragOver: boolean;
  onDragOver: (v: boolean) => void;
}

export const UploadZone: React.FC<Props> = ({
  uploading, autoVerify, onAutoVerifyChange, splitPages, onSplitPagesChange, onUpload,
  failedCount, onRetryAllFailed, isDragOver, onDragOver,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
    if (files.length) onUpload(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onUpload(Array.from(e.target.files));
  };

  return (
    <Card
      style={{ padding: '20px', marginBottom: '20px', border: isDragOver ? '2px dashed var(--accent-violet)' : '2px dashed transparent' }}
      onDragOver={e => { e.preventDefault(); onDragOver(true); }}
      onDragLeave={() => onDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleFileInput} style={{ display: 'none' }} />
      <div className="flex items-center gap-4 flex-wrap">
        <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer flex items-center gap-2.5 flex-1 min-w-[200px]">
          <div style={{ background: uploading ? 'rgba(139,92,246,0.1)' : 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '50%' }}>
            {uploading ? <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-violet)' }} /> : <Upload size={22} style={{ color: 'var(--accent-emerald)' }} />}
          </div>
          <div>
            <div className="font-semibold text-sm">Upload or drop PDFs</div>
            <div className="text-xs text-muted-foreground">Select multiple files for bulk processing</div>
          </div>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs whitespace-nowrap">
          <input type="checkbox" checked={autoVerify} onChange={e => onAutoVerifyChange(e.target.checked)} className="accent-violet-500" />
          Auto-verify
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs whitespace-nowrap">
          <input type="checkbox" checked={splitPages} onChange={e => onSplitPagesChange(e.target.checked)} className="accent-cyan-500" />
          Split 2-page forms
        </label>
        <div>
          {failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onRetryAllFailed} className="text-rose-500 whitespace-nowrap">
              <RotateCcw size={14} /> Retry {failedCount}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
