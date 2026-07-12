import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  compact?: boolean;
  subtitle?: string;
}

export function AppLogo({ className, compact = false, subtitle }: AppLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card">
        <span className="text-sm font-bold tracking-tight text-foreground">S</span>
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-foreground">
            SSIAR
          </div>
          {subtitle && (
            <div className="truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
