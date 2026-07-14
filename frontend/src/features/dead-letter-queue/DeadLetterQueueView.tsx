import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Search, ArrowUpDown, Check, AlertTriangle, ArrowRight, Sparkles, Image, Scan, BarChart, FileWarning, Hash, X, ArrowLeft, ArrowRightCircle } from 'lucide-react';
import type { DlqTask, Document as AppDocument } from '@/api';
import { api, clearApiCache } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';

interface FullPagePreviewProps {
  pageUrl: string;
  polygon?: number[];
}

const FullPagePreview: React.FC<FullPagePreviewProps> = ({ pageUrl, polygon }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!isMounted) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError(true);
        setLoading(false);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;

      const maxW = container.clientWidth - 4;
      const maxH = window.innerHeight * 0.65;
      const scale = Math.min(maxW / imgW, maxH / imgH, 1);

      const displayW = imgW * scale;
      const displayH = imgH * scale;

      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;

      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, displayW, displayH);

      if (polygon && polygon.length >= 8) {
        ctx.beginPath();
        ctx.moveTo(polygon[0] * scale, polygon[1] * scale);
        ctx.lineTo(polygon[2] * scale, polygon[3] * scale);
        ctx.lineTo(polygon[4] * scale, polygon[5] * scale);
        ctx.lineTo(polygon[6] * scale, polygon[7] * scale);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';
        ctx.fill();
      }

      setLoading(false);
    };
    img.onerror = () => {
      if (isMounted) { setError(true); setLoading(false); }
    };
    img.src = pageUrl;
    return () => { isMounted = false; };
  }, [pageUrl, polygon]);

  return (
    <div ref={containerRef} className="relative w-full flex items-center justify-center bg-muted/30 overflow-hidden rounded-lg border border-border min-h-[200px] max-h-[65vh]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background">
          <Loader2 className="animate-spin text-primary" size={20} />
          <span className="text-xs text-muted-foreground">Loading Full Page...</span>
        </div>
      )}
      {error ? (
        <div className="p-8 text-center text-xs text-destructive flex items-center gap-1.5 justify-center">
          <AlertTriangle size={14} /> Failed to load full page image.
        </div>
      ) : (
        <div className="w-full flex justify-center p-2">
          <canvas ref={canvasRef} role="img" aria-label="Full page document preview" />
        </div>
      )}
    </div>
  );
};

const labelMap: Record<string, string> = {
  roll_number: 'Roll Number',
  class: 'Class',
  dob: 'Date of Birth',
  gender: 'Gender',
  math_pct: 'Math %',
  science_pct: 'Science %',
  language_pct: 'Language %',
  rank: 'Rank',
  consent: 'Consent',
};

