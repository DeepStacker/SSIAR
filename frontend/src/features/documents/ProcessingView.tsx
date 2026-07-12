import React, { useState, useEffect } from 'react';
import { Search, FileCheck, CheckCircle2, Loader2 } from 'lucide-react';
import type { Document } from '@/api';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = [
  { label: 'Running OCR', icon: Search },
  { label: 'Performing alignment', icon: FileCheck },
  { label: 'Running quality checks', icon: CheckCircle2 },
];

interface Props {
  doc: Document;
  processedCount?: { current: number; total: number };
}

export const ProcessingView: React.FC<Props> = ({ doc, processedCount }) => {
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
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-live="polite">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-6 py-8">
          <Loader2 size={40} className="animate-spin text-violet-500" />
          <h3 className="text-base text-muted-foreground text-center font-medium">
            Processing {doc.filename}
            {!processedCount && <span className="font-mono tracking-wider">{dots}</span>}
          </h3>
          {processedCount && (
            <p className="text-xs text-muted-foreground">
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
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                  ) : (
                    <Icon
                      size={18}
                      className={`shrink-0 ${
                        isCurrent
                          ? 'animate-pulse text-violet-500'
                          : 'text-muted-foreground opacity-40'
                      }`}
                    />
                  )}
                  <span
                    className={
                      isCompleted
                        ? 'text-muted-foreground line-through opacity-60 text-sm'
                        : isCurrent
                          ? 'font-medium text-sm'
                          : 'text-muted-foreground opacity-40 text-sm'
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
  );
};
