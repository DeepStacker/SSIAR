import React, { memo, useCallback, useRef } from 'react';
import { ZoomImage } from '../api';
import { api } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { CanvasCrop } from './CanvasCrop';

interface Props {
  docId: string;
  responses: Record<string, number | number[]>;
  checkboxConf: Record<string, string>;
  multiTicks?: Record<string, number[]>;
  v2Trust: Record<string, any>;
  onChange: (responses: Record<string, number | number[]>) => void;
  onZoom: (img: ZoomImage | null) => void;
}

const toggleValue = (cur: number | number[] | undefined, v: number): number | number[] => {
  if (v === 0) return cur === 0 ? -1 : 0;
  if (Array.isArray(cur)) {
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    return next.length === 0 ? [-1] : next;
  }
  if (cur === v) return -1;
  if (cur === -1 || cur === undefined) return [v];
  return [cur as number, v];
};

const SdqGridComponent: React.FC<Props> = ({ docId, responses, checkboxConf, v2Trust, onChange, onZoom }) => {
  // Store data URLs for zoom
  const dataUrls = useRef<Record<string, string>>({});

  const getCheckboxConf = (q: string): 'high' | 'medium' | 'low' => {
    const c = checkboxConf[q];
    if (c === 'low_confidence' || c === 'low') return 'low';
    if (c === 'medium' || c === 'medium_confidence') return 'medium';
    return 'high';
  };

  const handleZoom = useCallback((q: string, x: number, y: number) => {
    const src = dataUrls.current[q];
    if (src) onZoom({ src, x, y });
  }, [onZoom]);

  return (
    <Card className="mb-5">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base text-[var(--text-secondary)]">SDQ Responses (Q1–Q25)</h3>
          <span className="text-sm text-[var(--text-muted)]">
            {Array.from({ length: 25 }, (_, i) => `q${i + 1}`).filter(q => getCheckboxConf(q) === 'high').length} high confidence
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => {
            const qi = i + 1;
            const q = `q${qi}`;
            const raw = responses[q];
            const isMulti = Array.isArray(raw) && raw.filter(x => x > 0).length > 1;
            const confLevel = getCheckboxConf(q);
            const cellColor = isMulti ? 'var(--accent-violet)' : (confLevel === 'high' ? 'var(--accent-emerald)' : confLevel === 'medium' ? 'var(--accent-amber)' : 'var(--accent-rose)');
            const cur = responses[q];

            const qInfo = v2Trust?.[q];
            const qPage = qInfo?.page || (qi >= 13 ? 2 : 1);
            const qBbox = qInfo?.bbox;
            const pageUrl = api.getPageUrl(docId, qPage);

            return (
              <div key={q} className="flex items-center gap-1 p-1.5 rounded-lg"
                onKeyDown={e => {
                  const n = Number(e.key);
                  if (Number.isInteger(n) && [0, 1, 2, 3].includes(n)) {
                    e.preventDefault();
                    onChange({ ...responses, [q]: toggleValue(cur, n) });
                  }
                }}
                style={{
                  background: isMulti ? 'color-mix(in srgb, var(--accent-violet) 8%, transparent)' : 'rgba(0,0,0,0.08)',
                  border: `1px solid ${isMulti ? 'color-mix(in srgb, var(--accent-violet) 25%, transparent)' : 'transparent'}`,
                }}>
                <div className="w-6 text-xs font-bold text-[var(--text-muted)] shrink-0">Q{qi}</div>
                {qBbox ? (
                  <div className="shrink-0"
                    style={{ width: '160px', height: '50px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', cursor: 'zoom-in', overflow: 'hidden' }}
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleZoom(q, rect.left + rect.width / 2, rect.top);
                    }}
                    onMouseMove={e => handleZoom(q, e.clientX, e.clientY - 20)}
                    onMouseLeave={() => onZoom(null)}
                  >
                    <CanvasCrop pageUrl={pageUrl} bbox={qBbox} polygon={qInfo?.polygon}
                      style={{ width: '160px', height: '50px', objectFit: 'contain' }}
                      onDataUrl={url => { dataUrls.current[q] = url; }} />
                  </div>
                ) : (
                  <div className="shrink-0" style={{ width: '160px', height: '50px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }} />
                )}
                <div className="flex items-center gap-3 justify-end flex-1 shrink-0">
                  <span className="text-2xl font-extrabold shrink-0 min-w-[30px] text-center" style={{ color: cellColor }}>
                    {(() => {
                      const r = responses[q];
                      if (r === undefined || r === -1) return '—';
                      if (Array.isArray(r)) {
                        const f = r.filter(x => x > 0);
                        return f.length > 0 ? f.join(',') : '—';
                      }
                      return r;
                    })()}
                    {isMulti && <span className="ml-0.5 text-[10px]" style={{ color: 'var(--accent-violet)' }}>✦</span>}
                  </span>
                  <span className="w-px h-6 bg-[var(--color-border)] shrink-0 inline-block"></span>
                  <div className="flex gap-1 shrink-0">
                    {[1, 2, 3, 0].map(v => {
                      const selected = Array.isArray(cur) ? cur.includes(v) : cur === v;
                      return (
                        <button key={v} onClick={() => onChange({ ...responses, [q]: toggleValue(cur, v) })}
                          className="px-2.5 py-1 rounded border-2 text-sm font-bold leading-tight cursor-pointer"
                          style={{
                            background: selected ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.15)',
                            borderColor: selected ? 'var(--accent-violet)' : 'var(--color-border)',
                            color: selected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
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
      </CardContent>
    </Card>
  );
};

const propsAreEqual = (prev: Props, next: Props) => {
  return prev.docId === next.docId
    && prev.onChange === next.onChange
    && prev.onZoom === next.onZoom
    && JSON.stringify(prev.responses) === JSON.stringify(next.responses)
    && JSON.stringify(prev.checkboxConf) === JSON.stringify(next.checkboxConf)
    && JSON.stringify(prev.multiTicks) === JSON.stringify(next.multiTicks)
    && prev.v2Trust === next.v2Trust;
};

export const SdqGrid = memo(SdqGridComponent, propsAreEqual);
