import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Search, Filter, ArrowUpDown, Check, AlertTriangle, ArrowRight, CornerDownLeft, Sparkles, Image, Scan, BarChart } from 'lucide-react';
import { api, DlqTask } from '../api';
import { CanvasCrop } from './CanvasCrop';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '../context/ToastContext';

interface Props {
  onClose: () => void;
}

interface FullPagePreviewProps {
  pageUrl: string;
  bbox?: number[];
  polygon?: number[];
  style?: React.CSSProperties;
}

export const FullPagePreview: React.FC<FullPagePreviewProps> = ({ pageUrl, bbox, polygon, style }) => {
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

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Draw highlighted region
      if (polygon && polygon.length >= 8) {
        ctx.beginPath();
        ctx.moveTo(polygon[0], polygon[1]);
        ctx.lineTo(polygon[2], polygon[3]);
        ctx.lineTo(polygon[4], polygon[5]);
        ctx.lineTo(polygon[6], polygon[7]);
        ctx.closePath();
        
        ctx.strokeStyle = '#f43f5e'; // rose-500
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

    return () => {
      isMounted = false;
    };
  }, [pageUrl, bbox, polygon]);

  return (
    <div className="relative w-full flex items-center justify-center bg-black/5 overflow-hidden rounded-xl border border-white/10 min-h-[300px]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-[var(--text-muted)] gap-2 bg-[var(--bg-secondary)]">
          <Loader2 className="animate-spin" size={20} /> Loading Full Page Context...
        </div>
      )}
      {error ? (
        <div className="p-8 text-center text-xs text-rose-500 flex items-center gap-1.5 justify-center">
          <AlertTriangle size={14} /> Failed to load full page image.
        </div>
      ) : (
        <div className="overflow-auto max-h-[500px] w-full flex justify-center p-2">
          <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', ...style }} />
        </div>
      )}
    </div>
  );
};

