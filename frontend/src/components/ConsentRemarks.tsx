import React from 'react';
import { ZoomImage } from '../api';
import { api } from '../api';

interface Props {
  docId: string;
  consent: string;
  remarks: string;
  onConsentChange: (v: string) => void;
  onRemarksChange: (v: string) => void;
  onZoom: (img: ZoomImage | null) => void;
}

export const ConsentRemarks: React.FC<Props> = ({ docId, consent, remarks, onConsentChange, onRemarksChange, onZoom }) => (
  <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      <div>
        <label style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>Consent</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          {['Yes', 'No', 'Unanswered'].map(o => (
            <button key={o} onClick={() => onConsentChange(o)}
              style={{
                padding: '6px 16px', borderRadius: '6px', border: '2px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '700',
                background: consent === o ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.12)',
                borderColor: consent === o ? 'var(--accent-violet)' : 'var(--color-border)',
                color: consent === o ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              }}>
              {o}
            </button>
          ))}
        </div>
        <img src={api.getCropUrl(docId, 'consent.png')} alt="Consent"
          style={{ width: '100%', height: '50px', objectFit: 'contain', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', cursor: 'zoom-in' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          onMouseEnter={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onZoom({ src: api.getCropUrl(docId, 'consent.png'), x: rect.left + rect.width / 2, y: rect.top });
          }}
          onMouseMove={e => onZoom({ src: api.getCropUrl(docId, 'consent.png'), x: e.clientX, y: e.clientY - 20 })}
          onMouseLeave={() => onZoom(null)}
        />
      </div>
      <div>
        <label style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>Remarks</label>
        <textarea className="form-input" style={{ width: '100%', height: '80px', fontSize: '14px', resize: 'vertical', padding: '8px 12px', fontFamily: 'monospace' }}
          value={remarks} onChange={e => onRemarksChange(e.target.value)} />
        <img src={api.getCropUrl(docId, 'remarks.png')} alt="Remarks"
          style={{ width: '100%', height: '50px', objectFit: 'contain', background: 'white', borderRadius: '6px', cursor: 'zoom-in', marginTop: '8px' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          onMouseEnter={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onZoom({ src: api.getCropUrl(docId, 'remarks.png'), x: rect.left + rect.width / 2, y: rect.top });
          }}
          onMouseMove={e => onZoom({ src: api.getCropUrl(docId, 'remarks.png'), x: e.clientX, y: e.clientY - 20 })}
          onMouseLeave={() => onZoom(null)}
        />
      </div>
    </div>
  </div>
);
