import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string; label: string }> = {
  processing: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', label: 'Processing' },
  uploaded: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', label: 'Processing' },
  queued: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', label: 'Processing' },
  azure_completed: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', label: 'Processing' },
  validation_completed: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', label: 'Processing' },
  needs_review: { variant: 'secondary', dot: 'bg-amber-500', label: 'Needs Review' },
  review_required: { variant: 'secondary', dot: 'bg-amber-500', label: 'Needs Review' },
  verified: { variant: 'default', dot: 'bg-emerald-500', label: 'Verified' },
  approved: { variant: 'default', dot: 'bg-emerald-500', label: 'Verified' },
  exported: { variant: 'default', dot: 'bg-emerald-500', label: 'Verified' },
  failed: { variant: 'destructive', dot: 'bg-rose-500', label: 'Failed' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = statusConfig[status] || { variant: 'outline' as const, dot: 'bg-muted-foreground', label: status };
  return (
    <Badge variant={s.variant} className="gap-1.5 text-[11px] px-2.5 py-0.5 font-normal rounded-full">
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Badge>
  );
}
