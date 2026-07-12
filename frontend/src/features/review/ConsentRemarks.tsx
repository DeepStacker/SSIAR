import React, { useCallback } from 'react';
import type { ZoomImage } from '@/api';
import { api } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CanvasCrop, useCropDataUrls } from '@/features/review/CanvasCrop';

interface Props {
  docId: string;
  consent: string;
  remarks: string;
  v2Trust: Record<string, any>;
  onConsentChange: (v: string) => void;
  onRemarksChange: (v: string) => void;
  onZoom: (img: ZoomImage | null) => void;
}

export const ConsentRemarks: React.FC<Props> = ({ docId, consent, remarks, v2Trust, onConsentChange, onRemarksChange, onZoom }) => {
  const { setUrl, getUrl } = useCropDataUrls();

  const consentInfo = v2Trust?.consent;
  const consentPage = consentInfo?.page || 1;
  const consentPolygon = consentInfo?.polygon;
  const consentPageUrl = api.getPageUrl(docId, consentPage);

  const remarksInfo = v2Trust?.remarks;
  const remarksPage = remarksInfo?.page || 2;
  const remarksPolygon = remarksInfo?.polygon;
  const remarksPageUrl = api.getPageUrl(docId, remarksPage);

  const handleZoom = useCallback((key: string, x: number, y: number) => {
    const src = getUrl(key);
    if (src) onZoom({ src, x, y });
  }, [getUrl, onZoom]);

  return (
    <Card className="mb-5 glass-card">
      <CardContent className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2.5">
            <label htmlFor="consent-select" className="text-xs font-bold text-[var(--text-secondary)] block">Consent</label>
            <div id="consent-select" role="group" aria-label="Consent" className="flex gap-1.5"
              onKeyDown={e => {
                if (e.key.toLowerCase() === 'y') { onConsentChange('Yes'); e.preventDefault(); }
                else if (e.key.toLowerCase() === 'n') { onConsentChange('No'); e.preventDefault(); }
                else if (e.key.toLowerCase() === 'u') { onConsentChange('Unanswered'); e.preventDefault(); }
              }}>
              {['Yes', 'No', 'Unanswered'].map(o => (
                <button key={o} onClick={() => onConsentChange(o)}
                  aria-pressed={consent === o}
                  className={`
                    flex-1 py-2 rounded-lg border-2 text-xs font-bold cursor-pointer transition-all duration-150
                    ${consent === o
                      ? 'bg-[var(--accent-violet)]/20 border-[var(--accent-violet)] text-[var(--accent-cyan)]'
                      : 'bg-transparent border-[var(--color-border)] text-[var(--text-secondary)] hover:border-[var(--accent-violet)]/30 hover:bg-[var(--accent-violet)]/5'}
                  `}>
                  {o}
                </button>
              ))}
            </div>
            {consentPolygon ? (
              <div
                className="w-full h-[56px] rounded-xl overflow-hidden cursor-zoom-in bg-[var(--bg-highlight)]/30 border border-[var(--color-border)]/50"
                onMouseEnter={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleZoom('consent', rect.left + rect.width / 2, rect.top);
                }}
                onMouseMove={e => handleZoom('consent', e.clientX, e.clientY - 20)}
                onMouseLeave={() => onZoom(null)}
              >
                <CanvasCrop pageUrl={consentPageUrl} polygon={consentPolygon}
                  className="w-full h-[56px] object-contain"
                  onDataUrl={url => setUrl('consent', url)} />
              </div>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <label htmlFor="remarks-input" className="text-xs font-bold text-[var(--text-secondary)] block">Remarks</label>
            <Textarea id="remarks-input"
              className="min-h-[80px] text-sm resize-y font-mono premium-input"
              value={remarks} onChange={e => onRemarksChange(e.target.value)}
              placeholder="Enter remarks..." />
            {remarksPolygon ? (
              <div
                className="w-full h-[56px] rounded-xl overflow-hidden cursor-zoom-in bg-[var(--bg-highlight)]/30 border border-[var(--color-border)]/50"
                onMouseEnter={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleZoom('remarks', rect.left + rect.width / 2, rect.top);
                }}
                onMouseMove={e => handleZoom('remarks', e.clientX, e.clientY - 20)}
                onMouseLeave={() => onZoom(null)}
              >
                <CanvasCrop pageUrl={remarksPageUrl} polygon={remarksPolygon}
                  className="w-full h-[56px] object-contain"
                  onDataUrl={url => setUrl('remarks', url)} />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