const getFieldLabel = (name: string) => {
  if (name.startsWith('q') && /^\d+$/.test(name.slice(1))) return `SDQ Question ${name.slice(1)}`;
  return labelMap[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const sdqLabels: Record<number, string> = { 1: 'Unhappy', 2: 'Angry', 3: 'Calm', 0: 'Unanswered' };

const formatSdqValue = (val: string): string => {
  if (!val || val === '0') return '0 (Unanswered)';
  try {
    if (val.startsWith('[') && val.endsWith(']')) {
      const arr: number[] = JSON.parse(val);
      if (arr.length === 0) return '0 (Unanswered)';
      return arr.map(v => `${v} (${sdqLabels[v] || '?'})`).join(', ');
    }
    if (val.includes(',')) {
      return val.split(',').map(x => {
        const n = parseInt(x.trim());
        return isNaN(n) ? x.trim() : `${n} (${sdqLabels[n] || '?'})`;
      }).join(', ');
    }
    const n = parseInt(val);
    if (!isNaN(n)) return `${n} (${sdqLabels[n] || '?'})`;
  } catch {}
  return val;
};

const ErrorDetail: React.FC<{ error_details: string }> = ({ error_details }) => {
  const info = error_details === 'unanswered'
    ? { label: 'Blank / Not Detected', desc: 'Field was left blank, crossed out, or could not be read' }
    : error_details === 'multi_tick'
    ? { label: 'Multiple Selections', desc: 'More than one checkbox was marked for a single-answer field' }
    : { label: 'Low Confidence', desc: error_details || 'OCR confidence is below the required threshold' };

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
      <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
      <div>
        <div className="text-[11px] font-semibold text-destructive">{info.label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{info.desc}</div>
      </div>
    </div>
  );
};

const DiffRow: React.FC<{ original: string; corrected: string; fieldName?: string }> = ({ original, corrected, fieldName }) => {
  const isSdq = fieldName?.startsWith('q') && /^\d+$/.test((fieldName ?? '').slice(1));
  const displayOriginal = isSdq ? formatSdqValue(original) : original || '';
  const displayCorrected = isSdq ? formatSdqValue(corrected) : corrected || '';
  const hasChanged = original !== corrected;
  const origDisplay = displayOriginal || <span className="italic font-normal text-muted-foreground/50 text-xs">&mdash;</span>;
  const corrDisplay = displayCorrected || <span className="italic font-normal text-muted-foreground/50 text-xs">Blank (marked)</span>;

  if (corrected === '' && !original) {
    return (
      <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary/30 border border-dashed border-border text-muted-foreground text-xs">
        <FileWarning size={12} /> No value to compare
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
      <div className={`p-3 rounded-lg border ${hasChanged ? 'bg-warning/5 border-warning/20' : 'bg-secondary/20 border-border'}`}>
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">OCR Extracted</div>
        <div className={`font-mono text-sm font-bold ${hasChanged ? 'text-warning line-through' : 'text-foreground'}`}>
          {origDisplay}
        </div>
      </div>

      <div className="flex flex-col items-center gap-0.5">
        {hasChanged ? (
          <>
            <ArrowRightCircle size={18} className="text-success" />
            <span className="text-[8px] font-semibold text-success uppercase tracking-wider">Fixed</span>
          </>
        ) : (
          <>
            <Check size={16} className="text-muted-foreground/40" />
            <span className="text-[8px] text-muted-foreground/40 uppercase tracking-wider">Same</span>
          </>
        )}
      </div>

      <div className={`p-3 rounded-lg border ${hasChanged ? 'bg-success/5 border-success/25' : 'bg-secondary/20 border-border'}`}>
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Corrected</div>
        <div className="font-mono text-sm font-bold text-success">
          {corrDisplay}
        </div>
      </div>
    </div>
  );
};

const c = (base: string, ...extras: (string | false | undefined | null)[]) =>
  [base, ...extras.filter(Boolean)].join(' ');

const CONF_HIGH = 0.8;
const CONF_MED = 0.5;

function getConfStyle(score: number) {
  if (score >= CONF_HIGH) return { text: 'text-success', badge: 'success' as const };
  if (score >= CONF_MED) return { text: 'text-warning', badge: 'warning' as const };
  return { text: 'text-destructive', badge: 'error' as const };
}

export const DeadLetterQueueView: React.FC = () => {
  const { show } = useToast();

  const [tasks, setTasks] = useState<DlqTask[]>([]);
  const [failedDocs, setFailedDocs] = useState<AppDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedFailedDocId, setSelectedFailedDocId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbTotalCount, setDbTotalCount] = useState(0);
  const [reprocessingFailed, setReprocessingFailed] = useState(false);

  const [resolvedSessionCount, setResolvedSessionCount] = useState(0);
  const [initialTotalCount, setInitialTotalCount] = useState(0);

  const [search, setSearch] = useState('');
  const [fieldType, setFieldType] = useState<'all' | 'demographic' | 'sdq'>('all');
  const [priority, setPriority] = useState<'all' | 'critical' | 'low_trust'>('all');
  const [errorType, setErrorType] = useState('all');
  const [sortBy, setSortBy] = useState('filename');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [previewMode, setPreviewMode] = useState<'crop' | 'full'>('crop');
  const [cropLoading, setCropLoading] = useState(true);

  const [inputValue, setInputValue] = useState('');
  const [isValidDate, setIsValidDate] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [data, docs] = await Promise.all([
        api.getDlqTasks({
          field_type: fieldType !== 'all' ? fieldType : undefined,
          priority: priority !== 'all' ? priority : undefined,
          error_type: errorType !== 'all' ? errorType : undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        }),
        api.listDocuments(['id', 'status', 'filename', 'created_at', 'error_message']).catch(() => [] as AppDocument[]),
      ]);
      setTasks(data.tasks);
      const failed = docs.filter(d => d.status === 'failed');
      setFailedDocs(failed);
      setDbTotalCount(data.total + failed.length);

      if (initialTotalCount === 0) {
        setInitialTotalCount(data.total + failed.length);
        setResolvedSessionCount(0);
      }

      const totalItems = data.tasks.length + failed.length;
      if (totalItems > 0) {
        if (failed.length > 0 && !selectedFailedDocId && !selectedTaskId) {
          setSelectedFailedDocId(failed[0].id);
          setSelectedTaskId(null);
        } else if (data.tasks.length > 0 && !selectedTaskId) {
          setSelectedTaskId(data.tasks[0].id);
          setSelectedFailedDocId(null);
        }
      } else {
        setSelectedTaskId(null);
        setSelectedFailedDocId(null);
      }
    } catch (err) {
      console.error(err);
      show('Failed to fetch DLQ tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [fieldType, priority, errorType, sortBy, sortDir, selectedTaskId, selectedFailedDocId, show, initialTotalCount]);

  useEffect(() => {
    loadTasks();
  }, [fieldType, priority, errorType, sortBy, sortDir]);

  const resetProgressStats = () => {
    setInitialTotalCount(0);
    setResolvedSessionCount(0);
    loadTasks();
  };

  const activeTask = tasks.find(t => t.id === selectedTaskId) || null;
  const activeFailedDoc = failedDocs.find(d => d.id === selectedFailedDocId) || null;

  const formatDateStr = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let s = '';
    if (digits.length > 2) s = digits.slice(0, 2) + '/' + digits.slice(2);
    else s = digits;
    if (s.length > 5) s = s.slice(0, 5) + '/' + s.slice(5);
    return s;
  };

  useEffect(() => {
    if (activeTask) {
      setCropLoading(true);
      const raw = activeTask.original_value || '';
      if (activeTask.field_name === 'dob') {
        setInputValue(formatDateStr(raw));
      } else {
        setInputValue(raw);
      }
      setIsValidDate(true);
      if (!activeTask.field_name.startsWith('q')) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } else {
      setInputValue('');
    }
  }, [selectedTaskId, activeTask]);

  // Prefetch adjacent task crop images
  useEffect(() => {
    if (!activeTask || tasks.length === 0) return;
    const idx = tasks.findIndex(t => t.id === activeTask.id);
    if (idx === -1) return;
    const prefetch = (task: DlqTask) => {
      const img = new window.Image();
      img.src = api.getCropUrl(task.document_id, task.field_name);
    };
    for (let i = 1; i <= 2; i++) {
      if (idx + i < tasks.length) prefetch(tasks[idx + i]);
    }
    if (idx - 1 >= 0) prefetch(tasks[idx - 1]);
  }, [activeTask?.id, tasks]);

  const handleDateChange = (val: string) => {
    let digits = val.replace(/\D/g, '').slice(0, 8);

    let formatted = '';
    if (digits.length > 2) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    } else {
      formatted = digits;
    }
    if (formatted.length > 5) {
      formatted = formatted.slice(0, 5) + '/' + formatted.slice(5);
    }

    setInputValue(formatted);

    const parts = formatted.split('/');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        const date = new Date(y, m - 1, d);
        const isVal = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && y >= 1990 && y <= 2030;
        setIsValidDate(isVal);
        return;
      }
    }
    setIsValidDate(formatted === '' ? true : false);
  };

  const handleResolve = async (customVal?: string) => {
    if (!activeTask) return;
    const finalVal = customVal !== undefined ? customVal : inputValue;

    if (activeTask.field_name === 'dob' && !isValidDate && finalVal !== '') {
      show('Please enter a valid date in DD/MM/YYYY format or clear the field', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await api.submitDlqResolution(activeTask.id, finalVal);
      clearApiCache();
      show(result.message || `Resolved ${activeTask.field_name} successfully`);

      setResolvedSessionCount(prev => prev + 1);

      const nextTasks = tasks.filter(t => t.id !== activeTask.id);
      setTasks(nextTasks);

      if (nextTasks.length > 0) {
        const currentIndex = tasks.findIndex(t => t.id === activeTask.id);
        const nextIndex = currentIndex + 1 < tasks.length ? currentIndex : 0;
        setSelectedTaskId(nextTasks[nextIndex]?.id || nextTasks[0].id);
      } else {
        setSelectedTaskId(null);
      }
    } catch (err: any) {
      show(`Failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkBlank = () => { setInputValue(''); handleResolve(''); };
  const handleSkip = () => {
    if (!activeTask) return;
    const currentIndex = tasks.findIndex(t => t.id === activeTask.id);
    if (currentIndex < tasks.length - 1) {
      setSelectedTaskId(tasks[currentIndex + 1].id);
    } else if (tasks.length > 1) {
      setSelectedTaskId(tasks[0].id);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeTask) return;
      const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (activeTask.field_name === 'consent' && !isTyping) {
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); handleResolve('Yes'); }
        else if (e.key.toLowerCase() === 'n') { e.preventDefault(); handleResolve('No'); }
        else if (e.key.toLowerCase() === 'u') { e.preventDefault(); handleResolve('Unanswered'); }
      }

      if (activeTask.field_name === 'gender' && !isTyping) {
        if (e.key.toLowerCase() === 'm') { e.preventDefault(); handleResolve('M'); }
        else if (e.key.toLowerCase() === 'f') { e.preventDefault(); handleResolve('F'); }
      }

      if (activeTask.field_name.startsWith('q') && !isTyping) {
        if (['1', '2', '3', '0'].includes(e.key)) { e.preventDefault(); handleResolve(e.key); }
      }

      if (e.key === 'Enter') {
        if (!isTyping || document.activeElement === inputRef.current) { e.preventDefault(); handleResolve(); }
      }

      if (e.key.toLowerCase() === 's' && !isTyping) { e.preventDefault(); handleSkip(); }
      if (e.key.toLowerCase() === 'e' && !isTyping) { e.preventDefault(); handleMarkBlank(); }
      if (e.key === 'b' && e.altKey) { e.preventDefault(); handleMarkBlank(); }
      if (e.key === 'v' && e.altKey) { e.preventDefault(); setPreviewMode(m => m === 'crop' ? 'full' : 'crop'); }
      if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); handleSkip(); }
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        const currentIndex = tasks.findIndex(t => t.id === activeTask.id);
        if (currentIndex > 0) setSelectedTaskId(tasks[currentIndex - 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTask, inputValue, isValidDate, tasks, selectedTaskId]);

  const distinctErrors = Array.from(new Set(tasks.map(t => t.error_details).filter(Boolean)));

  const filteredTasks = tasks.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.filename.toLowerCase().includes(q) ||
      t.field_name.toLowerCase().includes(q) ||
      t.original_value.toLowerCase().includes(q);
  });

  const totalInSession = initialTotalCount || dbTotalCount;
  const progressPercent = totalInSession > 0 ? Math.round((resolvedSessionCount / totalInSession) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0 overflow-y-auto md:overflow-hidden" style={{ height: 'calc(100vh - 9rem)' }}>
      {/* ── Left Sidebar: Filtered Task List ── */}
      <Card className="flex flex-col md:h-full overflow-hidden">
        <div className="p-4 border-b border-border space-y-3 shrink-0">
          <Card className="p-3 bg-card">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <BarChart size={12} className="text-primary" /> Progress
              </span>
              <span className="font-bold tabular-nums">
                {resolvedSessionCount}/{totalInSession}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground flex justify-between items-center pt-1.5">
              <span className="tabular-nums">{dbTotalCount} remaining</span>
              {resolvedSessionCount > 0 && (
                <span className="text-success font-semibold flex items-center gap-0.5">
                  <Check size={9} /> {progressPercent}%
                </span>
              )}
            </div>
          </Card>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search PDF or field..."
              aria-label="Search tasks"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>

          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="dlq-field-type" className="block text-muted-foreground mb-1 text-[10px] font-semibold">Field Type</label>
                <select id="dlq-field-type"
                  value={fieldType}
                  onChange={e => { setFieldType(e.target.value as 'all' | 'demographic' | 'sdq'); resetProgressStats(); }}
                  className="w-full h-8 px-2 border border-border rounded-lg bg-secondary/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                >
                  <option value="all">All Fields</option>
                  <option value="demographic">Demographic</option>
                  <option value="sdq">SDQ</option>
                </select>
              </div>
              <div>
                <label htmlFor="dlq-priority" className="block text-muted-foreground mb-1 text-[10px] font-semibold">Priority</label>
                <select id="dlq-priority"
                  value={priority}
                  onChange={e => { setPriority(e.target.value as 'all' | 'critical' | 'low_trust'); resetProgressStats(); }}
                  className="w-full h-8 px-2 border border-border rounded-lg bg-secondary/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                >
                  <option value="all">All</option>
                  <option value="critical">Critical</option>
                  <option value="low_trust">Low Trust</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="dlq-error-type" className="block text-muted-foreground mb-1 text-[10px] font-semibold">Error Type</label>
                <select id="dlq-error-type"
                  value={errorType}
                  onChange={e => { setErrorType(e.target.value); resetProgressStats(); }}
                  className="w-full h-8 px-2 border border-border rounded-lg bg-secondary/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                >
                  <option value="all">All</option>
                  {distinctErrors.map(err => (
                    <option key={err} value={err}>{err}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dlq-sort-by" className="block text-muted-foreground mb-1 text-[10px] font-semibold">Sort By</label>
                <div className="flex items-center gap-1">
                  <select id="dlq-sort-by"
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value); resetProgressStats(); }}
                    className="flex-1 h-8 px-2 border border-border rounded-lg bg-secondary/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  >
                    <option value="filename">Filename</option>
                    <option value="priority">Priority</option>
                    <option value="confidence">Confidence</option>
                    <option value="created_at">Date</option>
                  </select>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); resetProgressStats(); }}>
                    <ArrowUpDown size={11} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <Loader2 className="animate-spin text-primary" size={18} />
              <span className="text-xs font-medium">Loading tasks...</span>
            </div>
          ) : filteredTasks.length === 0 && failedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-3">
              <FileWarning size={18} className="text-muted-foreground/60" />
              <span className="text-xs font-medium">No unresolved fields</span>
              {search && <span className="text-[10px] text-muted-foreground/60">Try adjusting your search</span>}
            </div>
          ) : (
            <>
              {failedDocs.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => { setSelectedFailedDocId(doc.id); setSelectedTaskId(null); }}
                  className={c(
                    'group relative pl-3 pr-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 border mb-1',
                    selectedFailedDocId === doc.id
                      ? 'bg-destructive/8 border-destructive/20'
                      : 'bg-transparent border-transparent hover:bg-secondary/40 hover:border-border'
                  )}
                >
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-destructive" />
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="inline-flex items-center rounded-md border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      Failed
                    </span>
                  </div>
                  <div className="font-semibold text-xs mb-1 truncate">{doc.filename}</div>
                  <div className="flex items-center gap-1 text-[9px] text-destructive font-medium">
                    <AlertTriangle size={8} className="shrink-0" />
                    <span className="truncate">{doc.error_message || 'Processing failed'}</span>
                  </div>
                </div>
              ))}
              {failedDocs.length > 0 && tasks.length > 0 && <div className="border-t border-border/40 my-2" />}
            {filteredTasks.map(t => {
              const isSdq = t.field_name.startsWith('q') && t.field_name.substring(1).match(/^\d+$/);
              const confStyle = getConfStyle(t.confidence_score);
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className={c(
                    'group relative pl-3 pr-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 border',
                    selectedTaskId === t.id
                      ? 'bg-primary/8 border-primary/20'
                      : 'bg-transparent border-transparent hover:bg-secondary/40 hover:border-border'
                  )}
                >
                  <div className={c(
                    'absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full',
                    t.priority === 'critical' ? 'bg-destructive' : 'bg-warning'
                  )} />
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={c('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                      t.priority === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-warning/10 text-warning border-warning/20'
                    )}>
                      {t.priority}
                    </span>
                    <span className={c('text-[10px] font-semibold tabular-nums', confStyle.text)}>
                      {Math.round(t.confidence_score * 100)}%
                    </span>
                  </div>
                  <div className="font-semibold text-xs mb-1 truncate flex items-center gap-1.5">
                    {isSdq ? <Hash size={10} className="shrink-0 text-muted-foreground" /> : null}
                    {getFieldLabel(t.field_name)}
                    {isSdq && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-normal ml-auto">SDQ</Badge>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate mb-1">{t.filename}</div>
                  <div className="flex items-center gap-1 text-[9px] text-destructive font-medium">
                    <AlertTriangle size={8} className="shrink-0" />
                    <span className="truncate">{t.error_details || 'Low Confidence'}</span>
                  </div>
                </div>
              );
            })}
          </>
          )}
        </div>
      </Card>

      {/* ── Right Panel: Detail View ── */}
      <div className="md:col-span-2 flex flex-col md:h-full overflow-hidden">
        {activeFailedDoc ? (
          <Card className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <AlertTriangle size={40} className="text-destructive/60" />
            <h2 className="text-base font-bold">Processing Failed</h2>
            <p className="text-xs text-muted-foreground max-w-md">{activeFailedDoc.filename}</p>
            {activeFailedDoc.error_message && (
              <div className="w-full max-w-md rounded-lg p-3 text-xs text-left text-destructive bg-destructive/5 border border-destructive/20">
                <strong>Error:</strong> {activeFailedDoc.error_message}
              </div>
            )}
            <Button
              variant="default"
              size="sm"
              disabled={reprocessingFailed}
              onClick={async () => {
                setReprocessingFailed(true);
                try {
                  await api.reprocessDocument(activeFailedDoc.id);
                  show('Reprocessing started', 'success');
                  setFailedDocs(prev => prev.filter(d => d.id !== activeFailedDoc.id));
                  setSelectedFailedDocId(null);
                  loadTasks();
                } catch (e: any) {
                  show('Failed to reprocess: ' + e.message, 'error');
                } finally {
                  setReprocessingFailed(false);
                }
              }}
              className="gap-2"
            >
              {reprocessingFailed ? <Loader2 size={14} className="animate-spin" /> : null}
              {reprocessingFailed ? 'Reprocessing...' : 'Reprocess Document'}
            </Button>
          </Card>
        ) : activeTask ? (
          <Card className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0 gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className={c(
                  'w-2.5 h-2.5 rounded-full shrink-0',
                  activeTask.priority === 'critical' ? 'bg-destructive' : 'bg-warning'
                )} />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold truncate">{getFieldLabel(activeTask.field_name)}</h2>
                  <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                    <span className="truncate max-w-[200px]">{activeTask.filename}</span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span>Page {activeTask.page_number}</span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span className={getConfStyle(activeTask.confidence_score).text + ' font-semibold'}>
                      {Math.round(activeTask.confidence_score * 100)}% conf
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center bg-secondary/30 p-0.5 rounded-lg shrink-0 border border-border/50">
                <Button variant="ghost" size="sm" onClick={() => activeTask.polygon && setPreviewMode('crop')}
                  className={c(
                    'h-7 px-3 text-[10px] font-bold rounded-md transition-all',
                    !activeTask.polygon ? 'opacity-40 cursor-not-allowed' : '',
                    previewMode === 'crop' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'
                  )}>
                  <Scan size={12} className="mr-1" /> Field
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPreviewMode('full')}
                  className={c(
                    'h-7 px-3 text-[10px] font-bold rounded-md transition-all',
                    previewMode === 'full' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'
                  )}>
                  <Image size={12} className="mr-1" /> Full Page
                </Button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-5 space-y-5">

                {/* ── Section 1: Image Preview ── */}
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      {previewMode === 'crop' ? <Scan size={10} /> : <Image size={10} />}
                      {previewMode === 'crop' ? 'Field Crop' : 'Full Page'}
                    </span>
                    <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground/60 font-mono border border-border">Alt+V</kbd>
                  </div>
                  {previewMode === 'crop' ? (
                    <div className="w-full relative flex items-center justify-center p-4 border border-border rounded-lg bg-secondary/10 overflow-hidden min-h-[120px]">
                      {cropLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <Loader2 className="animate-spin text-primary" size={16} />
                        </div>
                      )}
                      <img
                        src={api.getCropUrl(activeTask.document_id, activeTask.field_name)}
                        alt={getFieldLabel(activeTask.field_name)}
                        className="max-w-full max-h-[160px] object-contain rounded"
                        onLoad={() => setCropLoading(false)}
                        onError={() => setCropLoading(false)}
                      />
                    </div>
                  ) : (
                    <FullPagePreview
                      pageUrl={api.getPageUrl(activeTask.document_id, activeTask.page_number)}
                      polygon={activeTask.polygon ?? undefined}
                    />
                  )}
                </div>

                {/* ── Section 2: Diff Comparison ── */}
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                    <ArrowUpDown size={10} /> OCR vs Corrected
                  </div>
                  <DiffRow original={activeTask.original_value || ''} corrected={inputValue} fieldName={activeTask.field_name} />
                </div>

                {/* ── Section 3: Issue Details ── */}
                {activeTask.error_details && (
                  <ErrorDetail error_details={activeTask.error_details} />
                )}

                {/* ── Section 4: Correction Input ── */}
                <Card>
                  <CardContent className="pt-4 space-y-4">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={11} className="text-primary" /> Correction
                    </span>

                    {/* DOB */}
                    {activeTask.field_name === 'dob' && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span>Correct Date</span>
                          <span className="text-[10px] text-muted-foreground/60">DD/MM/YYYY</span>
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              ref={inputRef}
                              type="text"
                              value={inputValue}
                              placeholder="e.g. 24/08/2009"
                              onChange={e => handleDateChange(e.target.value)}
                              className={c(
                                'h-10 text-sm',
                                inputValue === '' ? '' : isValidDate ? 'border-success ring-1 ring-success/30' : 'border-destructive ring-1 ring-destructive/30'
                              )}
                            />
                            {inputValue && (
                              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                {isValidDate ? (
                                  <Check size={16} className="text-success" />
                                ) : (
                                  <X size={16} className="text-destructive" />
                                )}
                              </div>
                            )}
                          </div>
                          <Button variant="outline" onClick={handleMarkBlank} className="shrink-0 h-10 px-3 text-xs">Blank</Button>
                        </div>
                        {inputValue && !isValidDate && (
                          <p className="text-[10px] font-medium text-destructive flex items-center gap-1">
                            <X size={10} /> Invalid date. Use DD/MM/YYYY format with a valid date between 1990-2030.
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">Slash (/) is inserted automatically &mdash; just type the digits.</p>
                      </div>
                    )}

                    {/* Consent */}
                    {activeTask.field_name === 'consent' && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span>Consent</span>
                          <span className="text-[10px] text-muted-foreground/60 font-normal gap-1 flex">
                            <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">Y</kbd>
                            <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">N</kbd>
                            <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">U</kbd>
                          </span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['Yes', 'No', 'Unanswered'].map(opt => (
                            <Button key={opt}
                              variant={inputValue === opt ? 'default' : 'outline'}
                              onClick={() => { setInputValue(opt); handleResolve(opt); }}
                              className="h-10 text-sm font-medium">
                              {opt}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Gender */}
                    {activeTask.field_name === 'gender' && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span>Gender</span>
                          <span className="text-[10px] text-muted-foreground/60 gap-1 flex">
                            <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">M</kbd>
                            <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">F</kbd>
                          </span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={inputValue === 'M' ? 'default' : 'outline'}
                            onClick={() => { setInputValue('M'); handleResolve('M'); }}
                            className="h-11 text-sm font-medium"
                          >Male</Button>
                          <Button
                            variant={inputValue === 'F' ? 'default' : 'outline'}
                            onClick={() => { setInputValue('F'); handleResolve('F'); }}
                            className="h-11 text-sm font-medium"
                          >Female</Button>
                        </div>
                      </div>
                    )}

                    {/* SDQ */}
                    {activeTask.field_name.startsWith('q') && (() => {
                      let selectedVals: number[] = [];
                      try {
                        if (inputValue.startsWith('[') && inputValue.endsWith(']')) selectedVals = JSON.parse(inputValue);
                        else if (inputValue.includes(',')) selectedVals = inputValue.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                        else if (inputValue && !isNaN(parseInt(inputValue))) selectedVals = [parseInt(inputValue)];
                      } catch { selectedVals = []; }

                      const handleToggle = (valNum: number) => {
                        if (valNum === 0) { setInputValue('0'); return; }
                        let next: number[];
                        if (selectedVals.includes(0)) next = [valNum];
                        else if (selectedVals.includes(valNum)) next = selectedVals.filter(x => x !== valNum);
                        else next = [...selectedVals, valNum].sort();
                        setInputValue(next.length === 0 ? '0' : JSON.stringify(next));
                      };

                      return (
                        <div className="space-y-3">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span>SDQ Response</span>
                            <span className="text-[10px] text-muted-foreground/60 gap-1 flex">
                              <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">1</kbd>
                              <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">2</kbd>
                              <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">3</kbd>
                              <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">0</kbd>
                            </span>
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { val: 1, label: 'Unhappy' },
                              { val: 2, label: 'Angry' },
                              { val: 3, label: 'Calm' },
                              { val: 0, label: 'Unanswered' },
                            ].map(opt => {
                              const isSelected = selectedVals.includes(opt.val);
                              return (
                                <Button key={opt.val} type="button"
                                  variant={isSelected ? 'default' : 'outline'}
                                  onClick={() => handleToggle(opt.val)}
                                  className={c(
                                    'h-16 flex flex-col items-center justify-center gap-0.5 rounded-lg',
                                    isSelected ? 'ring-2 ring-primary' : ''
                                  )}>
                                  <span className="text-lg font-extrabold leading-none">{opt.val}</span>
                                  <span className="text-[9px] text-center leading-tight text-muted-foreground">{opt.label}</span>
                                </Button>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              Selected: <span className="font-semibold text-foreground">{inputValue || '0'}</span>
                            </span>
                            <Button type="button" variant="default" onClick={() => handleResolve(inputValue)} className="h-8 text-xs font-medium">
                              Save &amp; Next
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Generic text input */}
                    {activeTask.field_name !== 'dob' && activeTask.field_name !== 'consent' && activeTask.field_name !== 'gender' && !activeTask.field_name.startsWith('q') && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span>Correct Value</span>
                          <span className="text-[10px] text-muted-foreground/60 font-normal">Enter the correct value from the field image above</span>
                        </label>
                        <div className="flex gap-2">
                          <Input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            placeholder="Type corrected value..."
                            className="flex-1 h-10 text-sm"
                          />
                          <Button variant="outline" onClick={handleMarkBlank} className="shrink-0 h-10 px-3 text-xs">Blank</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Section 5: Actions ── */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" onClick={() => {
                      const ci = tasks.findIndex(t => t.id === activeTask?.id);
                      if (ci > 0) setSelectedTaskId(tasks[ci - 1].id);
                    }} className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground px-2">
                      <ArrowLeft size={12} />
                      <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono text-muted-foreground/80 border border-border">Alt+↑</kbd>
                    </Button>
                    <Button variant="ghost" onClick={handleSkip} className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                      <ArrowRight size={12} />
                      <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono text-muted-foreground/80 border border-border">S</kbd>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleMarkBlank} className="h-8 text-xs gap-1.5">
                      <kbd className="text-[9px] px-1 py-0.5 rounded bg-secondary font-mono border border-border">E</kbd>
                      Mark Blank
                    </Button>
                    <Button onClick={() => handleResolve()}
                      disabled={saving || (activeTask.field_name === 'dob' && !isValidDate && inputValue !== '')}
                      className="font-bold text-xs h-8 flex items-center gap-1.5 px-4">
                      {saving ? <Loader2 className="animate-spin" size={12} /> : <><span>Save &amp; Next</span> <ArrowRight size={12} /></>}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Keys footer */}
            <div className="px-4 py-2 border-t border-border flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground shrink-0">
              <span className="font-semibold text-muted-foreground/50">Keys:</span>
              <span><kbd className="font-semibold text-muted-foreground/80">S</kbd> skip</span>
              <span><kbd className="font-semibold text-muted-foreground/80">E</kbd> blank</span>
              <span><kbd className="font-semibold text-muted-foreground/80">Alt+V</kbd> toggle view</span>
              <span><kbd className="font-semibold text-muted-foreground/80">Enter</kbd> save</span>
              <span><kbd className="font-semibold text-muted-foreground/80">Alt+↑↓</kbd> navigate</span>
              {activeTask.field_name.startsWith('q') && <span><kbd className="font-semibold text-muted-foreground/80">1</kbd>/<kbd className="font-semibold text-muted-foreground/80">2</kbd>/<kbd className="font-semibold text-muted-foreground/80">3</kbd>/<kbd className="font-semibold text-muted-foreground/80">0</kbd> auto-save</span>}
              {activeTask.field_name === 'consent' && <span><kbd className="font-semibold text-muted-foreground/80">Y</kbd>/<kbd className="font-semibold text-muted-foreground/80">N</kbd>/<kbd className="font-semibold text-muted-foreground/80">U</kbd> auto-save</span>}
              {activeTask.field_name === 'gender' && <span><kbd className="font-semibold text-muted-foreground/80">M</kbd>/<kbd className="font-semibold text-muted-foreground/80">F</kbd> auto-save</span>}
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-center justify-center h-full p-10 text-center">
            <Check size={32} className="text-primary mb-4" />
            <h3 className="font-bold text-lg mb-1">Queue Clear!</h3>
            <p className="text-xs text-muted-foreground max-w-sm">All fields resolved. No pending DLQ tasks.</p>
          </Card>
        )}
      </div>
    </div>
  );
};