export const DlqView: React.FC<Props> = ({ onClose }) => {
  const { show } = useToast();
  
  // Tasks state
  const [tasks, setTasks] = useState<DlqTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dbTotalCount, setDbTotalCount] = useState(0);

  // Session Progress State
  const [resolvedSessionCount, setResolvedSessionCount] = useState(0);
  const [initialTotalCount, setInitialTotalCount] = useState(0);

  // Filters state
  const [search, setSearch] = useState('');
  const [fieldType, setFieldType] = useState<'all' | 'demographic' | 'sdq'>('all');
  const [priority, setPriority] = useState<'all' | 'critical' | 'low_trust'>('all');
  const [errorType, setErrorType] = useState('all');
  const [sortBy, setSortBy] = useState('filename'); // Default to filename for sequential grouping
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Preview modes: 'crop' (zoomed in snippet) vs 'full' (full page view)
  const [previewMode, setPreviewMode] = useState<'crop' | 'full'>('crop');

  // Value correction input state
  const [inputValue, setInputValue] = useState('');
  const [isValidDate, setIsValidDate] = useState(true);

  // Reference for focus
  const inputRef = useRef<HTMLInputElement>(null);

  // Load tasks from backend
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
      
      // Set initial count for progress tracking if not already set
      if (initialTotalCount === 0) {
        setInitialTotalCount(data.total);
        setResolvedSessionCount(0);
      }

      if (data.tasks.length > 0) {
        if (selectedTaskId && data.tasks.some(t => t.id === selectedTaskId)) {
          // Keep selection
        } else {
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

  // Reset progress stats when filters change so they are accurate for that slice
  const resetProgressStats = () => {
    setInitialTotalCount(0);
    setResolvedSessionCount(0);
    loadTasks();
  };

  // Selected task
  const activeTask = tasks.find(t => t.id === selectedTaskId) || null;

  // Initialize input value when active task changes
  useEffect(() => {
    if (activeTask) {
      setInputValue(activeTask.original_value || '');
      setIsValidDate(true);
      
      if (!activeTask.field_name.startsWith('q')) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    } else {
      setInputValue('');
    }
  }, [selectedTaskId, activeTask]);

  // Normalize and validate date input
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

  // Submit resolution to backend
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
      
      // Update session statistics
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
      console.error('[DLQ] Resolution error:', err);
      show(`Failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Fast "Mark Blank" action
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

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeTask) return;

      const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Consent hotkeys (Y=Yes, N=No, U=Unanswered) when not typing
      if (activeTask.field_name === 'consent' && !isTyping) {
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleResolve('Yes');
        } else if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          handleResolve('No');
        } else if (e.key.toLowerCase() === 'u') {
          e.preventDefault();
          handleResolve('Unanswered');
        }
      }

      // Gender hotkeys (M=Male, F=Female) when not typing
      if (activeTask.field_name === 'gender' && !isTyping) {
        if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          handleResolve('M');
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          handleResolve('F');
        }
      }

      // SDQ numeric selectors: 1, 2, 3, 0 when not typing
      if (activeTask.field_name.startsWith('q') && !isTyping) {
        if (['1', '2', '3', '0'].includes(e.key)) {
          e.preventDefault();
          handleResolve(e.key);
        }
      }

      // Enter to resolve/save
      if (e.key === 'Enter') {
        // Only trigger Enter shortcut when inside input (standard submit) or when NOT typing
        if (!isTyping || document.activeElement === inputRef.current) {
          e.preventDefault();
          handleResolve();
        }
      }

      // 's' or 'S' to skip (only when NOT typing)
      if (e.key.toLowerCase() === 's' && !isTyping) {
        e.preventDefault();
        handleSkip();
      }

      // 'e' or 'E' to empty (only when NOT typing)
      if (e.key.toLowerCase() === 'e' && !isTyping) {
        e.preventDefault();
        handleMarkBlank();
      }

      // Alt + B to mark blank/empty (works even when typing)
      if (e.key === 'b' && e.altKey) {
        e.preventDefault();
        handleMarkBlank();
      }

      // Alt + V to toggle preview mode (crop vs full)
      if (e.key === 'v' && e.altKey) {
        e.preventDefault();
        setPreviewMode(m => m === 'crop' ? 'full' : 'crop');
      }

      // Alt + ↓ to Skip
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        handleSkip();
      }

      // Alt + ↑ to Prev
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        const currentIndex = tasks.findIndex(t => t.id === activeTask.id);
        if (currentIndex > 0) {
          setSelectedTaskId(tasks[currentIndex - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTask, inputValue, isValidDate, tasks, selectedTaskId]);

  const distinctErrors = Array.from(new Set(tasks.map(t => t.error_details).filter(Boolean)));

  const filteredTasks = tasks.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.filename.toLowerCase().includes(q) ||
      t.field_name.toLowerCase().includes(q) ||
      t.original_value.toLowerCase().includes(q)
    );
  });

  const getPriorityBadgeColor = (p: 'critical' | 'low_trust') => {
    if (p === 'critical') return 'bg-rose-500/10 text-rose-500 border border-rose-500/25';
    return 'bg-amber-500/10 text-amber-500 border border-amber-500/25';
  };

  const getFormattedFieldName = (name: string) => {
    if (name.startsWith('q') && name.substring(1).match(/^\d+$/)) {
      return `Question ${name.substring(1)}`;
    }
    return name.replace('_', ' ').toUpperCase();
  };

  // Progress calculations
  const totalInSession = initialTotalCount || dbTotalCount;
  const progressPercent = totalInSession > 0 ? Math.round((resolvedSessionCount / totalInSession) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-140px)] overflow-hidden">
      {/* Left Pane: Sidebar list of tasks and filters */}
      <div className="flex flex-col border rounded-xl overflow-hidden bg-[var(--bg-secondary)] h-full shadow-sm">
        {/* Filters Area */}
        <div className="p-4 border-b space-y-3 bg-[var(--bg-secondary)] shrink-0">
          {/* Progress Visualizer */}
          <div className="bg-gradient-to-r from-[var(--accent-violet)]/10 to-[var(--accent-cyan)]/5 p-3 rounded-lg border border-[var(--accent-violet)]/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--text-primary)] flex items-center gap-1">
                <BarChart size={12} className="text-[var(--accent-violet)]" /> Progress Tracker
              </span>
              <span className="font-semibold text-[var(--text-muted)]">
                {resolvedSessionCount} / {totalInSession} ({progressPercent}%)
              </span>
            </div>
            {/* Premium Progress Bar */}
            <div className="w-full bg-black/10 rounded-full h-2 overflow-hidden border border-white/5">
              <div 
                className="bg-gradient-to-r from-[var(--accent-violet)] to-[var(--accent-cyan)] h-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-[9px] text-[var(--text-muted)] flex justify-between items-center pt-0.5">
              <span>{dbTotalCount} remaining fields to verify</span>
              {resolvedSessionCount > 0 && (
                <span className="text-emerald-500 font-bold flex items-center gap-0.5 animate-pulse">
                  <Check size={8} /> Good job! Keep going
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search PDF or Field..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg bg-[var(--bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Field Type</label>
              <select
                value={fieldType}
                onChange={e => { setFieldType(e.target.value as any); resetProgressStats(); }}
                className="w-full p-2 border rounded bg-[var(--bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
              >
                <option value="all">All Fields</option>
                <option value="demographic">Demographic</option>
                <option value="sdq">SDQ Questions</option>
              </select>
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => { setPriority(e.target.value as any); resetProgressStats(); }}
                className="w-full p-2 border rounded bg-[var(--bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="low_trust">Low Trust</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Error Type</label>
              <select
                value={errorType}
                onChange={e => { setErrorType(e.target.value); resetProgressStats(); }}
                className="w-full p-2 border rounded bg-[var(--bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
              >
                <option value="all">All Errors</option>
                {distinctErrors.map(err => (
                  <option key={err} value={err}>{err}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Sort By</label>
              <div className="flex items-center gap-1">
                <select
                  value={sortBy}
                  onChange={e => { setSortBy(e.target.value); resetProgressStats(); }}
                  className="flex-1 p-2 border rounded bg-[var(--bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
                >
                  <option value="filename">Filename (Grouped)</option>
                  <option value="priority">Priority</option>
                  <option value="confidence">Confidence</option>
                  <option value="created_at">Date Enqueued</option>
                </select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); resetProgressStats(); }}
                >
                  <ArrowUpDown size={12} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--text-muted)] text-sm">
              <Loader2 className="animate-spin mb-2" size={24} />
              <span>Loading tasks...</span>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center p-8 text-[var(--text-muted)] text-sm">
              No unresolved fields match filters.
            </div>
          ) : (
            filteredTasks.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedTaskId(t.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                  selectedTaskId === t.id
                    ? 'border-[var(--accent-violet)] bg-gradient-to-r from-[color-mix(in_srgb,var(--accent-violet)_10%,transparent)] to-[color-mix(in_srgb,var(--accent-violet)_2%,transparent)] shadow-sm'
                    : 'border-transparent hover:bg-black/5 bg-[var(--bg-primary)]'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${getPriorityBadgeColor(t.priority)}`}>
                    {t.priority}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Conf: {Math.round(t.confidence_score * 100)}%
                  </span>
                </div>
                <div className="font-semibold text-xs text-[var(--text-primary)] mb-0.5 truncate">
                  {getFormattedFieldName(t.field_name)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">
                  {t.filename}
                </div>
                <div className="flex items-center gap-1 text-[9px] text-rose-500 mt-1 font-medium bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10 w-fit">
                  <AlertTriangle size={8} /> {t.error_details || 'Low Confidence'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Pane: Resolution Workspace */}
      <div className="md:col-span-2 flex flex-col h-full overflow-hidden">
        {activeTask ? (
          <div className="flex flex-col h-full bg-[var(--bg-secondary)] border rounded-xl overflow-hidden shadow-sm">
            {/* Header Details */}
            <div className="p-4 border-b flex justify-between items-center bg-[var(--bg-secondary)] shrink-0">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {getFormattedFieldName(activeTask.field_name)} Resolution
                </h2>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                  File: {activeTask.filename} • Page {activeTask.page_number}
                </p>
              </div>
              
              {/* Preview Toggle Mode */}
              <div className="flex items-center bg-black/10 p-0.5 rounded-lg border border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewMode('crop')}
                  className={`h-7 px-3 text-[10px] font-bold ${previewMode === 'crop' ? 'bg-[var(--bg-primary)] shadow-sm' : ''}`}
                >
                  <Scan size={12} className="mr-1" /> Field Crop
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewMode('full')}
                  className={`h-7 px-3 text-[10px] font-bold ${previewMode === 'full' ? 'bg-[var(--bg-primary)] shadow-sm' : ''}`}
                >
                  <Image size={12} className="mr-1" /> Full Page Context
                </Button>
              </div>
            </div>

            {/* Content Workspace Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Context Image Panel */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-[var(--text-muted)] flex justify-between items-center">
                  <span>Image Preview ({previewMode === 'crop' ? 'Snipped Crop' : 'Full Sheet Context'}):</span>
                  <span className="text-[10px] italic">Alt+V to toggle view mode</span>
                </span>
                
                {previewMode === 'crop' ? (
                  activeTask.bbox ? (
                    <div className="w-full flex items-center justify-center p-3 border rounded-xl bg-black/10 overflow-hidden min-h-[140px] max-h-[220px]">
                      <CanvasCrop
                        pageUrl={api.getPageUrl(activeTask.document_id, activeTask.page_number)}
                        bbox={activeTask.bbox}
                        polygon={activeTask.polygon}
                        style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '4px' }}
                      />
                    </div>
                  ) : (
                    <div className="w-full p-8 border rounded-xl bg-black/5 text-center text-xs text-[var(--text-muted)]">
                      No coordinates available for snippet crop. Toggle full page context.
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

              {/* Error and Original Info Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-lg bg-[var(--bg-primary)]">
                  <div className="text-[10px] text-[var(--text-muted)] mb-1">OCR Original Extracted Value</div>
                  <div className="font-extrabold text-sm text-[var(--text-primary)]">
                    {activeTask.original_value || <span className="text-[var(--text-muted)] font-normal italic">— (Empty)</span>}
                  </div>
                </div>
                <div className="p-3 border rounded-lg bg-rose-500/5 border-rose-500/20">
                  <div className="text-[10px] text-rose-500 mb-1 font-semibold flex items-center gap-1">
                    <AlertTriangle size={10} /> Validation Issue Details
                  </div>
                  <div className="text-xs font-medium text-[var(--text-primary)]">
                    {activeTask.error_details === 'unanswered'
                      ? 'The field is left blank or was not detected by Azure.'
                      : activeTask.error_details === 'multi_tick'
                      ? 'Multiple checkbox selection answers were marked on the form.'
                      : `Failed rule checks: ${activeTask.error_details}`}
                  </div>
                </div>
              </div>

              {/* Resolution Form Card */}
              <Card className="border-[var(--accent-violet)]/30 bg-[color-mix(in_srgb,var(--accent-violet)_2%,transparent)]">
                <CardContent className="pt-4 space-y-3.5">
                  <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles size={12} className="text-[var(--accent-violet)]" /> Correction Panel
                  </span>

                  {/* 1. DOB date calendar field normalizer */}
                  {activeTask.field_name === 'dob' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[var(--text-primary)]">Correct Date (Format: DD/MM/YYYY)</label>
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={inputValue}
                          placeholder="e.g. 24/08/2009"
                          onChange={e => handleDateChange(e.target.value)}
                          className={`flex-1 px-3 py-2 border rounded-lg bg-[var(--bg-primary)] text-sm focus:outline-none focus:ring-2 ${
                            inputValue === ''
                              ? 'focus:ring-[var(--accent-violet)]'
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
                        <Button variant="outline" onClick={handleMarkBlank} className="shrink-0 h-9 px-3 text-xs">
                          Mark Blank
                        </Button>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Separators (-, ., space) are normalized to slashes automatically on the fly.
                      </p>
                    </div>
                  )}

                  {/* 2. Consent (Yes / No / Unanswered) */}
                  {activeTask.field_name === 'consent' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[var(--text-primary)] flex justify-between items-center">
                        <span>Consent Selection</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">Press <kbd className="font-bold">Y</kbd> / <kbd className="font-bold">N</kbd> / <kbd className="font-bold">U</kbd> for instant save</span>
                      </label>
                      <div className="flex gap-2">
                        {[
                          { val: 'Yes', label: 'Yes (Y)' },
                          { val: 'No', label: 'No (N)' },
                          { val: 'Unanswered', label: 'Unanswered (U)' }
                        ].map(opt => (
                          <Button
                            key={opt.val}
                            variant={inputValue === opt.val ? 'default' : 'outline'}
                            onClick={() => {
                              setInputValue(opt.val);
                              handleResolve(opt.val);
                            }}
                            className="flex-1"
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. SDQ Questions fast resolution (1 / 2 / 3 / 0) */}
                  {activeTask.field_name.startsWith('q') && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[var(--text-primary)] flex justify-between items-center">
                        <span>Select Correct Value</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">Press <kbd className="font-bold">1</kbd> / <kbd className="font-bold">2</kbd> / <kbd className="font-bold">3</kbd> / <kbd className="font-bold">0</kbd> for instant save</span>
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { val: '1', label: '1 (उदास/डर)' },
                          { val: '2', label: '2 (गुस्सैल/झगड़ालू)' },
                          { val: '3', label: '3 (खुश/शांत)' },
                          { val: '0', label: '0 (Unanswered)' }
                        ].map(opt => (
                          <Button
                            key={opt.val}
                            variant={inputValue === opt.val ? 'default' : 'outline'}
                            onClick={() => handleResolve(opt.val)}
                            className="h-14 flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-150 active:scale-95"
                          >
                            <span className="text-base font-extrabold">{opt.val}</span>
                            <span className="text-[8px] mt-0.5 text-center truncate w-full">{opt.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Gender (M / F) */}
                  {activeTask.field_name === 'gender' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[var(--text-primary)] flex justify-between items-center">
                        <span>Select Gender</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">Press <kbd className="font-bold">M</kbd> / <kbd className="font-bold">F</kbd> for instant save</span>
                      </label>
                      <div className="flex gap-3">
                        {[
                          { val: 'M', label: 'M (Male)' },
                          { val: 'F', label: 'F (Female)' }
                        ].map(g => (
                          <Button
                            key={g.val}
                            variant={inputValue === g.val ? 'default' : 'outline'}
                            onClick={() => {
                              setInputValue(g.val);
                              handleResolve(g.val);
                            }}
                            className="flex-1 py-4 h-12"
                          >
                            {g.label}
                          </Button>
                        ))}
                        <Button variant="outline" onClick={handleMarkBlank} className="h-12 px-4">
                          Mark Blank
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 5. Standard demographic text inputs */}
                  {activeTask.field_name !== 'dob' && activeTask.field_name !== 'consent' && activeTask.field_name !== 'gender' && !activeTask.field_name.startsWith('q') && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[var(--text-primary)]">Correct Extracted Value</label>
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={inputValue}
                          onChange={e => setInputValue(e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg bg-[var(--bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
                        />
                        <Button variant="outline" onClick={handleMarkBlank} className="shrink-0 h-9 px-3 text-xs">
                          Mark Blank
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Navigation Actions */}
              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="outline"
                  onClick={handleSkip}
                  className="h-9 text-xs"
                >
                  Skip Field
                </Button>
                
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleResolve()}
                    disabled={saving || (activeTask.field_name === 'dob' && !isValidDate && inputValue !== '')}
                    className="bg-[var(--accent-violet)] hover:bg-[color-mix(in_srgb,var(--accent-violet)_90%,black)] text-white shadow-md font-bold text-xs h-9 flex items-center gap-1.5 px-5"
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : (
                      <>
                        Save & Next <ArrowRight size={12} />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Keyboard Shortcuts Cheatsheet footer */}
            <div className="p-3 border-t bg-[var(--bg-secondary)] flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] text-[var(--text-muted)] shrink-0 font-medium border-white/5">
              <span className="font-bold text-[var(--text-primary)] flex items-center gap-0.5">
                Keyboard Shortcuts:
              </span>
              {activeTask.field_name.startsWith('q') && (
                <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded"><kbd className="font-bold">1</kbd>/<kbd className="font-bold">2</kbd>/<kbd className="font-bold">3</kbd>/<kbd className="font-bold">0</kbd> Answer & Auto-save</span>
              )}
              {activeTask.field_name === 'consent' && (
                <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded"><kbd className="font-bold">Y</kbd>/<kbd className="font-bold">N</kbd>/<kbd className="font-bold">U</kbd> Select & Auto-save</span>
              )}
              {activeTask.field_name === 'gender' && (
                <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded"><kbd className="font-bold">M</kbd>/<kbd className="font-bold">F</kbd> Select & Auto-save</span>
              )}
              <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">
                <kbd className="font-bold">S</kbd> Skip Field (when not typing)
              </span>
              <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">
                <kbd className="font-bold">E</kbd> Empty & Auto-save (when not typing)
              </span>
              <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">
                <kbd className="font-bold">Alt</kbd> + <kbd className="font-bold">V</kbd> Toggle Crop/Full Page
              </span>
              <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">
                <kbd className="font-bold">Alt</kbd> + <kbd className="font-bold">B</kbd> Mark Blank & Auto-save
              </span>
              <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">
                <kbd className="font-bold">Alt</kbd> + <kbd className="font-bold">↓</kbd> Skip Field
              </span>
              <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">
                <kbd className="font-bold">Enter</kbd> (or <kbd className="font-bold">Ctrl+Enter</kbd>) Save & Next
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-[var(--bg-secondary)] border rounded-xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] flex items-center justify-center mb-4">
              <Check size={32} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)] mb-1">Queue Completely Clear!</h3>
            <p className="text-xs text-[var(--text-muted)] max-w-sm">
              All low-confidence and validation-failed fields have been successfully resolved. No pending DLQ tasks remaining.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
