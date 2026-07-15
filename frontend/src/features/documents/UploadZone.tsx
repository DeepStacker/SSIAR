import React, { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, RotateCcw, FileText, CheckCircle2 } from 'lucide-react';
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

export const UploadZone: React.FC<Props> = React.memo(({
  uploading, autoVerify, onAutoVerifyChange, splitPages, onSplitPagesChange, onUpload,
  failedCount, onRetryAllFailed, isDragOver, onDragOver,
}) => {
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionId = 'upload-description';
  const [uploadingFilename, setUploadingFilename] = useState<string>('');
  const [localUploading, setLocalUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const isUploading = uploading || localUploading;

  useEffect(() => {
    if (!isUploading) setUploadingFilename('');
  }, [isUploading]);

  useEffect(() => {
    if (uploadSuccess) {
      const timer = setTimeout(() => setUploadSuccess(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [uploadSuccess]);

  useEffect(() => {
    if (!isUploading) {
      setUploadProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);
    return () => clearInterval(interval);
  }, [isUploading]);

  const doUpload = async (files: File[]) => {
    if (!files.length) return;
    setUploadingFilename(files[0].name);
    setLocalUploading(true);
    setUploadProgress(0);
    try {
      await onUpload(files);
      setUploadProgress(100);
      setUploadSuccess(true);
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
      className={`mb-6 border-2 border-dashed rounded-2xl p-4 sm:p-6 transition-all duration-300 cursor-pointer ${
        uploadSuccess
          ? 'border-emerald-500/60 bg-emerald-500/[0.04] shadow-[0_0_25px_rgba(16,185,129,0.08)]'
          : isDragOver
          ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.08)] scale-[1.02]'
          : 'border-border/60 bg-[var(--bg-secondary)]/40 hover:border-indigo-500/30 hover:bg-[var(--bg-secondary)]/60'
      } ${isUploading ? 'pointer-events-none opacity-70' : ''}`}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); onDragOver(true); }}
      onDragLeave={() => onDragOver(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !isUploading && fileInputRef.current?.click(); } }}
    >
      <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleFileInput} className="hidden" aria-describedby={descriptionId} />
      <div className="flex flex-col sm:flex-row items-center justify-between gap-5 pointer-events-none w-full">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
            uploadSuccess
              ? 'bg-emerald-500/15 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
              : isUploading || isDragOver
              ? 'bg-indigo-500/15 border-indigo-500/30 scale-110 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
              : 'bg-muted/30 border-border/40'
          }`}>
            {uploadSuccess ? (
              <CheckCircle2 size={24} className="text-emerald-400" />
            ) : isUploading ? (
              <Loader2 size={24} className="animate-spin text-indigo-400" />
            ) : (
              <Upload size={24} className={isDragOver ? 'text-indigo-400' : 'text-muted-foreground'} />
            )}
          </div>
          <div className="text-left">
            <div className="font-semibold text-sm text-foreground">
              {uploadSuccess ? 'Upload complete!' : isUploading ? `Uploading ${uploadingFilename}...` : 'Upload or drop PDFs'}
            </div>
            <div id={descriptionId} className="text-xs text-muted-foreground mt-0.5">
              {uploadSuccess ? 'Document queued for processing' : isUploading ? 'Processing document layouts...' : 'Drag & drop research PDFs or click to browse'}
            </div>
            {isUploading && (
              <div className="mt-2 w-full max-w-[200px] h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-indigo-500 to-violet-500 shadow-[0_0_6px_rgba(99,102,241,0.3)]" style={{ width: `${Math.min(uploadProgress, 100)}%` }} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <input type="checkbox" checked={autoVerify} onChange={e => onAutoVerifyChange(e.target.checked)} className="rounded border-border text-indigo-600 focus:ring-indigo-500 h-4 w-4 accent-indigo-500" />
            Auto-verify
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <input type="checkbox" checked={splitPages} onChange={e => onSplitPagesChange(e.target.checked)} className="rounded border-border text-indigo-600 focus:ring-indigo-500 h-4 w-4 accent-indigo-500" />
            Split 2-page forms
          </label>
          {failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onRetryAllFailed} className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10 h-7 text-[11px] font-semibold">
              <RotateCcw size={10} className="mr-1.5" /> Retry Failed ({failedCount})
            </Button>
          )}
        </div>
      </div>
      <div className="text-left text-[10px] text-muted-foreground/60 mt-4 pointer-events-none border-t border-border/30 pt-3 w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
        <span className="flex items-center gap-1.5">
          <FileText size={10} />
          {isUploading ? 'Ingesting PDF data structures...' : `PDF files up to ${MAX_FILE_SIZE_MB}MB`}
        </span>
        <span className="text-indigo-400/80 font-medium">{isUploading ? 'Please wait...' : isDragOver ? 'Drop files here' : 'Click to browse'}</span>
      </div>
    </Card>
  );
});
