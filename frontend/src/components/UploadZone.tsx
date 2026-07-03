import React, { useRef } from 'react';
import { Upload, Loader2, Zap, RotateCcw } from 'lucide-react';
import { api } from '../api';

interface Props {
  uploading: boolean;
  autoVerify: boolean;
  onAutoVerifyChange: (v: boolean) => void;
  onUpload: (files: File[]) => void;
  folderPath: string;
  onFolderPathChange: (v: string) => void;
  batchProcessing: boolean;
  onBatchProcess: () => void;
  failedCount: number;
  onRetryAllFailed: () => void;
  isDragOver: boolean;
  onDragOver: (v: boolean) => void;
}

export const UploadZone: React.FC<Props> = ({
  uploading, autoVerify, onAutoVerifyChange, onUpload,
  folderPath, onFolderPathChange, batchProcessing, onBatchProcess,
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
    <div className="glass"
      style={{ padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', border: isDragOver ? '2px dashed var(--accent-violet)' : '2px dashed transparent' }}
      onDragOver={e => { e.preventDefault(); onDragOver(true); }}
      onDragLeave={() => onDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleFileInput} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div onClick={() => fileInputRef.current?.click()} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{ background: uploading ? 'rgba(139,92,246,0.1)' : 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '50%' }}>
            {uploading ? <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-violet)' }} /> : <Upload size={22} style={{ color: 'var(--accent-emerald)' }} />}
          </div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '14px' }}>Upload or drop PDFs</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-fixes perspective, shadows, and illumination</div>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={autoVerify} onChange={e => onAutoVerifyChange(e.target.checked)} style={{ accentColor: 'var(--accent-violet)' }} />
          Auto-verify
        </label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="text" placeholder="/path/to/pdfs" className="form-input" style={{ width: '200px', fontSize: '12px', padding: '6px 10px' }}
            value={folderPath} onChange={e => onFolderPathChange(e.target.value)} />
          <button onClick={onBatchProcess} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }} disabled={batchProcessing}>
            {batchProcessing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Batch
          </button>
          {failedCount > 0 && (
            <button onClick={onRetryAllFailed} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap', color: '#f43f5e' }}>
              <RotateCcw size={14} /> Retry {failedCount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
