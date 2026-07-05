import React from 'react';
import { StatCardItem, EscBreakdown, TabType } from '../api';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  statCards: StatCardItem[];
  escBreakdown: EscBreakdown | null;
  onTabClick: (tab: TabType) => void;
}

export const StatCards: React.FC<Props> = ({ statCards, escBreakdown, onTabClick }) => (
  <>
    <div className="grid grid-cols-5 gap-3 mb-4">
      {statCards.map(s => (
        <Card key={s.label}
          className={`cursor-pointer ${s.pulse ? 'ring-2 ring-[var(--accent-violet)]' : ''}`}
          tabIndex={0}
          role="button"
          onClick={() => onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType)}
          onKeyDown={e => { if (e.key === 'Enter') onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType); }}>
          <CardContent className="flex flex-col gap-0.5">
            <div className="flex justify-between items-center">
              <div className="text-[11px] text-muted-foreground font-medium">{s.label}</div>
              <s.icon size={16} style={{ color: s.color, opacity: 0.6 }} aria-hidden="true" />
            </div>
            <div className="text-[28px] font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
    {escBreakdown && (
      <Card className="mb-5">
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Level 1 (Clean): <b style={{ color: 'var(--accent-emerald)' }}>{escBreakdown.level_1}</b></span>
          <span>Level 2 (OCR): <b style={{ color: 'var(--accent-amber)' }}>{escBreakdown.level_2}</b></span>
          <span>Level 3 (Mismatch): <b style={{ color: 'var(--accent-rose)' }}>{escBreakdown.level_3}</b></span>
          <span>Level 4 (Damaged): <b style={{ color: 'var(--accent-rose)' }}>{escBreakdown.level_4}</b></span>
        </CardContent>
      </Card>
    )}
  </>
);
