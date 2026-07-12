import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Loader2, X, ArrowLeft, ArrowRight, RotateCcw, Hash, Percent, Calendar, User, GraduationCap, ListOrdered, Download, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { Document, DocumentDetails, ZoomImage } from '@/api';
import { api } from '@/api';
import { exportToCsv, cn } from '@/lib/utils';
import { SdqGrid } from '@/features/review/SdqGrid';
import { ConsentRemarks } from '@/features/review/ConsentRemarks';
import { ZoomPopup } from '@/components/ZoomPopup';
import { PageViewer } from '@/features/layout/PageViewer';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CanvasCrop } from '@/features/review/CanvasCrop';

interface Props {
  doc: Document;
  details: DocumentDetails;

  onDetailsChange: (d: DocumentDetails) => void;
  onDirtyChange: (d: boolean) => void;
  reviewIndex: number;
  totalReview: number;
  onClose: () => void;
  onVerify: () => void;
  onReprocess: () => void;
  onNext: () => void;
  onPrev: () => void;
  saving: boolean;
}

const CONF_HIGH = 0.8;
const CONF_MED = 0.5;

const MAIN_FIELDS = [
  { key: 'roll_number', label: 'Roll Number', icon: Hash },
  { key: 'class', label: 'Class', icon: GraduationCap },
  { key: 'dob', label: 'DOB', icon: Calendar },
  { key: 'gender', label: 'Gender', icon: User },
  { key: 'math_pct', label: 'Math %', icon: Percent },
  { key: 'science_pct', label: 'Science %', icon: Percent },
  { key: 'language_pct', label: 'Language %', icon: Percent },
  { key: 'rank', label: 'Rank', icon: ListOrdered },
];

const KBD = ({ children }: { children: React.ReactNode }) => (
  <kbd className="bg-white/[0.06] px-1.5 py-0.5 rounded-[3px] text-[10px] border border-[var(--color-border)] font-mono">{children}</kbd>
);

