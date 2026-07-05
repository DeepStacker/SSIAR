import React from 'react';
import { ZoomImage } from '../api';
import { api } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  docId: string;
  consent: string;
  remarks: string;
  onConsentChange: (v: string) => void;
  onRemarksChange: (v: string) => void;
  onZoom: (img: ZoomImage | null) => void;
}

export const ConsentRemarks: React.FC<Props> = ({ docId, consent, remarks, onConsentChange, onRemarksChange, onZoom }) => (
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
          <img src={api.getCropUrl(docId, 'consent.png')} alt="Consent"
            tabIndex={0}
            style={{ width: '100%', height: '50px', objectFit: 'contain', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', cursor: 'zoom-in' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            onMouseEnter={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onZoom({ src: api.getCropUrl(docId, 'consent.png'), x: rect.left + rect.width / 2, y: rect.top });
            }}
            onMouseMove={e => onZoom({ src: api.getCropUrl(docId, 'consent.png'), x: e.clientX, y: e.clientY - 20 })}
            onMouseLeave={() => onZoom(null)}
            onFocus={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onZoom({ src: api.getCropUrl(docId, 'consent.png'), x: rect.left + rect.width / 2, y: rect.top });
            }}
            onBlur={() => onZoom(null)}
          />
        </div>
        <div>
          <label htmlFor="remarks-input" className="text-sm text-[var(--text-muted)] block mb-2 font-semibold">Remarks</label>
          <Textarea id="remarks-input" className="min-h-[80px] text-sm resize-y font-mono"
            value={remarks} onChange={e => onRemarksChange(e.target.value)} />
          <img src={api.getCropUrl(docId, 'remarks.png')} alt="Remarks"
            tabIndex={0}
            style={{ width: '100%', height: '50px', objectFit: 'contain', background: 'white', borderRadius: '6px', cursor: 'zoom-in', marginTop: '8px' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            onMouseEnter={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onZoom({ src: api.getCropUrl(docId, 'remarks.png'), x: rect.left + rect.width / 2, y: rect.top });
            }}
            onMouseMove={e => onZoom({ src: api.getCropUrl(docId, 'remarks.png'), x: e.clientX, y: e.clientY - 20 })}
            onMouseLeave={() => onZoom(null)}
            onFocus={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onZoom({ src: api.getCropUrl(docId, 'remarks.png'), x: rect.left + rect.width / 2, y: rect.top });
            }}
            onBlur={() => onZoom(null)}
          />
        </div>
      </div>
    </CardContent>
  </Card>
);
