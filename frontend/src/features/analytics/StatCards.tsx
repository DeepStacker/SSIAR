import React from 'react';
import type { StatCardItem, EscBreakdown, TabType } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from './components';

interface Props {
  statCards: StatCardItem[];
  escBreakdown: EscBreakdown | null;
  onTabClick: (tab: TabType) => void;
}

const CARD_STYLES: Record<string, { gradient: string; iconBg: string; dot: string }> = {
  Total: { gradient: 'from-blue-500/5 to-blue-600/5', iconBg: 'bg-blue-500/10 text-blue-500', dot: 'bg-blue-500' },
  Verified: { gradient: 'from-emerald-500/5 to-emerald-600/5', iconBg: 'bg-emerald-500/10 text-emerald-500', dot: 'bg-emerald-500' },
  Processing: { gradient: 'from-amber-500/5 to-amber-600/5', iconBg: 'bg-amber-500/10 text-amber-500', dot: 'bg-amber-500' },
  ['Needs Review']: { gradient: 'from-violet-500/5 to-violet-600/5', iconBg: 'bg-violet-500/10 text-violet-500', dot: 'bg-violet-500' },
  Failed: { gradient: 'from-rose-500/5 to-rose-600/5', iconBg: 'bg-rose-500/10 text-rose-500', dot: 'bg-rose-500' },
};

const ESC_COLORS = [
  { key: 'level_1' as const, label: 'L1', color: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  { key: 'level_2' as const, label: 'L2', color: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
  { key: 'level_3' as const, label: 'L3', color: 'bg-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-500' },
  { key: 'level_4' as const, label: 'L4', color: 'bg-rose-700', bg: 'bg-rose-700/10', text: 'text-rose-700' },
];

export const StatCards: React.FC<Props> = React.memo(({ statCards, escBreakdown, onTabClick }) => {
  const total = escBreakdown
    ? escBreakdown.level_1 + escBreakdown.level_2 + escBreakdown.level_3 + escBreakdown.level_4
    : 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mb-4">
        {statCards.map((s) => {
          const style = CARD_STYLES[s.label] || CARD_STYLES.Total;
          const displayValue = formatNumber(s.value);
          const tab = s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType;
          return (
            <Card key={s.label}
              className="group cursor-pointer border-border/60 hover:border-border transition-all duration-200 hover:shadow-sm overflow-hidden"
              tabIndex={0} role="button"
              onClick={() => onTabClick(tab)}
              onKeyDown={e => { if (e.key === 'Enter') onTabClick(tab); }}>
              <CardContent className="p-0">
                <div className={`bg-gradient-to-br ${style.gradient} px-4 py-3`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className={`w-8 h-8 rounded-lg ${style.iconBg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                      <s.icon size={15} />
                    </div>
                    {'pulse' in s && s.pulse && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                  <div className="text-xl font-bold tracking-tight">{displayValue}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {escBreakdown && total > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-border/60 bg-card">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-foreground">Quality Distribution</span>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {ESC_COLORS.map(esc => (
                <span key={esc.key} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${esc.color}`} />
                  <span>{esc.label} <strong className="text-foreground">{formatNumber(escBreakdown[esc.key])}</strong></span>
                </span>
              ))}
            </div>
          </div>
          <div className="w-full h-2.5 bg-muted/50 rounded-full overflow-hidden flex">
            {ESC_COLORS.map(esc => {
              const val = escBreakdown[esc.key];
              const pct = total > 0 ? (val / total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div key={esc.key}
                  className={`${esc.color} first:rounded-l-full last:rounded-r-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${esc.label}: ${val} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
        </div>
      )}
    </>
  );
});
