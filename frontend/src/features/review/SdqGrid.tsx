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
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-muted-foreground">SDQ Responses (Q1–Q25)</h3>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <kbd className="px-1 py-0.5 rounded bg-secondary font-mono text-[9px] border border-border">1</kbd>
              <kbd className="px-1 py-0.5 rounded bg-secondary font-mono text-[9px] border border-border">2</kbd>
              <kbd className="px-1 py-0.5 rounded bg-secondary font-mono text-[9px] border border-border">3</kbd>
              <kbd className="px-1 py-0.5 rounded bg-secondary font-mono text-[9px] border border-border">0</kbd>
              {' '}select
            </span>
            <span className="flex items-center gap-0.5">
              <kbd className="px-1 py-0.5 rounded bg-secondary font-mono text-[9px] border border-border">↑</kbd>
              <kbd className="px-1 py-0.5 rounded bg-secondary font-mono text-[9px] border border-border">↓</kbd>
              {' '}navigate
            </span>
            <span className="text-success font-semibold">
              {Array.from({ length: 25 }, (_, i) => `q${i + 1}`).filter(q => getCheckboxConf(q) === 'high').length} high conf
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 25 }, (_, i) => {
            const qi = i + 1;
            const q = `q${qi}`;
            const raw = responses[q];
            const isMulti = Array.isArray(raw) && raw.filter(x => x > 0).length > 1;
            const confLevel = getCheckboxConf(q);
            const confColorCls = isMulti ? 'text-primary' : confLevel === 'high' ? 'text-success' : confLevel === 'medium' ? 'text-warning' : 'text-destructive';
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

            const anySelected = (() => {
              const r = responses[q];
              if (r === undefined || r === -1) return false;
              if (Array.isArray(r)) return r.some(x => x > 0);
              return r > 0;
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
                  flex items-center gap-2 px-3 py-2 rounded-lg outline-none transition-all duration-150
                  group cursor-pointer
                  ${anySelected
                    ? 'bg-primary/8 border border-primary/20 hover:bg-primary/12'
                    : 'bg-secondary/30 border border-transparent hover:bg-secondary/60 hover:border-border'}
                  ${isFocused ? 'ring-2 ring-primary/40 border-primary/30' : ''}
                  ${isMulti ? 'bg-primary/12 border border-primary/25' : ''}
                `}
              >
                <span className="w-6 text-xs font-extrabold text-muted-foreground shrink-0 text-right">
                  {qi}
                </span>
                {qPolygon ? (
                  <div className="shrink-0 w-[140px] h-[46px] bg-black/10 rounded-lg cursor-zoom-in overflow-hidden border border-border/50"
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleZoom(q, rect.left + rect.width / 2, rect.top);
                    }}
                    onMouseMove={e => handleZoom(q, e.clientX, e.clientY - 20)}
                    onMouseLeave={() => onZoom(null)}
                  >
                    <CanvasCrop pageUrl={pageUrl} polygon={qPolygon}
                      className="w-[140px] h-[46px] object-contain"
                      onDataUrl={url => { dataUrls.current[q] = url; }} />
                  </div>
                ) : (
                  <div className="shrink-0 w-[140px] h-[46px] bg-black/10 rounded-lg border border-border/50 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">No crop</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <span className={`text-xl font-extrabold block ${confColorCls}`}>
                    {displayVal}
                    {isMulti && <span className="ml-0.5 text-[9px] text-primary align-top">*</span>}
                  </span>
                  <div className={`
                    text-[9px] font-semibold mt-0.5
                    ${confLevel === 'high' ? 'text-success' : confLevel === 'medium' ? 'text-warning' : 'text-destructive'}
                  `}>
                    {confLevel === 'high' ? 'High conf' : confLevel === 'medium' ? 'Med conf' : 'Low conf'}
                  </div>
                </div>

                <div className="flex gap-1 shrink-0">
                  {[1, 2, 3, 0].map(v => {
                    const selected = Array.isArray(cur) ? cur.includes(v) : cur === v;
                    return (
                      <button key={v}
                        onClick={() => onChange({ ...responses, [q]: toggleValue(cur, v) })}
                        className={`
                          w-8 h-8 rounded-lg text-xs font-bold transition-colors
                          flex items-center justify-center border
                          ${selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-secondary'}
                        `}>
                        {v === 0 ? '✗' : v}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
