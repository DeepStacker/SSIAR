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
      await onUpload(files);
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
      className={`mb-6 border-2 border-dashed rounded-xl p-5 transition-all cursor-pointer ${
        isDragOver
          ? 'border-violet-500 bg-violet-500/5'
          : 'border-border hover:border-violet-300 hover:bg-violet-500/[0.02]'
      } ${isUploading ? 'pointer-events-none opacity-70' : ''}`}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); onDragOver(true); }}
      onDragLeave={() => onDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleFileInput} className="hidden" aria-describedby={descriptionId} />
      <div className="flex items-center justify-center gap-4 pointer-events-none">
        <div className={`p-3 rounded-xl ${isUploading ? 'bg-violet-500/10' : 'bg-muted'}`}>
          {isUploading ? <Loader2 size={24} className="animate-spin text-violet-500" /> : <Upload size={24} className="text-muted-foreground" />}
        </div>
        <div>
          <div className="font-medium text-sm">{isUploading ? `Uploading ${uploadingFilename}...` : 'Upload or drop PDFs'}</div>
          <div id={descriptionId} className="text-xs text-muted-foreground mt-0.5">{isUploading ? 'Processing...' : 'Select multiple files for bulk processing'}</div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 mt-4">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={autoVerify} onChange={e => onAutoVerifyChange(e.target.checked)} className="accent-violet-500" />
          Auto-verify
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={splitPages} onChange={e => onSplitPagesChange(e.target.checked)} className="accent-cyan-500" />
          Split 2-page forms
        </label>
        {failedCount > 0 && (
          <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); onRetryAllFailed(); }} className="text-rose-500 h-7 text-xs">
            <RotateCcw size={12} /> Retry {failedCount}
          </Button>
        )}
      </div>
      <div className="text-center text-[10px] text-muted-foreground mt-2 pointer-events-none">{isUploading ? 'Processing...' : `Max ${MAX_FILE_SIZE_MB}MB per file`}</div>
    </Card>
  );
};
