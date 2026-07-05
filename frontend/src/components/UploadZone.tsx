import React, { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';

const MAX_FILE_SIZE_MB = 300;

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
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionId = 'upload-description';
  const [uploadingFilename, setUploadingFilename] = useState<string>('');
  const [localUploading, setLocalUploading] = useState(false);

  const isUploading = uploading || localUploading;

  useEffect(() => {
    if (!isUploading) setUploadingFilename('');
  }, [isUploading]);

  const doUpload = async (files: File[]) => {
    if (!files.length) return;
    setUploadingFilename(files[0].name);
    setLocalUploading(true);
    try {
      onUpload(files);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setLocalUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
    await doUpload(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) doUpload(Array.from(e.target.files));
  };

  return (
    <Card
      style={{ marginBottom: '20px' }}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragOver ? 'border-[var(--accent-violet)] bg-[var(--bg-highlight)]' : 'border-[var(--color-border)]'}`}
      onDragOver={e => { e.preventDefault(); onDragOver(true); }}
      onDragLeave={() => onDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleFileInput} style={{ display: 'none' }} aria-describedby={descriptionId} />
      <div className="flex items-center gap-4 flex-wrap">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); }}}
          className="cursor-pointer flex items-center gap-2.5 flex-1 min-w-[200px]"
        >
          <div style={{ background: isUploading ? 'rgba(139,92,246,0.1)' : 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '50%' }}>
            {isUploading ? <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-violet)' }} /> : <Upload size={22} style={{ color: 'var(--accent-emerald)' }} />}
          </div>
          <div>
            <div className="font-semibold text-sm">{isUploading ? `Uploading ${uploadingFilename}...` : 'Upload or drop PDFs'}</div>
            <div id={descriptionId} className="text-xs text-muted-foreground">{isUploading ? 'Processing...' : 'Select multiple files for bulk processing'}</div>
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
      {!isUploading && (
        <div className="text-xs text-muted-foreground mt-3">Max {MAX_FILE_SIZE_MB}MB per file</div>
      )}
    </Card>
  );
};
