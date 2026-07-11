import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Search, ArrowUpDown, Check, AlertTriangle, ArrowRight, Sparkles, Image, Scan, BarChart, FileWarning, Hash } from 'lucide-react';
import type { DlqTask } from '../api';
import { api } from '../api';
import { CanvasCrop } from './CanvasCrop';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '../context/ToastContext';

interface FullPagePreviewProps {
  pageUrl: string;
  bbox?: number[];
  polygon?: number[];
}

const FullPagePreview: React.FC<FullPagePreviewProps> = ({ pageUrl, bbox, polygon }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

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

      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;

      canvas.width = imgW;
      canvas.height = imgH;

      ctx.drawImage(img, 0, 0);

      if (polygon && polygon.length >= 8) {
        ctx.beginPath();
        ctx.moveTo(polygon[0], polygon[1]);
        ctx.lineTo(polygon[2], polygon[3]);
        ctx.lineTo(polygon[4], polygon[5]);
        ctx.lineTo(polygon[6], polygon[7]);
        ctx.closePath();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.18)';
        ctx.fill();
      } else if (bbox && bbox.length >= 4) {
        const [x0, y0, x1, y1] = bbox;
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 8;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.18)';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }

      setLoading(false);
    };
    img.onerror = () => {
      if (isMounted) {
        setError(true);
        setLoading(false);
      }
    };
    img.src = pageUrl;

    return () => { isMounted = false; };
  }, [pageUrl, bbox, polygon]);

  return (
    <div className="relative w-full flex items-center justify-center bg-black/5 overflow-hidden rounded-xl border min-h-[300px]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-xs text-muted-foreground">Loading Full Page Context...</span>
        </div>
      )}
      {error ? (
        <div className="p-8 text-center text-xs text-destructive flex items-center gap-1.5 justify-center">
          <AlertTriangle size={14} /> Failed to load full page image.
        </div>
      ) : (
        <div className="overflow-auto max-h-[500px] w-full flex justify-center p-2">
          <canvas ref={canvasRef} className="max-w-full h-auto" />
        </div>
      )}
    </div>
  );
};

