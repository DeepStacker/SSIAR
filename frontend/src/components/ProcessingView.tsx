import React, { useState, useEffect } from 'react';
import { Search, FileCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { Document } from '../api';
import { DocHeader } from './DocHeader';
import { Card, CardContent } from './ui/card';

const STEPS = [
  { label: 'Running OCR', icon: Search },
  { label: 'Performing alignment', icon: FileCheck },
  { label: 'Running quality checks', icon: CheckCircle2 },
];

interface Props {
  doc: Document;
  onClose: () => void;
  processedCount?: { current: number; total: number };
}

export const ProcessingView: React.FC<Props> = ({ doc, onClose, processedCount }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (stepIndex >= STEPS.length) return;
    const t = setTimeout(() => setStepIndex((i) => i + 1), 2000);
    return () => clearTimeout(t);
  }, [stepIndex]);

  useEffect(() => {
    if (processedCount) return;
    const i = setInterval(() => {
      setDots((p) => (p.length >= 3 ? '' : p + '.'));
    }, 400);
    return () => clearInterval(i);
  }, [processedCount]);

  return (
    <div className="app-container">
      <DocHeader title="SSIAR — Quick Review" onClose={onClose} />
      <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-live="polite">
        <Card className="w-full max-w-md processing-pulse">
          <CardContent className="flex flex-col items-center gap-6 py-8">
            <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-violet)' }} />
            <h3 className="text-[18px] text-[var(--text-secondary)] text-center">
              Processing {doc.filename}
              {!processedCount && <span className="font-mono tracking-wider">{dots}</span>}
            </h3>
            {processedCount && (
              <p className="text-[13px] text-[var(--text-muted)]">
                Processed {processedCount.current} of {processedCount.total} items
              </p>
            )}
            <ol className="flex flex-col gap-3 w-full">
              {STEPS.map(({ label, icon: Icon }, i) => {
                const isCompleted = i < stepIndex;
                const isCurrent = i === stepIndex;
                return (
                  <li key={label} className="flex items-center gap-3">
                    {isCompleted ? (
                      <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                    ) : (
                      <Icon
                        size={18}
                        className={`shrink-0 ${
                          isCurrent
                            ? 'animate-pulse'
                            : 'text-[var(--text-muted)] opacity-40'
                        }`}
                        style={isCurrent ? { color: 'var(--accent-violet)' } : undefined}
                      />
                    )}
                    <span
                      className={
                        isCompleted
                          ? 'text-[var(--text-muted)] line-through opacity-60'
                          : isCurrent
                            ? 'text-[var(--text-secondary)] font-medium'
                            : 'text-[var(--text-muted)] opacity-40'
                      }
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
