import React, { useEffect, useRef, useState } from 'react';
import { FileText, Check, Loader2, X, ArrowRight, RotateCcw } from 'lucide-react';
import { Document, DocumentDetails } from '../api';
import { ZoomImage } from '../api';
import { api } from '../api';
import { SdqGrid } from './SdqGrid';
import { ConsentRemarks } from './ConsentRemarks';
import { ZoomPopup } from './ZoomPopup';

interface Props {
  doc: Document;
  details: DocumentDetails;
  detailsDirty: boolean;
  onDetailsChange: (d: DocumentDetails) => void;
  onDirtyChange: (d: boolean) => void;
  reviewIndex: number;
  totalReview: number;
  onClose: () => void;
  onVerify: () => void;
  onReprocess: () => void;
  onNext: () => void;
  saving: boolean;
}

const CONF_THRESHOLD = 0.8;

export const ReviewView: React.FC<Props> = ({ doc, details, detailsDirty, onDetailsChange, onDirtyChange, reviewIndex, totalReview, onClose, onVerify, onReprocess, onNext, saving }) => {
  const [fieldAccepted, setFieldAccepted] = useState<Record<string, boolean>>({});
  const [flashField, setFlashField] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<ZoomImage | null>(null);
  const rollRef = useRef<HTMLInputElement>(null);
  const origValuesRef = useRef<Record<string, string>>({});

  const conf = details.confidence_scores?.ocr || {};
  const checkboxConf = details.confidence_scores?.checkbox || {};
  const multiTicks: Record<string, number[]> = details.confidence_scores?.multi_ticks || {};
  const academic = details.academic_scores || {} as any;

  const fieldConf = (key: string): number => {
    const c = conf[key] ?? 1;
    return typeof c === 'number' ? c : 1;
  };

  const isHighConf = (key: string) => fieldConf(key) >= CONF_THRESHOLD;

  const getFieldVal = (key: string) => {
    if (key === 'roll_number') return details.roll_number || '';
    if (key === 'class') return details.class || '';
    if (key === 'dob') return details.dob || '';
    if (key === 'gender') return details.gender || '';
    return (academic as Record<string, string>)[key] || '';
  };

  const setFieldVal = (key: string, val: string) => {
    onDirtyChange(true);
    if (key === 'roll_number') onDetailsChange({ ...details, roll_number: val });
    else if (key === 'class') onDetailsChange({ ...details, class: val });
    else if (key === 'dob') onDetailsChange({ ...details, dob: val });
    else if (key === 'gender') onDetailsChange({ ...details, gender: val });
    else onDetailsChange({ ...details, academic_scores: { ...academic, [key]: val } });
  };

  const handleAccept = (key: string) => {
    setFieldAccepted({ ...fieldAccepted, [key]: true });
    setFlashField(key);
    setTimeout(() => setFlashField(null), 500);
  };

  useEffect(() => {
    setTimeout(() => rollRef.current?.focus(), 100);
  }, [doc.id]);

  useEffect(() => {
    const init: Record<string, boolean> = {};
    const orig: Record<string, string> = {};
    for (const key of ['roll_number','class','dob','gender','math_pct','science_pct','language_pct','rank']) {
      init[key] = isHighConf(key);
      orig[key] = getFieldVal(key);
    }
    origValuesRef.current = orig;
    setFieldAccepted(init);
  }, [details.id]);

  const mainFields = [
    { key: 'roll_number', label: 'Roll Number' },
    { key: 'class', label: 'Class' },
    { key: 'dob', label: 'DOB' },
    { key: 'gender', label: 'Gender' },
    { key: 'math_pct', label: 'Math %' },
    { key: 'science_pct', label: 'Science %' },
    { key: 'language_pct', label: 'Language %' },
    { key: 'rank', label: 'Rank' },
  ];

  const acceptedCount = Object.values(fieldAccepted).filter(Boolean).length;
  const highConfQCount = Array.from({ length: 25 }, (_, i) => `q${i + 1}`).filter(q => {
    const c = checkboxConf[q];
    return c === 'high' || c === 'high_confidence' || !c;
  }).length;

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="logo"><FileText size={24} /><span>SSIAR — Quick Review</span></div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{reviewIndex + 1} / {totalReview}</span>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
            <X size={14} /> Close
          </button>
        </div>
      </header>

      <div style={{ padding: '20px' }}>
        <div className="glass" style={{ padding: '12px 20px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {doc.filename} — <b style={{ color: 'white' }}>{acceptedCount}/8</b> main fields
            + <b style={{ color: 'var(--accent-emerald)' }}>{highConfQCount}/25</b> questions auto-verified
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}
              onClick={() => setFieldAccepted(Object.fromEntries(mainFields.map(f => [f.key, isHighConf(f.key)])))}>
              Accept High-Conf ({mainFields.filter(f => isHighConf(f.key)).length})
            </button>
            <button onClick={onVerify} className="btn btn-primary" style={{ fontSize: '14px', padding: '8px 20px' }} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? ' Saving...' : ' Save & Next'}
            </button>
            <button onClick={onReprocess} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--accent-amber)' }}>
              <RotateCcw size={14} /> Reprocess
            </button>
            <button onClick={onNext} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
              Skip <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '11px', color: 'var(--text-muted)', padding: '0 4px' }}>
          <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontFamily: 'inherit', border: '1px solid var(--color-border)' }}>Tab</kbd> next field</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontFamily: 'inherit', border: '1px solid var(--color-border)' }}>Enter</kbd> accept field</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontFamily: 'inherit', border: '1px solid var(--color-border)' }}>Ctrl+Enter</kbd> save & next doc</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontFamily: 'inherit', border: '1px solid var(--color-border)' }}>Esc</kbd> close</span>
        </div>

        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {mainFields.map((f, fi) => {
              const val = getFieldVal(f.key);
              const accepted = fieldAccepted[f.key];
              const confidence = fieldConf(f.key);
              const isClass = f.key === 'class';
              const isGender = f.key === 'gender';
              const isPct = f.key === 'math_pct' || f.key === 'science_pct' || f.key === 'language_pct';
              const isDob = f.key === 'dob';
              const isRoll = f.key === 'roll_number';
              const isRank = f.key === 'rank';
              const confColor = confidence >= 0.9 ? 'var(--accent-emerald)' : confidence >= 0.7 ? 'var(--accent-amber)' : '#f43f5e';
              const isEdited = val !== '' && origValuesRef.current[f.key] !== undefined && val !== origValuesRef.current[f.key];
              return (
                <div key={f.key} className={flashField === f.key ? 'accept-flash' : ''} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px',
                  borderRight: fi % 2 === 0 ? '1px solid var(--color-border)' : 'none',
                  borderBottom: fi < mainFields.length - 2 ? '1px solid var(--color-border)' : 'none',
                  background: accepted ? 'rgba(16,185,129,0.04)' : isEdited ? 'rgba(245,158,11,0.04)' : 'transparent',
                }}>
                  <div style={{ flexShrink: 0, lineHeight: 0 }}
                    onMouseEnter={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setZoomImg({ src: api.getCropUrl(doc.id, `${f.key}.png`), x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    onMouseMove={e => setZoomImg({ src: api.getCropUrl(doc.id, `${f.key}.png`), x: e.clientX, y: e.clientY - 20 })}
                    onMouseLeave={() => setZoomImg(null)}>
                    <img src={api.getCropUrl(doc.id, `${f.key}.png`)} alt={f.label}
                      style={{ width: '220px', height: '54px', objectFit: 'contain', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', display: 'block', cursor: 'zoom-in' }} />
                  </div>
                  <span style={{ fontSize: '15px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontWeight: '500' }}>{f.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isClass ? (
                      <select className={`form-input ${isEdited ? 'field-edited-input' : ''}`} style={{ width: '100%', fontSize: '15px', padding: '6px 10px' }}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAccept(f.key); }}>
                        <option value="">—</option>
                        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                      </select>
                    ) : isGender ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['M', 'F'].map(g => (
                          <button key={g} onClick={() => setFieldVal(f.key, g)}
                            style={{
                              padding: '5px 16px', borderRadius: '4px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                              border: '1px solid',
                              background: val === g ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.15)',
                              borderColor: val === g ? 'var(--accent-violet)' : (isEdited ? 'var(--accent-amber)' : 'var(--color-border)'),
                              color: val === g ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            }}>{g}</button>
                        ))}
                      </div>
                    ) : isPct ? (
                      <input type="number" min="0" max="100" className={`form-input ${isEdited ? 'field-edited-input' : ''}`}
                        style={{ width: '100%', fontSize: '15px', padding: '6px 10px', textAlign: 'center', fontWeight: '600' }}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') handleAccept(f.key); }} />
                    ) : isRank ? (
                      <input type="number" min="1" className={`form-input ${isEdited ? 'field-edited-input' : ''}`}
                        style={{ width: '100%', fontSize: '15px', padding: '6px 10px', fontWeight: '600' }}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') handleAccept(f.key); }} />
                    ) : isDob ? (
                      <input type="text" placeholder="DD/MM/YYYY" className={`form-input ${isEdited ? 'field-edited-input' : ''}`}
                        style={{ width: '100%', fontSize: '15px', padding: '6px 10px', fontFamily: 'monospace', fontWeight: '600', letterSpacing: '1px' }}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') handleAccept(f.key); }} />
                    ) : isRoll ? (
                      <input ref={rollRef}
                        className={`form-input ${isEdited ? 'field-edited-input' : ''}`}
                        style={{ width: '100%', fontSize: '16px', padding: '6px 10px', fontFamily: 'monospace', fontWeight: '700' }}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)} placeholder="Roll #"
                        onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') handleAccept(f.key); }} />
                    ) : (
                      <input className={`form-input ${isEdited ? 'field-edited-input' : ''}`}
                        style={{ width: '100%', fontSize: '15px', padding: '6px 10px' }}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') handleAccept(f.key); }} />
                    )}
                    {isEdited && !accepted && <span style={{ fontSize: '10px', color: 'var(--accent-amber)', marginTop: '2px', display: 'block' }}>✎ edited</span>}
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: confColor, minWidth: '36px', textAlign: 'right' }}>{Math.round(confidence * 100)}%</span>
                    {accepted ? (
                      <Check size={20} style={{ color: 'var(--accent-emerald)' }} />
                    ) : (
                      <button onClick={() => handleAccept(f.key)}
                        className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: '12px', minWidth: '24px', height: '24px' }}>✓</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SdqGrid docId={doc.id} responses={details.responses || {}} checkboxConf={checkboxConf} multiTicks={multiTicks}
          onChange={newResp => { onDirtyChange(true); onDetailsChange({ ...details, responses: newResp }); }}
          onZoom={setZoomImg} />

        <ConsentRemarks docId={doc.id} consent={details.consent || 'Unanswered'} remarks={details.remarks || ''}
          onConsentChange={v => { onDirtyChange(true); onDetailsChange({ ...details, consent: v }); }}
          onRemarksChange={v => { onDirtyChange(true); onDetailsChange({ ...details, remarks: v }); }}
          onZoom={setZoomImg} />
      </div>

      <ZoomPopup zoom={zoomImg} />
    </div>
  );
};