export const DlqView: React.FC = () => {
  const { show } = useToast();

  const [tasks, setTasks] = useState<DlqTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbTotalCount, setDbTotalCount] = useState(0);

  const [resolvedSessionCount, setResolvedSessionCount] = useState(0);
  const [initialTotalCount, setInitialTotalCount] = useState(0);

  const [search, setSearch] = useState('');
  const [fieldType, setFieldType] = useState<'all' | 'demographic' | 'sdq'>('all');
  const [priority, setPriority] = useState<'all' | 'critical' | 'low_trust'>('all');
  const [errorType, setErrorType] = useState('all');
  const [sortBy, setSortBy] = useState('filename');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [previewMode, setPreviewMode] = useState<'crop' | 'full'>('crop');

  const [inputValue, setInputValue] = useState('');
  const [isValidDate, setIsValidDate] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDlqTasks({
        field_type: fieldType !== 'all' ? fieldType : undefined,
        priority: priority !== 'all' ? priority : undefined,
        error_type: errorType !== 'all' ? errorType : undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setTasks(data.tasks);
      setDbTotalCount(data.total);

      if (initialTotalCount === 0) {
        setInitialTotalCount(data.total);
        setResolvedSessionCount(0);
      }

      if (data.tasks.length > 0) {
        if (!(selectedTaskId && data.tasks.some(t => t.id === selectedTaskId))) {
          setSelectedTaskId(data.tasks[0].id);
        }
      } else {
        setSelectedTaskId(null);
      }
    } catch (err) {
      console.error(err);
      show('Failed to fetch DLQ tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [fieldType, priority, errorType, sortBy, sortDir, selectedTaskId, show, initialTotalCount]);

  useEffect(() => {
    loadTasks();
  }, [fieldType, priority, errorType, sortBy, sortDir]);

  const resetProgressStats = () => {
    setInitialTotalCount(0);
    setResolvedSessionCount(0);
    loadTasks();
  };

  const activeTask = tasks.find(t => t.id === selectedTaskId) || null;

  useEffect(() => {
    if (activeTask) {
      setInputValue(activeTask.original_value || '');
      setIsValidDate(true);
      if (!activeTask.field_name.startsWith('q')) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } else {
      setInputValue('');
    }
  }, [selectedTaskId, activeTask]);

  const handleDateChange = (val: string) => {
    let normalized = val.replace(/[-. ,\\]/g, '/');
    setInputValue(normalized);

    const parts = normalized.split('/');
    if (parts.length === 3) {
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
    setIsValidDate(false);
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
      await api.submitDlqResolution(activeTask.id, finalVal);
      show(`Resolved ${activeTask.field_name} successfully`);

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

  const handleMarkBlank = () => {
    setInputValue('');
    handleResolve('');
  };

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

  const getFormattedFieldName = (name: string) => {
    if (name.startsWith('q') && name.substring(1).match(/^\d+$/)) return `Question ${name.substring(1)}`;
    return name.replace('_', ' ').toUpperCase();
  };

  const totalInSession = initialTotalCount || dbTotalCount;
  const progressPercent = totalInSession > 0 ? Math.round((resolvedSessionCount / totalInSession) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-9rem)] overflow-hidden">
      <div className="flex flex-col border rounded-xl overflow-hidden bg-card h-full shadow-sm">
        <div className="p-4 border-b space-y-3 shrink-0">
          <div className="bg-gradient-to-r from-violet-500/10 to-cyan-500/5 p-3 rounded-lg border border-violet-500/10">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <BarChart size={12} className="text-violet-500" /> Progress
              </span>
              <span className="font-medium text-muted-foreground tabular-nums">
                {resolvedSessionCount}/{totalInSession}
              </span>
            </div>
            <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-violet-500 to-cyan-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground/70 flex justify-between items-center pt-1.5">
              <span className="tabular-nums">{dbTotalCount} remaining</span>
              {resolvedSessionCount > 0 && (
                <span className="text-emerald-500 font-medium flex items-center gap-0.5">
                  <Check size={9} /> {progressPercent}%
                </span>
              )}
            </div>
          </div>

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
                <label htmlFor="dlq-field-type" className="block text-muted-foreground mb-1 text-[10px]">Field Type</label>
                <select id="dlq-field-type"
                  value={fieldType}
                  onChange={e => { setFieldType(e.target.value as 'all' | 'demographic' | 'sdq'); resetProgressStats(); }}
                  className="w-full h-7 px-2 border rounded bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Fields</option>
                  <option value="demographic">Demographic</option>
                  <option value="sdq">SDQ</option>
                </select>
              </div>
              <div>
                <label htmlFor="dlq-priority" className="block text-muted-foreground mb-1 text-[10px]">Priority</label>
                <select id="dlq-priority"
                  value={priority}
                  onChange={e => { setPriority(e.target.value as 'all' | 'critical' | 'low_trust'); resetProgressStats(); }}
                  className="w-full h-7 px-2 border rounded bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All</option>
                  <option value="critical">Critical</option>
                  <option value="low_trust">Low Trust</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="dlq-error-type" className="block text-muted-foreground mb-1 text-[10px]">Error Type</label>
                <select id="dlq-error-type"
                  value={errorType}
                  onChange={e => { setErrorType(e.target.value); resetProgressStats(); }}
                  className="w-full h-7 px-2 border rounded bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All</option>
                  {distinctErrors.map(err => (
                    <option key={err} value={err}>{err}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dlq-sort-by" className="block text-muted-foreground mb-1 text-[10px]">Sort By</label>
                <div className="flex items-center gap-1">
                  <select id="dlq-sort-by"
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value); resetProgressStats(); }}
                    className="flex-1 h-7 px-2 border rounded bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="filename">Filename</option>
                    <option value="priority">Priority</option>
                    <option value="confidence">Confidence</option>
                    <option value="created_at">Date</option>
                  </select>
                  <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); resetProgressStats(); }}>
                    <ArrowUpDown size={11} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Loader2 className="animate-spin" size={18} />
              </div>
              <span className="text-xs font-medium">Loading tasks...</span>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <FileWarning size={18} className="text-muted-foreground/60" />
              </div>
              <span className="text-xs font-medium">No unresolved fields match filters</span>
              {search && <span className="text-[10px] text-muted-foreground/60">Try adjusting your search or filters</span>}
            </div>
          ) : (
            filteredTasks.map(t => {
              const isSdq = t.field_name.startsWith('q') && t.field_name.substring(1).match(/^\d+$/);
              const confColor = t.confidence_score >= 0.9 ? 'text-emerald-500' : t.confidence_score >= 0.6 ? 'text-amber-500' : 'text-rose-500';
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className={`group relative pl-3 pr-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    selectedTaskId === t.id
                      ? 'bg-violet-500/10 shadow-sm ring-1 ring-violet-500/25'
                      : 'hover:bg-muted bg-card'
                  }`}
                >
                  <div className={`absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full ${
                    t.priority === 'critical' ? 'bg-rose-500' : 'bg-amber-400'
                  }`} />
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      t.priority === 'critical' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {t.priority}
                    </span>
                    <span className={`text-[10px] font-medium ${confColor}`}>
                      {Math.round(t.confidence_score * 100)}%
                    </span>
                  </div>
                  <div className="font-semibold text-xs mb-0.5 truncate flex items-center gap-1.5">
                    {isSdq ? <Hash size={10} className="shrink-0 text-muted-foreground" /> : null}
                    {getFormattedFieldName(t.field_name)}
                    {isSdq && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 font-normal ml-auto">SDQ</Badge>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate mb-1">{t.filename}</div>
                  <div className="flex items-center gap-1 text-[9px] text-rose-500 font-medium">
                    <AlertTriangle size={8} className="shrink-0" />
                    <span className="truncate">{t.error_details || 'Low Confidence'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="md:col-span-2 flex flex-col h-full overflow-hidden">
        {activeTask ? (
          <div className="flex flex-col h-full bg-card border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b flex items-center justify-between shrink-0 gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  activeTask.priority === 'critical' ? 'bg-rose-500' : 'bg-amber-400'
                }`} />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold truncate">{getFormattedFieldName(activeTask.field_name)}</h2>
                  <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                    <span className="truncate max-w-[200px]">{activeTask.filename}</span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span>Page {activeTask.page_number}</span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span className={activeTask.confidence_score >= 0.9 ? 'text-emerald-500' : activeTask.confidence_score >= 0.6 ? 'text-amber-500' : 'text-rose-500'}>
                      {Math.round(activeTask.confidence_score * 100)}% conf
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center bg-muted p-0.5 rounded-lg shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setPreviewMode('crop')}
                  className={`h-7 px-3 text-[10px] font-bold ${previewMode === 'crop' ? 'bg-card shadow-sm' : ''}`}>
                  <Scan size={12} className="mr-1" /> Field
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPreviewMode('full')}
                  className={`h-7 px-3 text-[10px] font-bold ${previewMode === 'full' ? 'bg-card shadow-sm' : ''}`}>
                  <Image size={12} className="mr-1" /> Full Page
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <div className="text-[10px] text-muted-foreground font-medium mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    {previewMode === 'crop' ? <Scan size={10} /> : <Image size={10} />}
                    {previewMode === 'crop' ? 'Field Crop' : 'Full Page'}
                  </span>
                  <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground/60 font-mono">Alt+V</kbd>
                </div>
                {previewMode === 'crop' ? (
                  activeTask.bbox ? (
                    <div className="w-full flex items-center justify-center p-3 border rounded-xl bg-black/[0.03] overflow-hidden min-h-[120px] max-h-[200px]">
                      <CanvasCrop
                        pageUrl={api.getPageUrl(activeTask.document_id, activeTask.page_number)}
                        bbox={activeTask.bbox}
                        polygon={activeTask.polygon}
                        style={{ maxWidth: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: '4px' }}
                      />
                    </div>
                  ) : (
                    <div className="w-full p-8 border rounded-xl bg-muted/50 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                      <FileWarning size={16} className="text-muted-foreground/40" />
                      <span>No coordinates available</span>
                      <span className="text-[10px] text-muted-foreground/60">Toggle full page view to see context</span>
                    </div>
                  )
                ) : (
                  <FullPagePreview
                    pageUrl={api.getPageUrl(activeTask.document_id, activeTask.page_number)}
                    bbox={activeTask.bbox}
                    polygon={activeTask.polygon}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-[10px] text-muted-foreground font-medium mb-1">OCR Extracted Value</div>
                  <div className="font-bold text-sm font-mono">
                    {activeTask.original_value || <span className="text-muted-foreground font-normal italic text-xs">&mdash; empty</span>}
                  </div>
                </div>
                <div className="p-3 rounded-lg border bg-rose-500/[0.03] border-rose-500/15">
                  <div className="text-[10px] text-rose-500 font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle size={10} /> Issue
                  </div>
                  <div className="text-xs font-medium">
                    {activeTask.error_details === 'unanswered'
                      ? 'Field was left blank or not detected'
                      : activeTask.error_details === 'multi_tick'
                      ? 'Multiple checkboxes were marked'
                      : activeTask.error_details || 'Low confidence in extracted value'}
                  </div>
                </div>
              </div>

              <Card className="border-violet-500/20 bg-violet-500/[0.02]">
                <CardContent className="pt-4 space-y-3.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={11} className="text-violet-500" /> Correction
                  </span>

                  {activeTask.field_name === 'dob' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold">Correct Date (DD/MM/YYYY)</label>
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={inputValue}
                          placeholder="e.g. 24/08/2009"
                          onChange={e => handleDateChange(e.target.value)}
                          className={`flex-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 ${
                            inputValue === ''
                              ? 'focus:ring-ring'
                              : isValidDate
                              ? 'border-emerald-500 focus:ring-emerald-500'
                              : 'border-rose-500 focus:ring-rose-500'
                          }`}
                        />
                        {inputValue && isValidDate && (
                          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 border border-emerald-500/20">
                            <Check size={16} />
                          </div>
                        )}
                        <Button variant="outline" onClick={handleMarkBlank} className="shrink-0 h-9 px-3 text-xs">Mark Blank</Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Separators (-, ., space) normalized to slashes.</p>
                    </div>
                  )}

                  {activeTask.field_name === 'consent' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold flex items-center justify-between">
                        <span>Consent</span>
                        <span className="text-[10px] text-muted-foreground/60 font-normal"><kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">Y</kbd> <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">N</kbd> <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">U</kbd></span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {['Yes', 'No', 'Unanswered'].map(opt => (
                          <Button key={opt} variant={inputValue === opt ? 'default' : 'outline'}
                            onClick={() => { setInputValue(opt); handleResolve(opt); }} className="h-9 text-xs font-medium">
                            {opt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

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
                          <span>SDQ Value</span>
                          <span className="text-[10px] text-muted-foreground/60"><kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">1</kbd> <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">2</kbd> <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">3</kbd> <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">0</kbd></span>
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { val: 1, label: 'Unhappy' }, { val: 2, label: 'Angry' },
                            { val: 3, label: 'Calm' }, { val: 0, label: 'Unanswered' }
                          ].map(opt => {
                            const isSelected = selectedVals.includes(opt.val);
                            return (
                              <Button key={opt.val} type="button" variant={isSelected ? 'default' : 'outline'}
                                onClick={() => handleToggle(opt.val)}
                                className={`h-16 flex flex-col items-center justify-center gap-1 rounded-lg ${isSelected ? 'ring-2 ring-violet-500' : ''}`}>
                                <span className="text-lg font-extrabold leading-none">{opt.val}</span>
                                <span className="text-[9px] text-center leading-tight text-muted-foreground">{opt.label}</span>
                              </Button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-muted-foreground">
                            Selected: <span className="font-semibold text-foreground">{inputValue || '0'}</span>
                          </div>
                          <Button type="button" variant="default" onClick={() => handleResolve(inputValue)} className="h-8 text-xs font-medium">
                            Save &amp; Next
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {activeTask.field_name === 'gender' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold flex items-center justify-between">
                        <span>Gender</span>
                        <span className="text-[10px] text-muted-foreground/60"><kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">M</kbd> <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">F</kbd></span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant={inputValue === 'M' ? 'default' : 'outline'}
                          onClick={() => { setInputValue('M'); handleResolve('M'); }} className="h-10 text-sm font-medium">
                          Male
                        </Button>
                        <Button variant={inputValue === 'F' ? 'default' : 'outline'}
                          onClick={() => { setInputValue('F'); handleResolve('F'); }} className="h-10 text-sm font-medium">
                          Female
                        </Button>
                      </div>
                    </div>
                  )}

                  {activeTask.field_name !== 'dob' && activeTask.field_name !== 'consent' && activeTask.field_name !== 'gender' && !activeTask.field_name.startsWith('q') && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold">Correct Value</label>
                      <div className="flex gap-2">
                        <Input ref={inputRef} type="text" value={inputValue}
                          onChange={e => setInputValue(e.target.value)}
                          className="flex-1 h-9 text-sm" />
                        <Button variant="outline" onClick={handleMarkBlank} className="shrink-0 h-9 px-3 text-xs">Mark Blank</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={handleSkip} className="h-8 text-xs gap-1 text-muted-foreground">
                  <span className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">S</span>
                  Skip
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleMarkBlank} className="h-8 text-xs gap-1.5">
                    <span className="text-[9px] px-1 py-0.5 rounded bg-muted font-mono">E</span>
                    Mark Blank
                  </Button>
                  <Button onClick={() => handleResolve()}
                    disabled={saving || (activeTask.field_name === 'dob' && !isValidDate && inputValue !== '')}
                    className="bg-violet-500 hover:bg-violet-600 text-white font-bold text-xs h-8 flex items-center gap-1.5 px-4 shadow-sm">
                    {saving ? <Loader2 className="animate-spin" size={12} /> : <><span>Save &amp; Next</span> <ArrowRight size={12} /></>}
                  </Button>
                </div>
              </div>
            </div>

            <div className="px-4 py-2 border-t flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground/60 shrink-0">
              <span className="font-medium text-muted-foreground/40">Keys:</span>
              {activeTask.field_name.startsWith('q') && <span><kbd className="font-semibold text-muted-foreground/80">1</kbd>/<kbd className="font-semibold text-muted-foreground/80">2</kbd>/<kbd className="font-semibold text-muted-foreground/80">3</kbd>/<kbd className="font-semibold text-muted-foreground/80">0</kbd> auto-save</span>}
              {activeTask.field_name === 'consent' && <span><kbd className="font-semibold text-muted-foreground/80">Y</kbd>/<kbd className="font-semibold text-muted-foreground/80">N</kbd>/<kbd className="font-semibold text-muted-foreground/80">U</kbd> auto-save</span>}
              {activeTask.field_name === 'gender' && <span><kbd className="font-semibold text-muted-foreground/80">M</kbd>/<kbd className="font-semibold text-muted-foreground/80">F</kbd> auto-save</span>}
              <span><kbd className="font-semibold text-muted-foreground/80">S</kbd> skip</span>
              <span><kbd className="font-semibold text-muted-foreground/80">E</kbd> blank</span>
              <span><kbd className="font-semibold text-muted-foreground/80">Alt+V</kbd> toggle view</span>
              <span><kbd className="font-semibold text-muted-foreground/80">Enter</kbd> save</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-card border rounded-xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-violet-500/10 text-violet-500 flex items-center justify-center mb-4">
              <Check size={32} />
            </div>
            <h3 className="font-bold text-lg mb-1">Queue Clear!</h3>
            <p className="text-xs text-muted-foreground max-w-sm">All fields resolved. No pending DLQ tasks.</p>
          </div>
        )}
      </div>
    </div>
  );
};
