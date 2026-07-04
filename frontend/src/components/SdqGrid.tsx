import React from 'react';
import { ZoomImage } from '../api';
import { api } from '../api';

interface Props {
  docId: string;
  responses: Record<string, number | number[]>;
  checkboxConf: Record<string, string>;
  multiTicks: Record<string, number[]>;
  onChange: (responses: Record<string, number | number[]>) => void;
  onZoom: (img: ZoomImage | null) => void;
}

export const SdqGrid: React.FC<Props> = ({ docId, responses, checkboxConf, multiTicks: _multiTicks, onChange, onZoom }) => {
  const getCheckboxConf = (q: string): 'high' | 'medium' | 'low' => {
    const c = checkboxConf[q];
    if (c === 'low_confidence' || c === 'low') return 'low';
    if (c === 'medium' || c === 'medium_confidence') return 'medium';
    return 'high';
  };

  return (
    <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>SDQ Responses (Q1–Q25)</h3>
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          {Array.from({ length: 25 }, (_, i) => `q${i + 1}`).filter(q => getCheckboxConf(q) === 'high').length} high confidence
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {Array.from({ length: 25 }, (_, i) => {
          const qi = i + 1;
          const q = `q${qi}`;
          const raw = responses[q];
          const isMulti = Array.isArray(raw) && raw.filter(x => x > 0).length > 1;
          const confLevel = getCheckboxConf(q);
          const cellColor = isMulti ? '#a855f7' : (confLevel === 'high' ? 'var(--accent-emerald)' : confLevel === 'medium' ? 'var(--accent-amber)' : '#f43f5e');
          return (
            <div key={q} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '8px',
              background: isMulti ? 'rgba(168,85,247,0.08)' : 'rgba(0,0,0,0.08)',
              border: `1px solid ${isMulti ? 'rgba(168,85,247,0.25)' : 'transparent'}`,
            }}>
              <div style={{ width: '24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', flexShrink: 0 }}>Q{qi}</div>
              <img src={api.getCropUrl(docId, `${q}.png`)} alt={q}
                style={{ width: '160px', height: '50px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', cursor: 'zoom-in', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                onMouseEnter={e => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onZoom({ src: api.getCropUrl(docId, `${q}.png`), x: rect.left + rect.width / 2, y: rect.top });
                }}
                onMouseMove={e => onZoom({ src: api.getCropUrl(docId, `${q}.png`), x: e.clientX, y: e.clientY - 20 })}
                onMouseLeave={() => onZoom(null)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end', flex: 1, flexShrink: 0 }}>
                <span style={{ fontSize: '24px', fontWeight: '800', color: cellColor, flexShrink: 0, minWidth: '30px', textAlign: 'center' }}>
                  {(() => {
                    const r = responses[q];
                    if (r === undefined || r === -1) return '—';
                    if (Array.isArray(r)) {
                      const f = r.filter(x => x > 0);
                      return f.length > 0 ? f.join(',') : '—';
                    }
                    return r;
                  })()}
                  {isMulti && <span style={{ marginLeft: '2px', fontSize: '10px', color: '#a855f7' }}>✦</span>}
                </span>
                <span style={{ width: '1px', height: '24px', background: 'var(--color-border)', flexShrink: 0, display: 'inline-block' }}></span>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {[1, 2, 3, 0].map(v => {
                    const cur = responses[q];
                    const selected = Array.isArray(cur) ? cur.includes(v) : cur === v;
                    return (
                      <button key={v} onClick={() => {
                        let next: number | number[];
                        if (v === 0) {
                          next = cur === 0 ? -1 : 0;
                        } else if (Array.isArray(cur)) {
                          next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
                          if (next.length === 0) next = [-1];
                        } else if (cur === v) {
                          next = -1;
                        } else if (cur === -1 || cur === undefined) {
                          next = [v];
                        } else {
                          next = [cur as number, v];
                        }
                        onChange({ ...responses, [q]: next });
                      }}
                        style={{
                          padding: '4px 10px', borderRadius: '4px', border: '2px solid',
                          background: selected ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.15)',
                          borderColor: selected ? 'var(--accent-violet)' : 'var(--color-border)',
                          color: selected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: '14px', fontWeight: '700', lineHeight: '1.3',
                        }}>
                        {v === 0 ? '✗' : v}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
