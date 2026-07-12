import React, { useState, useRef, useCallback } from 'react';
import { Check, Download, Loader2, Save } from 'lucide-react';
import { Document, DocumentDetails, ZoomImage } from '../api';
import { api } from '../api';
import { exportToCsv } from '../lib/utils';
import { DocHeader } from './DocHeader';
import { ZoomPopup } from './ZoomPopup';
import { PageViewer } from './PageViewer';
import { useToast } from '../context/ToastContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CanvasCrop } from './CanvasCrop';
import { SdqGrid } from './SdqGrid';

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
  const [pageViewer, setPageViewer] = useState<1 | 2 | null>(null);
  const cropRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusedFieldRef = useRef<string | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { show } = useToast();
  const v2Trust = details.confidence_scores?.v2_trust || {};
  const cropDataUrls = useRef<Record<string, string>>({});

  const showZoomForCrop = useCallback((key: string) => {
    const el = cropRefs.current[key];
    const src = cropDataUrls.current[key] || '';
    if (el && src) {
      const rect = el.getBoundingClientRect();
      setZoomImg({ src, x: rect.right + 20, y: rect.top + rect.height / 2 });
    }
  }, []);

  const handleCropEnter = useCallback((e: React.MouseEvent, key: string) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    const src = cropDataUrls.current[key] || '';
    if (src) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setZoomImg({ src, x: rect.left + rect.width / 2, y: rect.top });
    }
  }, []);

  const handleCropMove = useCallback((e: React.MouseEvent, key: string) => {
    const src = cropDataUrls.current[key] || '';
    if (src) setZoomImg({ src, x: e.clientX, y: e.clientY });
  }, []);

  const handleCropLeave = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      if (!focusedFieldRef.current) {
        setZoomImg(null);
      }
    }, 80);
  }, []);

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>, key: string) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    focusedFieldRef.current = key;
    showZoomForCrop(key);
    e.target.select();
  }, [showZoomForCrop]);

  const handleInputBlur = useCallback(() => {
    focusedFieldRef.current = null;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      if (!focusedFieldRef.current) {
        setZoomImg(null);
      }
    }, 80);
  }, []);
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
  const acad: Record<string, string> = details.academic_scores || {};

  const getVal = (key: string) => {
    if (key === 'roll_number') return details.roll_number || '';
    if (key === 'class') return details.class || '';
    if (key === 'dob') return details.dob || '';
    if (key === 'gender') return details.gender || '';
    return (acad as Record<string, string>)[key] || '';
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pageViewer) {
        onClose();
      }
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        setPageViewer(1);
      }
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        setPageViewer(2);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, pageViewer]);

  const setVal = (key: string, val: string) => {
    if (!onDetailsChange) return;
    if (key === 'roll_number') onDetailsChange({ ...details, roll_number: val });
    else if (key === 'class') onDetailsChange({ ...details, class: val });
    else if (key === 'dob') onDetailsChange({ ...details, dob: val });
    else if (key === 'gender') onDetailsChange({ ...details, gender: val });
    else onDetailsChange({ ...details, academic_scores: { ...acad, [key]: val } as typeof details.academic_scores });
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
        else newDetails.academic_scores = { ...acad, [key]: result.value } as typeof newDetails.academic_scores;
        onDetailsChange(newDetails);
      }
      show(result.message || `Field reprocessed: ${result.value}`, 'success');
    } catch (e: any) {
      show(e.message || 'Field reprocess failed', 'error');
    } finally {
      setReprocessingField(null);
    }
  };

  const handleExport = () => {
    exportToCsv(
      ['Field', 'Value'],
      [
        ['Roll Number', details.roll_number || ''],
        ['Class', details.class || ''],
        ['DOB', details.dob || ''],
        ['Gender', details.gender || ''],
        ['Math %', String(details.academic_scores?.math_pct ?? '')],
        ['Science %', String(details.academic_scores?.science_pct ?? '')],
        ['Language %', String(details.academic_scores?.language_pct ?? '')],
        ['Rank', String(details.academic_scores?.rank ?? '')],
      ],
      `${doc.filename.replace(/\.\w+$/, '')}_verified.csv`
    );
  };

  return (
    <div className="app-container">
      <DocHeader title="SSIAR — Verified View" onClose={onClose} />

      <div className="flex justify-end gap-2 px-5 py-3">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download size={14} /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPageViewer(1)}>
          Page 1
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPageViewer(2)}>
          Page 2
        </Button>
        <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? ' Saving...' : ' Save Changes'}
        </Button>
      </div>

      <div className="px-5 pb-5">
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm mb-4 flex items-center gap-1 text-emerald-500">
              <Check size={14} /> Verified — {doc.filename}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="text-xs block text-[var(--text-muted)]">{f.label}</label>
                  <div className="flex items-center gap-2 py-1">
                    <Input
                      className="w-[100px] text-sm font-medium"
                      value={getVal(f.key)} onChange={e => setVal(f.key, e.target.value)}
                      onFocus={e => handleInputFocus(e, f.key)} onBlur={handleInputBlur}
                    />
                    <div ref={el => { cropRefs.current[f.key] = el; }} className="leading-none"
                      onMouseEnter={e => handleCropEnter(e, f.key)}
                      onMouseMove={e => handleCropMove(e, f.key)}
                      onMouseLeave={handleCropLeave}>
                      {v2Trust[f.key]?.polygon ? (
                        <CanvasCrop
                          pageUrl={api.getPageUrl(doc.id, v2Trust[f.key]?.page || 1)}
                          polygon={v2Trust[f.key]?.polygon as number[] | undefined}
                          className="w-[120px] h-[30px] object-contain border border-[var(--color-border)] bg-black/15 rounded cursor-zoom-in"
                          onDataUrl={url => { cropDataUrls.current[f.key] = url; }}
                        />
                      ) : (
                        <div className="w-[120px] h-[30px] bg-black/15 rounded border border-[var(--color-border)]" />
                      )}
                    </div>
                    {reprocessingField === f.key ? (
                      <Loader2 size={14} className="animate-spin shrink-0 text-[var(--accent-cyan)]" />
                    ) : (
                      <button onClick={() => handleReprocessField(f.key)}
                        title="Re-run OCR on this field"
                        className="bg-none border-none cursor-pointer p-0.5 opacity-50 text-sm">⟳</button>
                    )}
                  </div>
                </div>
              ))}
              <div>
                <label className="text-xs block text-[var(--text-muted)]">Consent</label>
                <div className="flex items-center gap-2 py-1">
                  {['Yes', 'No', 'Unanswered'].map(c => {
                    const isConsentActive = (details.consent || 'Unanswered') === c;
                    return (
                      <button key={c} onClick={() => onDetailsChange?.({ ...details, consent: c })}
                        className={`
                          px-3 py-[4px] rounded text-xs font-semibold cursor-pointer border text-center
                          ${isConsentActive
                            ? 'bg-emerald-500/15 border-[var(--accent-emerald)] text-[var(--accent-emerald)]'
                            : 'bg-[var(--bg-highlight)] border-[var(--color-border)] text-[var(--text-secondary)]'
                          }
                        `}
                      >{c}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs block text-[var(--text-muted)]">Remarks</label>
                <div className="flex items-center gap-2 py-1">
                  <textarea
                    className="w-full text-sm px-2 py-1 resize-y rounded h-[50px] bg-[var(--bg-secondary)] border border-[var(--color-border)] text-[var(--text-primary)]"
                    value={details.remarks || ''} onChange={e => {
                      if (onDetailsChange) onDetailsChange({ ...details, remarks: e.target.value });
                    }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SdqGrid docId={doc.id} responses={details.responses || {}}
        checkboxConf={details.confidence_scores?.checkbox || {}}
        multiTicks={details.confidence_scores?.multi_ticks || {}}
        v2Trust={v2Trust}
        onChange={newResp => onDetailsChange?.({ ...details, responses: newResp })}
        onZoom={setZoomImg} />

      <ZoomPopup zoom={zoomImg} />
      {pageViewer && <PageViewer docId={doc.id} pageNum={pageViewer} onClose={() => setPageViewer(null)} onChangePage={setPageViewer} />}
    </div>
  );
};
