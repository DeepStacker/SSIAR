import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string; glow: string; label: string }> = {
  processing: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', glow: 'shadow-[0_0_8px_rgba(139,92,246,0.15)]', label: 'Processing' },
  uploaded: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', glow: 'shadow-[0_0_8px_rgba(139,92,246,0.15)]', label: 'Processing' },
  queued: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', glow: 'shadow-[0_0_8px_rgba(139,92,246,0.15)]', label: 'Processing' },
  azure_completed: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', glow: 'shadow-[0_0_8px_rgba(139,92,246,0.15)]', label: 'Processing' },
  validation_completed: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', glow: 'shadow-[0_0_8px_rgba(139,92,246,0.15)]', label: 'Processing' },
  needs_review: { variant: 'secondary', dot: 'bg-amber-500', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.12)]', label: 'Needs Review' },
  review_required: { variant: 'secondary', dot: 'bg-amber-500', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.12)]', label: 'Needs Review' },
  verified: { variant: 'default', dot: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.12)]', label: 'Verified' },
  approved: { variant: 'default', dot: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.12)]', label: 'Verified' },
  exported: { variant: 'default', dot: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.12)]', label: 'Verified' },
  failed: { variant: 'destructive', dot: 'bg-rose-500', glow: 'shadow-[0_0_8px_rgba(244,63,94,0.12)]', label: 'Failed' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = statusConfig[status] || { variant: 'outline' as const, dot: 'bg-muted-foreground', glow: '', label: status };
  return (
    <Badge variant={s.variant} className={`gap-1.5 text-[11px] px-2.5 py-0.5 font-normal rounded-full ${s.glow}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Badge>
  );
}
