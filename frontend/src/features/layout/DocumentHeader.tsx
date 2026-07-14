import React from 'react';
import { X, FileText, Calendar, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  onClose: () => void;
  center?: React.ReactNode;
  filename?: string;
  createdAt?: string;
  status?: string;
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  needs_review: { color: 'var(--accent-amber)', label: 'Needs Review' },
  review: { color: 'var(--accent-amber)', label: 'Needs Review' },
  verified: { color: 'var(--accent-emerald)', label: 'Verified' },
  processing: { color: 'var(--accent-violet)', label: 'Processing' },
  failed: { color: 'var(--accent-rose)', label: 'Failed' },
};

export const DocumentHeader: React.FC<Props> = ({ title, onClose, center, filename, createdAt, status }) => {
  const statusStyle = status ? STATUS_STYLES[status] : null;
  const formattedDate = createdAt ? new Date(createdAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : null;

  return (
    <header className="flex items-center justify-between mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <h1 className="text-base sm:text-lg font-extrabold tracking-tight truncate">{title}</h1>
        {(filename || formattedDate || statusStyle) && (
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-[var(--text-muted)] ml-2 pl-3 border-l border-[var(--color-border)]">
            {filename && (
              <span className="flex items-center gap-1 truncate max-w-[140px] lg:max-w-[200px]">
                <FileText size={11} className="shrink-0" />
                {filename}
              </span>
            )}
            {formattedDate && (
              <span className="flex items-center gap-1 shrink-0">
                <Calendar size={11} />
                {formattedDate}
              </span>
            )}
            {statusStyle && (
              <span
                className="flex items-center gap-1 shrink-0 font-semibold px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  color: statusStyle.color,
                  background: `${statusStyle.color}15`,
                }}
              >
                <Circle size={6} className="shrink-0" fill={statusStyle.color} stroke="none" />
                {statusStyle.label}
              </span>
            )}
          </div>
        )}
      </div>
      {center && <div className="flex-1 text-center mx-4">{center}</div>}
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close document" title="Close document (Esc)" className="gap-1.5 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <X size={14} /> Close
      </Button>
    </header>
  );
};
