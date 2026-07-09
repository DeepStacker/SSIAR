import React, { useCallback } from 'react';
import { ZoomImage } from '../api';
import { api } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CanvasCrop, useCropDataUrls } from './CanvasCrop';

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
  const consentBbox = consentInfo?.bbox;
  const consentPageUrl = api.getPageUrl(docId, consentPage);

  const remarksInfo = v2Trust?.remarks;
  const remarksPage = remarksInfo?.page || 2;
  const remarksBbox = remarksInfo?.bbox;
  const remarksPageUrl = api.getPageUrl(docId, remarksPage);

  const handleZoom = useCallback((key: string, x: number, y: number) => {
    const src = getUrl(key);
    if (src) onZoom({ src, x, y });
  }, [getUrl, onZoom]);

  return (
    <Card className="mb-5">
      <CardContent className="p-5">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label htmlFor="consent-select" className="text-sm text-[var(--text-muted)] block mb-2 font-semibold">Consent</label>
            <div id="consent-select" role="group" aria-label="Consent"
              className="flex gap-2 items-center mb-2"
              onKeyDown={e => {
                if (e.key.toLowerCase() === 'y') { onConsentChange('Yes'); e.preventDefault(); }
                else if (e.key.toLowerCase() === 'n') { onConsentChange('No'); e.preventDefault(); }
                else if (e.key.toLowerCase() === 'u') { onConsentChange('Unanswered'); e.preventDefault(); }
              }}>
              {['Yes', 'No', 'Unanswered'].map(o => (
                <button key={o} onClick={() => onConsentChange(o)}
                  aria-pressed={consent === o}
                  className="px-4 py-1.5 rounded-md border-2 text-sm font-bold cursor-pointer"
                  style={{
                    background: consent === o ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.12)',
                    borderColor: consent === o ? 'var(--accent-violet)' : 'var(--color-border)',
                    color: consent === o ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  }}>
                  {o}
                </button>
              ))}
            </div>
            {consentBbox ? (
              <div
                style={{ width: '100%', height: '50px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', cursor: 'zoom-in', overflow: 'hidden' }}
                onMouseEnter={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleZoom('consent', rect.left + rect.width / 2, rect.top);
                }}
                onMouseMove={e => handleZoom('consent', e.clientX, e.clientY - 20)}
                onMouseLeave={() => onZoom(null)}
              >
                <CanvasCrop pageUrl={consentPageUrl} bbox={consentBbox}
                  style={{ width: '100%', height: '50px', objectFit: 'contain' }}
                  onDataUrl={url => setUrl('consent', url)} />
              </div>
            ) : null}
          </div>
          <div>
            <label htmlFor="remarks-input" className="text-sm text-[var(--text-muted)] block mb-2 font-semibold">Remarks</label>
            <Textarea id="remarks-input" className="min-h-[80px] text-sm resize-y font-mono"
              value={remarks} onChange={e => onRemarksChange(e.target.value)} />
            {remarksBbox ? (
              <div
                style={{ width: '100%', height: '50px', background: 'white', borderRadius: '6px', cursor: 'zoom-in', marginTop: '8px', overflow: 'hidden' }}
                onMouseEnter={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleZoom('remarks', rect.left + rect.width / 2, rect.top);
                }}
                onMouseMove={e => handleZoom('remarks', e.clientX, e.clientY - 20)}
                onMouseLeave={() => onZoom(null)}
              >
                <CanvasCrop pageUrl={remarksPageUrl} bbox={remarksBbox}
                  style={{ width: '100%', height: '50px', objectFit: 'contain' }}
                  onDataUrl={url => setUrl('remarks', url)} />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
