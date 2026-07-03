import React from 'react';
import { FileText, Clock, AlertTriangle, Check, X } from 'lucide-react';
import { StatCardItem, EscBreakdown, TabType } from '../api';

interface Props {
  statCards: StatCardItem[];
  escBreakdown: EscBreakdown | null;
  onTabClick: (tab: TabType) => void;
}

export const StatCards: React.FC<Props> = ({ statCards, escBreakdown, onTabClick }) => (
  <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
      {statCards.map(s => (
        <div key={s.label} className={`glass ${s.pulse ? 'card-processing' : ''}`}
          onClick={() => onTabClick(s.label === 'Total' ? 'all' : s.label.toLowerCase().replace(' ', '_') as TabType)}
          style={{ padding: '16px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>{s.label}</div>
            <s.icon size={16} style={{ color: s.color, opacity: 0.6 }} />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: s.color, marginTop: '4px' }}>{s.value}</div>
        </div>
      ))}
    </div>
    {escBreakdown && (
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span>Level 1 (Clean): <b style={{ color: 'var(--accent-emerald)' }}>{escBreakdown.level_1}</b></span>
        <span>Level 2 (OCR): <b style={{ color: 'var(--accent-amber)' }}>{escBreakdown.level_2}</b></span>
        <span>Level 3 (Mismatch): <b style={{ color: 'var(--accent-rose)' }}>{escBreakdown.level_3}</b></span>
        <span>Level 4 (Damaged): <b style={{ color: 'var(--accent-rose)' }}>{escBreakdown.level_4}</b></span>
      </div>
    )}
  </>
);
