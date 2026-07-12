import React, { useState } from 'react';
import { Check, Download, Loader2, Save } from 'lucide-react';
import type { Document, DocumentDetails } from '@/api';
import { api } from '@/api';
import { exportToCsv } from '@/lib/utils';
import { DocumentHeader } from '@/features/layout/DocumentHeader';
import { PageViewer } from '@/features/layout/PageViewer';
import { ZoomPopup } from '@/components/ZoomPopup';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SdqGrid } from '@/features/review/SdqGrid';
import { CanvasCrop } from '@/features/review/CanvasCrop';
import { useCropZoom } from '@/features/review/useCropZoom';

interface Props {
  doc: Document;
  details: DocumentDetails;
  onClose: () => void;
  onDetailsChange?: (d: DocumentDetails) => void;
}

const FIELDS = [
  { key: 'roll_number', label: 'Roll Number' },
  { key: 'class', label: 'Class' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'math_pct', label: 'Math %' },
  { key: 'science_pct', label: 'Science %' },
  { key: 'language_pct', label: 'Language %' },
  { key: 'rank', label: 'Rank' },
];

export const VerifiedView: React.FC<Props> = ({ doc, details, onClose, onDetailsChange }) => {
  const [saving, setSaving] = useState(false);
  const [pageViewer, setPageViewer] = useState<1 | 2 | null>(null);
  const { show } = useToast();
  const v2Trust = details.confidence_scores?.v2_trust || {};
  const acad = (details.academic_scores || {}) as Record<string, string>;

  const { zoomImg, setZoomImg, cropRefs, cropDataUrls, handleCropEnter, handleCropMove, handleCropLeave } = useCropZoom(0);

  const getVal = (key: string) => {
    if (key === 'roll_number') return details.roll_number || '';
    if (key === 'class') return details.class || '';
    if (key === 'dob') return details.dob || '';
    if (key === 'gender') return details.gender || '';
    return acad[key] || '';
  };

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
      const result = await api.verifyDocument(doc.id, {
        roll_number: details.roll_number || '',
        class_val: details.class || '',
        dob: details.dob || '',
        gender: details.gender || '',
        consent: details.consent || 'Unanswered',
        responses: details.responses || {},
        academic_scores: details.academic_scores || {},
        remarks: details.remarks || '',
      });
      show(result.message || 'Changes saved', 'success');
    } catch (e: any) {
      show(e.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pageViewer) onClose();
      if (e.altKey && e.key === '1') { e.preventDefault(); setPageViewer(1); }
      if (e.altKey && e.key === '2') { e.preventDefault(); setPageViewer(2); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, pageViewer]);

  return (
    <div className="flex flex-col h-full">
      <DocumentHeader title="Verified Document" filename={doc.filename} onClose={onClose} />

      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} className="text-emerald-500" />
          <span className="font-medium">{doc.filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport(doc, details)}>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPageViewer(1)}>Page 1</Button>
          <Button variant="outline" size="sm" onClick={() => setPageViewer(2)}>Page 2</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4">Student Information</h3>
            <div className="grid grid-cols-4 gap-x-6 gap-y-4">
              {FIELDS.map(f => {
                const trust = v2Trust[f.key];
                return (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
                    <div className="flex items-center gap-2">
                      <div ref={el => { cropRefs.current[f.key] = el; }}
                        onMouseEnter={e => handleCropEnter(e, f.key)}
                        onMouseMove={e => handleCropMove(e, f.key)}
                        onMouseLeave={handleCropLeave}
                        className="shrink-0 cursor-zoom-in">
                        {trust?.polygon ? (
                          <CanvasCrop
                            pageUrl={api.getPageUrl(doc.id, trust?.page || 1)}
                            polygon={trust?.polygon as number[] | undefined}
                            className="w-[80px] h-[28px] object-contain border border-border bg-black/10 rounded"
                            onDataUrl={url => { cropDataUrls.current[f.key] = url; }} />
                        ) : (
                          <div className="w-[80px] h-[28px] bg-black/10 rounded border border-border" />
                        )}
                      </div>
                      <Input
                        value={getVal(f.key)}
                        onChange={e => setVal(f.key, e.target.value)}
                        className="text-sm font-medium flex-1" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-border">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Consent</label>
                <div className="flex gap-2">
                  {['Yes', 'No', 'Unanswered'].map(c => {
                    const active = (details.consent || 'Unanswered') === c;
                    return (
                      <button key={c} onClick={() => onDetailsChange?.({ ...details, consent: c })}
                        className={`px-4 h-9 rounded-md text-sm font-medium border transition-colors ${
                          active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'
                        }`}>{c}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Remarks</label>
                <textarea value={details.remarks || ''}
                  onChange={e => onDetailsChange?.({ ...details, remarks: e.target.value })}
                  className="w-full text-sm p-2.5 rounded-md border border-border bg-background resize-y h-[60px]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <SdqGrid
          docId={doc.id}
          responses={details.responses || {}}
          checkboxConf={details.confidence_scores?.checkbox || {}}
          multiTicks={details.confidence_scores?.multi_ticks || {}}
          v2Trust={v2Trust}
          onZoom={setZoomImg}
          onChange={newResp => onDetailsChange?.({ ...details, responses: newResp })} />
      </div>

      <ZoomPopup zoom={zoomImg} />
      {pageViewer && <PageViewer docId={doc.id} pageNum={pageViewer} onClose={() => setPageViewer(null)} onChangePage={setPageViewer} />}
    </div>
  );
};

function handleExport(doc: Document, details: DocumentDetails) {
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
}
