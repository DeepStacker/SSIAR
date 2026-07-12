import React from 'react';
import type { StatCardItem, EscBreakdown, TabType } from '../api';
import { Card, CardContent } from '@/components/ui/card';

const styleMap: Record<string, { text: string; bg: string; ring: string }> = {
  'var(--accent-cyan)': { text: 'text-cyan-500 dark:text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/30' },
  'var(--accent-violet)': { text: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-500/10', ring: 'ring-violet-500/30' },
  'var(--accent-amber)': { text: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/30' },
  'var(--accent-emerald)': { text: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
  'var(--accent-rose)': { text: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/30' },
};

interface Props {
  statCards: StatCardItem[];
  escBreakdown: EscBreakdown | null;
  onTabClick: (tab: TabType) => void;
}

export const StatCards: React.FC<Props> = ({ statCards, escBreakdown, onTabClick }) => (
  <>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {statCards.map(s => {
        const st = styleMap[s.color] || { text: 'text-foreground', bg: 'bg-muted', ring: 'ring-border' };
        return (
          <Card key={s.label}
            className={`cursor-pointer transition-all hover:shadow-sm hover:-translate-y-0.5 ${s.pulse ? `ring-2 ${st.ring}` : ''}`}
            tabIndex={0}
            role="button"
            onClick={() => onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType)}
            onKeyDown={e => { if (e.key === 'Enter') onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${st.bg}`}>
                  <s.icon size={16} className={st.text} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className={`text-xl font-bold leading-none tracking-tight ${st.text}`}>{s.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
    {escBreakdown && (
      <Card className="mb-6">
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1.5 py-3 text-xs text-muted-foreground">
          <span>Level 1 (Clean): <b className="text-emerald-500">{escBreakdown.level_1}</b></span>
          <span>Level 2 (Field warning): <b className="text-amber-500">{escBreakdown.level_2}</b></span>
          <span>Level 3 (Alignment): <b className="text-rose-500">{escBreakdown.level_3}</b></span>
          <span>Level 4 (Poor quality): <b className="text-rose-500">{escBreakdown.level_4}</b></span>
        </CardContent>
      </Card>
    )}
  </>
);