import React, { useState } from 'react';
import { Check, X, FileText } from 'lucide-react';
import { Document, DocumentDetails, ZoomImage } from '../api';
import { api } from '../api';
import { DocHeader } from './DocHeader';
import { ZoomPopup } from './ZoomPopup';

interface Props {
  doc: Document;
  details: DocumentDetails;
  onClose: () => void;
}

export const VerifiedView: React.FC<Props> = ({ doc, details, onClose }) => {
  const [zoomImg, setZoomImg] = useState<ZoomImage | null>(null);
  const fields = [
    { key: 'roll_number', label: 'Roll Number' },
    { key: 'class', label: 'Class' },
    { key: 'dob', label: 'DOB' },
    { key: 'gender', label: 'Gender' },
    { key: 'math_pct', label: 'Math %' },
    { key: 'science_pct', label: 'Science %' },
    { key: 'language_pct', label: 'Language %' },
    { key: 'rank', label: 'Rank' },
  ];
  const acad = details.academic_scores || {} as any;

  const getVal = (key: string) => {
    if (key === 'roll_number') return details.roll_number;
    if (key === 'class') return details.class;
    if (key === 'dob') return details.dob;
    if (key === 'gender') return details.gender;
    return (acad as Record<string, string>)[key] || '';
  };

  return (
    <div className="app-container">
      <DocHeader title="SSIAR — Verified View" onClose={onClose} />

      <div style={{ padding: '20px' }}>
        <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent-emerald)' }}>
            <Check size={14} /> Verified — {doc.filename}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', minWidth: '60px' }}>{getVal(f.key) || '—'}</span>
                  <img src={api.getCropUrl(doc.id, `${f.key}.png`)} alt={f.label}
                    style={{ width: '120px', height: '30px', objectFit: 'contain', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'zoom-in' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                    onMouseLeave={() => setZoomImg(null)} />
                </div>
              </div>
            ))}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Consent</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', minWidth: '60px' }}>{details.consent || '—'}</span>
                <img src={api.getCropUrl(doc.id, 'consent.png')} alt="Consent"
                  style={{ width: '120px', height: '30px', objectFit: 'contain', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'zoom-in' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                  onMouseLeave={() => setZoomImg(null)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Remarks</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', minWidth: '60px' }}>{details.remarks || '—'}</span>
                <img src={api.getCropUrl(doc.id, 'remarks.png')} alt="Remarks"
                  style={{ width: '120px', height: '30px', objectFit: 'contain', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'zoom-in' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                  onMouseLeave={() => setZoomImg(null)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '18px', color: 'var(--text-secondary)', marginBottom: '16px' }}>SDQ Responses (Q1–Q25)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {Array.from({ length: 25 }, (_, i) => {
              const qi = i + 1;
              const q = `q${qi}`;
              const raw = details.responses?.[q];
              const isMulti = Array.isArray(raw) && raw.filter((x: number) => x > 0).length > 1;
              return (
                <div key={q} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '6px 10px', borderRadius: '8px',
                  background: isMulti ? 'rgba(168,85,247,0.08)' : 'rgba(0,0,0,0.08)',
                  border: `1px solid ${isMulti ? 'rgba(168,85,247,0.25)' : 'transparent'}`,
                }}>
                  <div style={{ width: '24px', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', flexShrink: 0 }}>Q{qi}</div>
                  <img src={api.getCropUrl(doc.id, `${q}.png`)} alt={q}
                    style={{ width: '160px', height: '50px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', cursor: 'zoom-in', flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                    onMouseLeave={() => setZoomImg(null)} />
                  <span style={{ fontSize: '14px', fontWeight: '700', color: isMulti ? '#a855f7' : 'var(--text-primary)', minWidth: '24px', textAlign: 'center' }}>
                    {Array.isArray(raw) ? raw.filter((x: number) => x > 0).join(',') || '—' : raw || '—'}
                  </span>
                  {isMulti && <span style={{ marginLeft: '2px', fontSize: '10px', color: '#a855f7' }}>✦</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Consent</label>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>{details.consent || '—'}</div>
              <img src={api.getCropUrl(doc.id, 'consent.png')} alt="Consent"
                style={{ width: '100%', maxWidth: '300px', height: '50px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', cursor: 'zoom-in', border: '1px solid var(--color-border)' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => setZoomImg(null)} />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Remarks</label>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>{details.remarks || '—'}</div>
              <img src={api.getCropUrl(doc.id, 'remarks.png')} alt="Remarks"
                style={{ width: '100%', maxWidth: '300px', height: '50px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', cursor: 'zoom-in', border: '1px solid var(--color-border)' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => setZoomImg(null)} />
            </div>
          </div>
        </div>
      </div>

      <ZoomPopup zoom={zoomImg} />
    </div>
  );
};
