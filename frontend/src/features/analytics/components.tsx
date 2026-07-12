export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-[var(--color-border)] ${className}`} />
  );
}

export function ExecutiveSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-64 mb-2" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <SkeletonCard key={i} className="h-24" />)}
      </div>
      <SkeletonCard className="h-4 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[250px]" />
        <SkeletonCard className="h-[250px]" />
      </div>
    </div>
  );
}

export function DemographicsSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[230px]" />
        <SkeletonCard className="h-[230px]" />
      </div>
      <SkeletonCard className="h-[200px]" />
    </div>
  );
}

export function SdgSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <SkeletonCard className="h-[120px]" />
      <SkeletonCard className="h-4 w-48" />
      <SkeletonCard className="h-[300px]" />
    </div>
  );
}

export function AcademicSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[300px]" />
        <SkeletonCard className="h-[300px]" />
      </div>
      <SkeletonCard className="h-[250px]" />
    </div>
  );
}

export function DataQualitySkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <SkeletonCard className="h-4 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
      </div>
      {[1,2].map(i => <SkeletonCard key={i} className="h-32" />)}
    </div>
  );
}

export function DonutChart({ percentage, size = 100, strokeWidth = 8, color = 'var(--accent-violet)' }: { percentage: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize={size * 0.16} fontWeight="bold">
        {percentage}%
      </text>
    </svg>
  );
}

export function Sparkline({ data, width = 100, height = 28, color = 'var(--accent-violet)' }: { data: Array<{ date: string; count: number }>; width?: number; height?: number; color?: string }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => d.count);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const padding = 2;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((d.count - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle cx={points.split(' ').pop()!.split(',')[0]} cy={points.split(' ').pop()!.split(',')[1]} r="3" fill={color} />
    </svg>
  );
}

export function TrendBadge({ value }: { value: number }) {
  if (value > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent-emerald)]">↑ +{value}</span>;
  if (value < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent-rose)]">↓ {value}</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--text-muted)]">→ 0</span>;
}

export function ScoreBand({ value }: { value: number }) {
  if (value >= 75) return <span className="font-semibold text-[var(--accent-emerald)]">{value}%</span>;
  if (value >= 50) return <span className="font-semibold text-[var(--accent-amber)]">{value}%</span>;
  return <span className="font-semibold text-[var(--accent-rose)]">{value}%</span>;
}

export const escalationBadgeColors: Record<string, string> = {
  level_1: 'bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)] border-[var(--accent-emerald)]/30',
  level_2: 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] border-[var(--accent-amber)]/30',
  level_3: 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)] border-[var(--accent-rose)]/30',
  level_4: 'bg-[var(--accent-rose)]/25 text-[var(--accent-rose)] border-[var(--accent-rose)]/40',
};

export const escalationLabels: Record<string, string> = {
  level_1: 'L1 · Clean',
  level_2: 'L2 · Field warning',
  level_3: 'L3 · Alignment',
  level_4: 'L4 · Poor quality / failed',
};
