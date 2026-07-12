import React from 'react';
import type { StatCardItem, EscBreakdown, TabType } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from './components';


interface Props {
  statCards: StatCardItem[];
  escBreakdown: EscBreakdown | null;
  onTabClick: (tab: TabType) => void;
}

export const StatCards: React.FC<Props> = ({ statCards, escBreakdown, onTabClick }) => (
  <>
    <div className="grid grid-cols-5 gap-3 mb-4">
      {statCards.map((s) => {
        const numericValue = typeof s.value === 'string' ? parseFloat(s.value) : s.value;
        const displayValue = !isNaN(numericValue as number) && typeof s.value === 'number'
          ? formatNumber(s.value as number) : s.value;
        return (
          <Card key={s.label}
            className="cursor-pointer border border-border hover:bg-accent/5 transition-colors"
            tabIndex={0} role="button"
            onClick={() => onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType)}
            onKeyDown={e => { if (e.key === 'Enter') onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType); }}>
            <CardContent className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xl font-semibold tracking-tight mt-0.5">{displayValue}</div>
              </div>
              <s.icon size={16} className="text-muted-foreground" aria-hidden="true" />
            </CardContent>
          </Card>
        );
      })}
    </div>

    {escBreakdown && (
      <div className="flex items-center gap-4 px-4 py-2 mb-4 rounded-md border border-border bg-card text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Quality:</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> L1 <strong className="text-foreground">{formatNumber(escBreakdown.level_1)}</strong></span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> L2 <strong className="text-foreground">{formatNumber(escBreakdown.level_2)}</strong></span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> L3 <strong className="text-foreground">{formatNumber(escBreakdown.level_3)}</strong></span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-700" /> L4 <strong className="text-foreground">{formatNumber(escBreakdown.level_4)}</strong></span>
      </div>
    )}
  </>
);
