import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ZoomImage } from '@/api';
import { api } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { CanvasCrop } from '@/features/review/CanvasCrop';

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

function getOrLoadImage(url: string, onReady: (img: HTMLImageElement) => void, onError: () => void) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => onReady(img);
  img.onerror = onError;
  img.src = url;
}

export const SdqGrid: React.FC<Props> = ({ docId, responses, checkboxConf, v2Trust, onChange, onZoom }) => {
  const dataUrls = useRef<Record<string, string>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [focusedQ, setFocusedQ] = useState<string | null>(null);
  const preloadDocId = useRef('');

  useEffect(() => {
    if (preloadDocId.current !== '' && preloadDocId.current !== docId) dataUrls.current = {};
    preloadDocId.current = docId;
    const pages = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const q = `q${i + 1}`;
      pages.add(v2Trust?.[q]?.page || (i + 1 >= 13 ? 2 : 1));
    }
    pages.forEach(p => getOrLoadImage(api.getPageUrl(docId, p), () => {}, () => {}));
  }, [docId, v2Trust]);

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

  const handleKeyOnRow = (q: string, e: React.KeyboardEvent, qi: number) => {
    const n = Number(e.key);
    if (Number.isInteger(n) && [0, 1, 2, 3].includes(n)) {
      e.preventDefault();
      onChange({ ...responses, [q]: toggleValue(responses[q], n) });
      return;
    }
    if (e.key === 'ArrowDown' && qi < 25) {
      e.preventDefault();
      const next = `q${qi + 1}`;
      if (rowRefs.current[next]) { rowRefs.current[next]!.focus(); setFocusedQ(next); }
    }
    if (e.key === 'ArrowUp' && qi > 1) {
      e.preventDefault();
      const prev = `q${qi - 1}`;
      if (rowRefs.current[prev]) { rowRefs.current[prev]!.focus(); setFocusedQ(prev); }
    }
  };

  return (
    <Card className="mb-5">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base text-[var(--text-secondary)]">SDQ Responses (Q1–Q25)</h3>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">1</kbd>/<kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">2</kbd>/<kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">3</kbd>/<kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">0</kbd> select</span>
            <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">↑</kbd><kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">↓</kbd> navigate</span>
            <span>{Array.from({ length: 25 }, (_, i) => `q${i + 1}`).filter(q => getCheckboxConf(q) === 'high').length} high conf</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 25 }, (_, i) => {
            const qi = i + 1;
            const q = `q${qi}`;
            const raw = responses[q];
            const isMulti = Array.isArray(raw) && raw.filter(x => x > 0).length > 1;
            const confLevel = getCheckboxConf(q);
            const cellColorCls = isMulti ? 'text-violet-400' : confLevel === 'high' ? 'text-emerald-400' : confLevel === 'medium' ? 'text-amber-400' : 'text-rose-400';
            const cur = responses[q];
            const isFocused = focusedQ === q;
            const qInfo = v2Trust?.[q];
            const qPage = qInfo?.page || (qi >= 13 ? 2 : 1);
            const qPolygon = qInfo?.polygon;
            const pageUrl = api.getPageUrl(docId, qPage);

            const displayVal = (() => {
              const r = responses[q];
              if (r === undefined || r === -1) return '—';
              if (Array.isArray(r)) {
                const f = r.filter(x => x > 0);
                return f.length > 0 ? f.join(',') : '—';
              }
              return r;
            })();

            return (
              <div
                key={q}
                ref={el => { rowRefs.current[q] = el; }}
                tabIndex={0}
                role="group"
                aria-label={`SDQ Question ${qi}`}
                onFocus={() => setFocusedQ(q)}
                onBlur={() => setFocusedQ(null)}
                onKeyDown={e => handleKeyOnRow(q, e, qi)}
                className={`
                  flex items-center gap-1 px-2.5 py-1.5 rounded-lg outline-none
                  ${isMulti ? 'bg-violet-500/10 border border-violet-500/25' : 'bg-black/10 border border-transparent'}
                  ${isFocused ? 'ring-2 ring-violet-500/50' : ''}
                `}
              >
                <div className="w-6 text-xs font-bold text-[var(--text-muted)] shrink-0">Q{qi}</div>
                {qPolygon ? (
                  <div className="shrink-0 w-[160px] h-[50px] bg-black/20 rounded cursor-zoom-in overflow-hidden"
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleZoom(q, rect.left + rect.width / 2, rect.top);
                    }}
                    onMouseMove={e => handleZoom(q, e.clientX, e.clientY - 20)}
                    onMouseLeave={() => onZoom(null)}
                  >
                    <CanvasCrop pageUrl={pageUrl} polygon={qPolygon}
                      className="w-[160px] h-[50px] object-contain"
                      onDataUrl={url => { dataUrls.current[q] = url; }} />
                  </div>
                ) : (
                  <div className="shrink-0 w-[160px] h-[50px] bg-black/20 rounded" />
                )}
                <div className="flex items-center gap-3 justify-end flex-1 shrink-0">
                  <span className={`text-2xl font-extrabold shrink-0 min-w-[30px] text-center ${cellColorCls}`}>
                    {displayVal}
                    {isMulti && <span className="ml-0.5 text-[10px] text-[var(--accent-violet)]">✦</span>}
                  </span>
                  <span className="w-px h-6 bg-[var(--color-border)] shrink-0 inline-block" />
                  <div className="flex gap-1 shrink-0">
                    {[1, 2, 3, 0].map(v => {
                      const selected = Array.isArray(cur) ? cur.includes(v) : cur === v;
                      return (
                        <button key={v}
                          onClick={() => onChange({ ...responses, [q]: toggleValue(cur, v) })}
                          className={`
                            px-2.5 py-1 rounded border-2 text-sm font-bold leading-tight cursor-pointer
                            ${selected ? 'bg-violet-500/20 border-[var(--accent-violet)] text-[var(--accent-cyan)]' : 'bg-black/15 border-[var(--color-border)] text-[var(--text-secondary)]'}
                          `}>
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
