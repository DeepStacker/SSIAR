import React, { useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { Document, DocumentDetails, ZoomImage } from '../api';
import { api } from '../api';
import { DocHeader } from './DocHeader';
import { ZoomPopup } from './ZoomPopup';
import { useToast } from '../context/ToastContext';

interface Props {
  doc: Document;
  details: DocumentDetails;
  onClose: () => void;
  onDetailsChange?: (d: DocumentDetails) => void;
}

export const VerifiedView: React.FC<Props> = ({ doc, details, onClose, onDetailsChange }) => {
  const [zoomImg, setZoomImg] = useState<ZoomImage | null>(null);
  const [reprocessingField, setReprocessingField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { show } = useToast();
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
    if (key === 'roll_number') return details.roll_number || '';
    if (key === 'class') return details.class || '';
    if (key === 'dob') return details.dob || '';
    if (key === 'gender') return details.gender || '';
    return (acad as Record<string, string>)[key] || '';
  };

  const setVal = (key: string, val: string) => {
    if (!onDetailsChange) return;
    if (key === 'roll_number') onDetailsChange({ ...details, roll_number: val });
    else if (key === 'class') onDetailsChange({ ...details, class: val });
    else if (key === 'dob') onDetailsChange({ ...details, dob: val });
    else if (key === 'gender') onDetailsChange({ ...details, gender: val });
    else onDetailsChange({ ...details, academic_scores: { ...acad, [key]: val } });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.verifyDocument(doc.id, {
        roll_number: details.roll_number || '',
        class_val: details.class || '',
        dob: details.dob || '',
        gender: details.gender || '',
        consent: details.consent || 'Unanswered',
        responses: details.responses || {},
        academic_scores: details.academic_scores || {},
        remarks: details.remarks || '',
      });
      show('Changes saved', 'success');
    } catch (e: any) {
      show(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReprocessField = async (key: string) => {
    setReprocessingField(key);
    try {
      const result = await api.reprocessField(doc.id, key);
      if (result.updated && result.value && onDetailsChange) {
        const newDetails = { ...details };
        const newConf = { ...details.confidence_scores };
        newConf.ocr = { ...(newConf.ocr || {}), [key]: result.confidence };
        newDetails.confidence_scores = newConf;
        if (key === 'roll_number') newDetails.roll_number = result.value;
        else if (key === 'class') newDetails.class = result.value;
        else if (key === 'dob') newDetails.dob = result.value;
        else if (key === 'gender') newDetails.gender = result.value;
        else newDetails.academic_scores = { ...acad, [key]: result.value };
        onDetailsChange(newDetails);
      }
      show(result.message || `Field reprocessed: ${result.value}`, 'success');
    } catch (e: any) {
      show(e.message || 'Field reprocess failed', 'error');
    } finally {
      setReprocessingField(null);
    }
  };

  return (
    <div className="app-container">
      <DocHeader title="SSIAR — Verified View" onClose={onClose} />

      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} className="btn btn-primary" style={{ fontSize: '14px', padding: '8px 20px' }} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? ' Saving...' : ' Save Changes'}
        </button>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent-emerald)' }}>
            <Check size={14} /> Verified — {doc.filename}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <input className="form-input"
                    style={{ width: '100px', fontSize: '14px', padding: '4px 8px', fontWeight: '500' }}
                    value={getVal(f.key)} onChange={e => setVal(f.key, e.target.value)} />
                  <img src={api.getCropUrl(doc.id, `${f.key}.png`)} alt={f.label}
                    style={{ width: '120px', height: '30px', objectFit: 'contain', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'zoom-in' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    onMouseMove={e => { setZoomImg({ src: (e.currentTarget as HTMLImageElement).src, x: e.clientX, y: e.clientY }); }}
                    onMouseLeave={() => setZoomImg(null)} />
                  {reprocessingField === f.key ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
                  ) : (
                    <button onClick={() => handleReprocessField(f.key)}
                      title="Re-run OCR on this field"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', opacity: 0.5, fontSize: '14px' }}>⟳</button>
                  )}
                </div>
              </div>
            ))}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Consent</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  {['Yes', 'No', 'Unanswered'].map(c => (
                  <button key={c} onClick={() => onDetailsChange?.({ ...details, consent: c })}
                    style={{
                      padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                      border: '1px solid',
                      background: (details.consent || 'Unanswered') === c ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.1)',
                      borderColor: (details.consent || 'Unanswered') === c ? 'var(--accent-emerald)' : 'var(--color-border)',
                      color: (details.consent || 'Unanswered') === c ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                    }}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Remarks</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <textarea className="form-input"
                  style={{ width: '100%', fontSize: '13px', padding: '4px 8px', resize: 'vertical', height: '50px' }}
                  value={details.remarks || ''} onChange={e => {
                    if (onDetailsChange) onDetailsChange({ ...details, remarks: e.target.value });
                  }} />
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

      <ZoomPopup zoom={zoomImg} />
    </div>
  );
};
