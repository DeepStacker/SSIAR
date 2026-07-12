import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StateScreenProps {
  title: string;
  description: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateScreen({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: StateScreenProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--color-primary-alpha08),transparent_40%)]" />
      <div className="relative z-10 w-full max-w-xl rounded-3xl border border-border/80 bg-card p-8 text-center shadow-[var(--shadow-lg)]">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/80 bg-muted text-muted-foreground">
          {icon ?? <AlertTriangle className="h-6 w-6" />}
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
            {title}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction && (
          <div className="mt-8">
            <Button onClick={onAction}>{actionLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