export const ReviewView: React.FC<Props> = ({ doc, details, onDetailsChange, onDirtyChange, reviewIndex, totalReview, onClose, onVerify, onReprocess, onNext, onPrev, saving }) => {
  const [showAllFields, setShowAllFields] = useState(true);
  const [fieldAccepted, setFieldAccepted] = useState<Record<string, boolean>>({});
  const [flashField, setFlashField] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<ZoomImage | null>(null);
  const [reprocessingField, setReprocessingField] = useState<string | null>(null);
  const [pageViewer, setPageViewer] = useState<1 | 2 | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const rollRef = useRef<HTMLInputElement>(null);
  const origValuesRef = useRef<Record<string, string>>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const cropRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusedFieldRef = useRef<string | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { show } = useToast();

  const reviewFields = details.confidence_scores?.review_fields || [];
  const activeFields = (reviewFields.length > 0 && !showAllFields)
    ? MAIN_FIELDS.filter(f => reviewFields.includes(f.key))
    : MAIN_FIELDS;

  const handleReprocessField = async (key: string) => {
    setReprocessingField(key);
    try {
      const result = await api.reprocessField(doc.id, key);
      if (result.updated && result.value) {
        const newConfScores = { ...details.confidence_scores };
        newConfScores.ocr = { ...(newConfScores.ocr || {}), [key]: result.confidence };
        const updatedField = (k: string) =>
          k === 'roll_number' ? { roll_number: result.value }
          : k === 'class' ? { class: result.value }
          : k === 'dob' ? { dob: result.value }
          : k === 'gender' ? { gender: result.value }
          : { academic_scores: { ...academic, [k]: result.value } as typeof details.academic_scores };
        onDetailsChange({ ...details, ...updatedField(key), confidence_scores: newConfScores } as DocumentDetails);
        show(result.message || `Updated to "${result.value}"`, 'success');
      } else {
        show(result.message || 'Kept existing value (higher confidence)', 'success');
      }
    } catch (e: any) {
      show(e.message || 'Field reprocess failed', 'error');
    } finally {
      setReprocessingField(null);
    }
  };

  const conf = details.confidence_scores?.ocr || {};
  const checkboxConf = details.confidence_scores?.checkbox || {};
  const multiTicks: Record<string, number[]> = details.confidence_scores?.multi_ticks || {};
  const academic: Record<string, string> = details.academic_scores || {};
  const v2Trust = details.confidence_scores?.v2_trust || {};

  const fieldConf = (key: string): number => {
    const vt = details.confidence_scores?.v2_trust?.[key];
    if (vt && typeof vt.trust_confidence === 'number') {
      return vt.trust_confidence;
    }
    const c = conf[key];
    if (typeof c === 'number') return c;
    if (c === 'high_confidence' || c === 'high') return 0.95;
    if (c === 'low_confidence' || c === 'low') return 0.50;
    return 1;
  };

  const isHighConf = (key: string) => fieldConf(key) >= CONF_HIGH;

  const getConfColor = (confidence: number) => {
    if (confidence >= CONF_HIGH) return 'text-[var(--accent-emerald)]';
    if (confidence >= CONF_MED) return 'text-[var(--accent-amber)]';
    return 'text-[var(--accent-rose)]';
  };

  const getConfBg = (confidence: number) => {
    if (confidence >= CONF_HIGH) return 'bg-[var(--accent-emerald)]/10';
    if (confidence >= CONF_MED) return 'bg-[var(--accent-amber)]/10';
    return 'bg-[var(--accent-rose)]/10';
  };

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
    else onDetailsChange({ ...details, academic_scores: { ...academic, [key]: val } as typeof details.academic_scores });
  };

  const handleAccept = useCallback((key: string) => {
    setFieldAccepted(prev => ({ ...prev, [key]: true }));
    setFlashField(key);
    setTimeout(() => setFlashField(null), 600);
  }, []);

  const focusNextField = useCallback((fi: number) => {
    const next = activeFields[fi + 1];
    if (next) {
      const el = fieldRefs.current[next.key];
      if (el) setTimeout(() => el.focus(), 50);
    }
  }, [activeFields]);

  const handleFieldKeyDown = useCallback((e: React.KeyboardEvent, fi: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAccept(activeFields[fi].key);
      focusNextField(fi);
    }
  }, [handleAccept, focusNextField, activeFields]);

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
    if (src) setZoomImg({ src, x: e.clientX, y: e.clientY - 20 });
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pageViewer) {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onVerify();
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
  }, [onClose, onVerify, pageViewer]);


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

  const acceptedCount = activeFields.filter(f => fieldAccepted[f.key]).length;
  const highConfQCount = Array.from({ length: 25 }, (_, i) => `q${i + 1}`).filter(q => {
    const c = checkboxConf[q];
    return c === 'high' || c === 'high_confidence' || !c;
  }).length;

  const dirtyFields = activeFields.filter(f => {
    const val = getFieldVal(f.key);
    return val !== '' && origValuesRef.current[f.key] !== undefined && val !== origValuesRef.current[f.key];
  });

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="logo"><img src="/logo.png" alt="SSIAR" className="h-8 w-auto" /></div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-[var(--text-muted)]">{reviewIndex + 1} / {totalReview}</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPageViewer(1)}>Page 1</Button>
            <Button variant="outline" size="sm" onClick={() => setPageViewer(2)}>Page 2</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const headers = ['Field', 'Value', 'Confidence'];
              const rows = [
                ['Roll Number', details.roll_number || '', String(Math.round(fieldConf('roll_number') * 100)) + '%'],
                ['Class', details.class || '', String(Math.round(fieldConf('class') * 100)) + '%'],
                ['DOB', details.dob || '', String(Math.round(fieldConf('dob') * 100)) + '%'],
                ['Gender', details.gender || '', String(Math.round(fieldConf('gender') * 100)) + '%'],
                ['Math %', (details.academic_scores?.math_pct || ''), String(Math.round(fieldConf('math_pct') * 100)) + '%'],
                ['Science %', (details.academic_scores?.science_pct || ''), String(Math.round(fieldConf('science_pct') * 100)) + '%'],
                ['Language %', (details.academic_scores?.language_pct || ''), String(Math.round(fieldConf('language_pct') * 100)) + '%'],
                ['Rank', (details.academic_scores?.rank || ''), '—'],
              ];
              exportToCsv(headers, rows, `${doc.filename.replace(/\.\w+$/, '')}_data.csv`);
            }}>
              <Download size={14} /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}><X size={14} /> Close</Button>
          </div>
        </div>
      </header>

      <div className="p-5">
        <Card size="sm" className="mb-4">
          <CardContent className="flex justify-between items-center !px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-secondary)]">
                {doc.filename} — {reviewFields.length > 0 && !showAllFields ? (
                  <>
                    Reviewing <b className="text-[var(--accent-amber)]">{reviewFields.length}</b> issue fields ({acceptedCount}/{activeFields.length} accepted)
                  </>
                ) : (
                  <>
                    <b className="text-[var(--text-primary)]">{acceptedCount}/{activeFields.length}</b> main fields accepted
                  </>
                )}
                + <b className="text-[var(--accent-emerald)]">{highConfQCount}/25</b> questions auto-verified
              </span>
              {dirtyFields.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-2 py-0.5 rounded-full">
                  <AlertCircle size={11} />
                  {dirtyFields.length} unsaved change{dirtyFields.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {reviewFields.length > 0 && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAllFields(prev => !prev)}>
                  {showAllFields ? "Show Issues Only" : "Show All Fields (V1 Mode)"}
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-xs"
                onClick={() => {
                  const next = { ...fieldAccepted };
                  for (const f of activeFields) {
                    if (isHighConf(f.key)) next[f.key] = true;
                  }
                  setFieldAccepted(next);
                }}>
                Accept High-Conf ({activeFields.filter(f => isHighConf(f.key)).length})
              </Button>
              <Button variant="default" onClick={onVerify} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? ' Saving...' : ' Save & Next'}
              </Button>
              <Button variant="outline" size="sm" className="text-[var(--accent-amber)]" onClick={onReprocess}>
                <RotateCcw size={14} /> Reprocess
              </Button>
              <Button variant="outline" size="sm" onClick={onPrev} disabled={reviewIndex === 0}>
                <ArrowLeft size={14} /> Prev
              </Button>
              <Button variant="outline" size="sm" onClick={onNext}>
                {reviewIndex + 1 < totalReview ? 'Next' : 'Close'} <ArrowRight size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={onNext} className="text-[var(--text-muted)]">
                Skip <ArrowRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>

        <button
          onClick={() => setShowShortcuts(!showShortcuts)}
          className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3 px-1 transition-colors"
        >
          <span className="font-semibold">Keyboard Shortcuts</span>
          {showShortcuts ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showShortcuts && (
          <Card className="mb-3 glass-card">
            <CardContent className="!p-3">
              <div className="flex gap-4 text-[11px] text-[var(--text-muted)] flex-wrap">
                <span><KBD>←</KBD><KBD>→</KBD> prev/next doc</span>
                <span><KBD>S</KBD> skip doc</span>
                <span><KBD>Tab</KBD> next field</span>
                <span><KBD>Enter</KBD> accept & advance</span>
                <span><KBD>M</KBD> <KBD>F</KBD> gender</span>
                <span><KBD>Y</KBD> <KBD>N</KBD> <KBD>U</KBD> consent</span>
                <span><KBD>1</KBD><KBD>2</KBD><KBD>3</KBD><KBD>0</KBD> SDQ</span>
                <span><KBD>⌘↵</KBD> save & next</span>
                <span><KBD>Esc</KBD> close</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {activeFields.map((f, fi) => {
            const val = getFieldVal(f.key);
            const accepted = fieldAccepted[f.key];
            const confidence = fieldConf(f.key);
            const isClass = f.key === 'class';
            const isGender = f.key === 'gender';
            const isPct = f.key === 'math_pct' || f.key === 'science_pct' || f.key === 'language_pct';
            const isDob = f.key === 'dob';
            const isRoll = f.key === 'roll_number';
            const isRank = f.key === 'rank';
            const isEdited = val !== '' && origValuesRef.current[f.key] !== undefined && val !== origValuesRef.current[f.key];
            const Icon = f.icon;

            return (
              <div key={f.key} className={cn(
                "glass-card rounded-xl overflow-hidden transition-all duration-200",
                flashField === f.key && 'accept-flash',
                accepted ? 'ring-1 ring-[var(--accent-emerald)]/20' : isEdited ? 'ring-1 ring-[var(--accent-amber)]/20' : ''
              )}>
                <div
                  ref={el => { cropRefs.current[f.key] = el; }}
                  className="relative bg-black/20 overflow-hidden cursor-zoom-in"
                  onMouseEnter={e => handleCropEnter(e, f.key)}
                  onMouseMove={e => handleCropMove(e, f.key)}
                  onMouseLeave={handleCropLeave}
                >
                  {v2Trust[f.key]?.polygon ? (
                    <CanvasCrop
                      pageUrl={api.getPageUrl(doc.id, v2Trust[f.key]?.page || 1)}
                      polygon={v2Trust[f.key]!.polygon as number[] | undefined}
                      className="w-full h-[64px] object-contain block"
                      onDataUrl={url => { cropDataUrls.current[f.key] = url; }}
                    />
                  ) : (
                    <div className="w-full h-[64px] flex items-center justify-center text-[var(--text-muted)] text-[10px]">
                      No crop data
                    </div>
                  )}
                  <div className={cn(
                    "absolute top-2 right-2 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md",
                    getConfColor(confidence), getConfBg(confidence)
                  )}>
                    {Math.round(confidence * 100)}%
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                      <Icon size={13} className="text-[var(--text-muted)]" />
                      {f.label}
                    </div>
                    {accepted && (
                      <Check size={14} className="text-[var(--accent-emerald)] shrink-0" />
                    )}
                  </div>

                  <div>
                    {isClass ? (
                      <Input type="number" min="1" max="12"
                        className={`text-[14px] text-center font-semibold premium-input ${isEdited ? 'field-edited-input' : ''}`}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => handleInputFocus(e, f.key)}
                        onBlur={handleInputBlur}
                        onKeyDown={e => handleFieldKeyDown(e, fi)}
                        ref={el => { fieldRefs.current[f.key] = el; }}
                        placeholder="1-12" />
                    ) : isGender ? (
                      <div className="flex gap-1.5"
                        onKeyDown={e => {
                          if (e.key.toLowerCase() === 'm') { setFieldVal(f.key, 'M'); e.preventDefault(); handleAccept(f.key); focusNextField(fi); }
                          else if (e.key.toLowerCase() === 'f') { setFieldVal(f.key, 'F'); e.preventDefault(); handleAccept(f.key); focusNextField(fi); }
                          else handleFieldKeyDown(e, fi);
                        }}>
                        {['M', 'F'].map(g => (
                          <button key={g} onClick={() => { setFieldVal(f.key, g); handleAccept(f.key); focusNextField(fi); }}
                            aria-pressed={val === g}
                            tabIndex={fi === 0 ? 0 : -1}
                            className={`
                              flex-1 py-[5px] rounded text-sm font-semibold cursor-pointer border transition-colors
                              ${val === g
                                ? 'bg-[var(--accent-violet)]/20 border-[var(--accent-violet)] text-[var(--accent-cyan)]'
                                : 'bg-transparent border-[var(--color-border)] text-[var(--text-secondary)] hover:border-[var(--accent-violet)]/40'
                              }
                              ${isEdited ? 'border-[var(--accent-amber)]' : ''}
                            `}
                          >{g}</button>
                        ))}
                      </div>
                    ) : isPct ? (
                      <Input type="number" min="0" max="100"
                        className={`text-[14px] text-center font-semibold premium-input ${isEdited ? 'field-edited-input' : ''}`}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => handleInputFocus(e, f.key)} onBlur={handleInputBlur}
                        onKeyDown={e => handleFieldKeyDown(e, fi)}
                        ref={el => { fieldRefs.current[f.key] = el; }} />
                    ) : isRank ? (
                      <Input type="number" min="1"
                        className={`text-[14px] font-semibold premium-input ${isEdited ? 'field-edited-input' : ''}`}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => handleInputFocus(e, f.key)} onBlur={handleInputBlur}
                        onKeyDown={e => handleFieldKeyDown(e, fi)}
                        ref={el => { fieldRefs.current[f.key] = el; }} />
                    ) : isDob ? (
                      <Input type="text" placeholder="DD/MM/YYYY"
                        className={`text-[14px] font-mono font-semibold tracking-[1px] premium-input ${isEdited ? 'field-edited-input' : ''}`}
                        value={val}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                          let formatted = '';
                          if (digits.length > 0) formatted = digits.slice(0, 2);
                          if (digits.length > 2) formatted += '/' + digits.slice(2, 4);
                          if (digits.length > 4) formatted += '/' + digits.slice(4, 8);
                          setFieldVal(f.key, formatted);
                        }}
                        onFocus={e => handleInputFocus(e, f.key)} onBlur={handleInputBlur}
                        onKeyDown={e => { if (e.key === 'Backspace' && val.endsWith('/')) setFieldVal(f.key, val.slice(0, -1)); handleFieldKeyDown(e, fi); }}
                        ref={el => { fieldRefs.current[f.key] = el; }} />
                    ) : isRoll ? (
                      <Input ref={el => { rollRef.current = el; fieldRefs.current[f.key] = el; }}
                        className={`text-[15px] font-mono font-bold premium-input ${isEdited ? 'field-edited-input' : ''}`}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)} placeholder="Roll #"
                        onFocus={e => handleInputFocus(e, f.key)} onBlur={handleInputBlur}
                        onKeyDown={e => handleFieldKeyDown(e, fi)} />
                    ) : (
                      <Input className={`text-[14px] premium-input ${isEdited ? 'field-edited-input' : ''}`}
                        value={val} onChange={e => setFieldVal(f.key, e.target.value)}
                        onFocus={e => handleInputFocus(e, f.key)} onBlur={handleInputBlur}
                        onKeyDown={e => handleFieldKeyDown(e, fi)}
                        ref={el => { fieldRefs.current[f.key] = el; }} />
                    )}
                    {isEdited && !accepted && (
                      <span className="text-[10px] text-[var(--accent-amber)] mt-1 block font-medium">✎ edited</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    {reprocessingField === f.key ? (
                      <Loader2 size={14} className="animate-spin text-[var(--accent-cyan)]" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleReprocessField(f.key)}
                        aria-label="Re-run OCR on this field"
                        className="h-6 w-6 p-0 text-[var(--text-muted)] hover:text-[var(--accent-cyan)]"
                        title="Re-run OCR"
                      >
                        ⟳
                      </Button>
                    )}
                    {!accepted && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleAccept(f.key)}
                        aria-label="Accept field value"
                        className="h-7 text-[10px] font-semibold border-[var(--accent-emerald)]/30 text-[var(--accent-emerald)] hover:bg-[var(--accent-emerald)]/10 transition-all"
                      >
                        <Check size={11} className="mr-1" /> Accept
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <SdqGrid docId={doc.id} responses={details.responses || {}} checkboxConf={checkboxConf} multiTicks={multiTicks}
          v2Trust={v2Trust}
          onChange={newResp => { onDirtyChange(true); onDetailsChange({ ...details, responses: newResp }); }}
          onZoom={setZoomImg} />

        <ConsentRemarks docId={doc.id} consent={details.consent || 'Unanswered'} remarks={details.remarks || ''}
          v2Trust={v2Trust}
          onConsentChange={v => { onDirtyChange(true); onDetailsChange({ ...details, consent: v }); }}
          onRemarksChange={v => { onDirtyChange(true); onDetailsChange({ ...details, remarks: v }); }}
          onZoom={setZoomImg} />
      </div>

      <ZoomPopup zoom={zoomImg} />
      {pageViewer && <PageViewer docId={doc.id} pageNum={pageViewer} onClose={() => setPageViewer(null)} onChangePage={setPageViewer} />}
    </div>
  );
};