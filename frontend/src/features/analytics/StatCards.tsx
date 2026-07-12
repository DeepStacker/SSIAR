import React from 'react';
import type { StatCardItem, EscBreakdown, TabType } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Layers } from 'lucide-react';
import { formatNumber } from './components';

const styleMap: Record<string, { text: string; bg: string; border: string }> = {
  'var(--accent-cyan)': { text: 'text-cyan-400', bg: 'bg-cyan-950/20', border: 'border-cyan-500/20' },
  'var(--accent-violet)': { text: 'text-indigo-400', bg: 'bg-indigo-950/20', border: 'border-indigo-500/20' },
  'var(--accent-amber)': { text: 'text-amber-400', bg: 'bg-amber-950/20', border: 'border-amber-500/20' },
  'var(--accent-emerald)': { text: 'text-emerald-400', bg: 'bg-emerald-950/20', border: 'border-emerald-500/20' },
  'var(--accent-rose)': { text: 'text-rose-400', bg: 'bg-rose-950/20', border: 'border-rose-500/20' },
};

interface Props {
  statCards: StatCardItem[];
  escBreakdown: EscBreakdown | null;
  onTabClick: (tab: TabType) => void;
}

export const StatCards: React.FC<Props> = ({ statCards, escBreakdown, onTabClick }) => (
  <>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {statCards.map((s, i) => {
        const st = styleMap[s.color] || { text: 'text-foreground', bg: 'bg-accent/10', border: 'border-border' };
        const numericValue = typeof s.value === 'string' ? parseFloat(s.value) : s.value;
        const displayValue = !isNaN(numericValue as number) && typeof s.value === 'number'
          ? formatNumber(s.value as number)
          : s.value;
        return (
          <Card key={s.label}
            className={`cursor-pointer glass-card border border-white/5 relative overflow-hidden animate-chart-enter ${s.pulse ? 'ring-1 ring-indigo-500/50' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}
            tabIndex={0}
            role="button"
            onClick={() => onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType)}
            onKeyDown={e => { if (e.key === 'Enter') onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType); }}
          >
            <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full" style={{ backgroundColor: s.color }} />
            <CardContent className="p-5 flex flex-col justify-between h-full min-h-[100px]">
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${st.border} ${st.bg}`}>
                  <s.icon size={14} className={st.text} aria-hidden="true" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">{displayValue}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    {escBreakdown && (
      <Card className="mb-6 glass-card animate-chart-enter">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3.5 px-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-indigo-400" />
            <span className="font-semibold text-foreground">Ingestion Quality Cohorts:</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Level 1 (Clean): <strong className="text-foreground">{formatNumber(escBreakdown.level_1)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Level 2 (Warnings): <strong className="text-foreground">{formatNumber(escBreakdown.level_2)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Level 3 (Alignment): <strong className="text-foreground">{formatNumber(escBreakdown.level_3)}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-700" />
              Level 4 (Poor quality): <strong className="text-foreground">{formatNumber(escBreakdown.level_4)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>
    )}
  </>
);
