import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border/80 bg-card px-6 py-5 shadow-[var(--shadow-sm)] lg:flex-row lg:items-end lg:justify-between',
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </h1>
          {description && (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
