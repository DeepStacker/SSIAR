import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2, FileText, Clock, AlertTriangle, Check, X } from 'lucide-react';
import type { Document, DocumentDetails, QueueStatus, TabType, SortKey, ReportFormat, ViewMode } from './api';
import { STATUS_REVIEW, STATUS_VERIFIED, STATUS_PROCESSING, STATUS_FAILED } from './api';
import { api, clearApiCache, isTokenExpired, clearAuth, scheduleTokenRefresh } from './api';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { StatCards } from './components/StatCards';
import { UploadZone } from './components/UploadZone';
import { DocumentTable } from './components/DocumentTable';
import { ReportingView } from './components/ReportingView';
import { ReviewView } from './components/ReviewView';
import { VerifiedView } from './components/VerifiedView';
import { ProcessingView } from './components/ProcessingView';
import { FailedView } from './components/FailedView';
import { AnalyticsView } from './components/AnalyticsView';
import { DlqView } from './components/DlqView';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Card } from '@/components/ui/card';



function AppInner() {
  const { show } = useToast();

  useEffect(() => {
    if (isTokenExpired()) {
      clearAuth();
      window.location.href = '/';
    } else {
      scheduleTokenRefresh();
    }
    api.recoverStuckDocuments().catch(() => {});
  }, []);

  // Data
  const [documents, setDocuments] = useState<Document[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);

  // Selected doc / detail
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [autoVerify, setAutoVerify] = useState(true);
  const [splitPages, setSplitPages] = useState(false);

  const [isDragOver, setIsDragOver] = useState(false);

  // Dashboard
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedDashDocs, setSelectedDashDocs] = useState<Set<string>>(new Set());

  // View
  const [view, setView] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as ViewMode) || 'dashboard';
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('doc_id');
    if (view === 'dashboard') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', view);
    }
    if (view !== 'analytics') {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  }, [view]);

  // Reporting filters
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportStatus, setReportStatus] = useState('verified');
  const [reportClass, setReportClass] = useState('');
  const [reportFormat, setReportFormat] = useState<ReportFormat>('excel');
  const [selectedReportDocs, setSelectedReportDocs] = useState<Set<string>>(new Set());

  // Analytics filters
  const [analyticsClassFilter, setAnalyticsClassFilter] = useState<string>('all');
  const [analyticsGenderFilter, setAnalyticsGenderFilter] = useState<string>('all');

  // Confirm dialog
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null>(null);

  const initialLoadDone = useRef(false);
  const loadingRef = useRef(false);

  const needsReview = documents.filter(d => STATUS_REVIEW.has(d.status));
  const verified = documents.filter(d => STATUS_VERIFIED.has(d.status));
  const processing = documents.filter(d => STATUS_PROCESSING.has(d.status));
  const failed = documents.filter(d => STATUS_FAILED.has(d.status));
  const escBreakdown = queueStatus?.by_escalation || null;

  // ---- Data loading ----
  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    clearApiCache();
    loadingRef.current = true;
    setLoading(true);
    try {
      const [docs, qs] = await Promise.all([
        api.listDocuments(),
        api.getQueueStatus().catch(() => null),
      ]);
      setDocuments(docs);
      if (qs) setQueueStatus(qs);
    } catch (err) {
      console.error(err);
      show("Failed to load documents from backend", 'error');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [show]);

  // SSE + fallback
  useEffect(() => {
    loadAll();
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (isTokenExpired()) { clearAuth(); window.location.href = '/'; return; }
      try {
        es?.close();
        es = new EventSource(api.getEventsUrl());
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const { event: eventType, data } = parsed;
            if (eventType === 'document_updated' && data?.doc_id) {
              clearApiCache();
              if (selectedDoc?.id === data.doc_id) {
                api.getDocumentDetails(data.doc_id)
                  .then(updated => setSelectedDoc(prev => prev?.id === data.doc_id ? { ...prev, ...updated } as Document : prev))
                  .catch(() => {});
              }
              loadAll();
            } else if (eventType === 'document_deleted' && data?.doc_id) {
              setDocuments(prev => prev.filter(d => d.id !== data.doc_id));
              loadAll();
            } else if (eventType !== 'connected') {
              loadAll();
            }
          } catch {
            loadAll();
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch { es = null; }
    };
    connect();
    const fallback = setInterval(() => {
      if (isTokenExpired()) { clearAuth(); window.location.href = '/'; return; }
      if (!es || es.readyState !== EventSource.OPEN) { clearApiCache(); loadAll(); }
    }, 15000);
    return () => { es?.close(); if (reconnectTimer) clearTimeout(reconnectTimer); clearInterval(fallback); };
  }, [loadAll]);

  // ---- URL sync ----
  useEffect(() => {
    if (documents.length > 0 && !initialLoadDone.current) {
      initialLoadDone.current = true;
      const params = new URLSearchParams(window.location.search);
      const docId = params.get('doc_id');
      if (docId) {
        const doc = documents.find(d => d.id === docId);
        if (doc) handleOpenDoc(doc);
      }
    }
  }, [documents]);

  useEffect(() => {
    if (!selectedDoc) return;
    const url = new URL(window.location.href);
    url.searchParams.set('doc_id', selectedDoc.id);
    window.history.replaceState({}, '', url.toString());
  }, [selectedDoc?.id]);

  // Sync selectedDoc with latest documents list so processing view transitions correctly
  useEffect(() => {
    if (!selectedDoc) return;
    const match = documents.find(d => d.id === selectedDoc.id);
    if (match && match.status !== selectedDoc.status) {
      setSelectedDoc(match);
    }
  }, [documents, selectedDoc?.id]);

  // ---- Document helpers ----
  const loadDocDetails = useCallback(async (doc: Document) => {
    setSelectedDoc(doc);
    setDirty(false);
    setDetailsLoading(true);
    try {
      const data = await api.getDocumentDetails(doc.id);
      if (!data.responses) data.responses = {};
      if (!data.academic_scores) data.academic_scores = { math_pct: "", science_pct: "", language_pct: "", rank: "" };
      setDocDetails(data);
    } catch (err) {
      console.error(err);
      show("Failed to load details", 'error');
    } finally {
      setDetailsLoading(false);
    }
  }, [show]);

  const handleOpenDoc = useCallback((doc: Document) => {
    if (STATUS_PROCESSING.has(doc.status)) {
      setDirty(false);
      setSelectedDoc(doc);
      setDocDetails(null);
      return;
    }
    const idx = needsReview.findIndex(d => d.id === doc.id);
    setReviewIndex(Math.max(0, idx));
    loadDocDetails(doc);
  }, [needsReview, loadDocDetails]);

  const closeDoc = useCallback((force = false) => {
    if (dirty && !force) {
      setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: () => closeDoc(true),
      });
      return;
    }
    setDirty(false);
    setSelectedDoc(null);
    setDocDetails(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('doc_id');
    window.history.replaceState({}, '', url.toString());
  }, [dirty]);

  const closeDocForce = useCallback(() => closeDoc(true), [closeDoc]);

  const nextDoc = useCallback(() => {
    const doNav = () => {
      const list = needsReview;
      const next = reviewIndex + 1;
      setDirty(false);
      if (next < list.length) {
        setReviewIndex(next);
        loadDocDetails(list[next]);
      } else {
        closeDocForce();
        setReviewIndex(0);
      }
    };
    if (dirty) {
      setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them and continue?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: doNav,
      });
    } else {
      doNav();
    }
  }, [needsReview, reviewIndex, closeDocForce, loadDocDetails, dirty]);

  const prevDoc = useCallback(() => {
    const doNav = () => {
      const list = needsReview;
      const prev = reviewIndex - 1;
      setDirty(false);
      if (prev >= 0) {
        setReviewIndex(prev);
        loadDocDetails(list[prev]);
      }
    };
    if (dirty) {
      setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them and continue?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: doNav,
      });
    } else {
      doNav();
    }
  }, [needsReview, reviewIndex, loadDocDetails, dirty]);

  const handleSkip = useCallback(() => {
    const doSkip = () => { closeDocForce(); setReviewIndex(0); };
    if (dirty) {
      setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them and skip?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: doSkip,
      });
    } else {
      doSkip();
    }
  }, [closeDocForce, dirty]);

  // ---- Actions ----
  const handleVerify = async () => {
    if (!selectedDoc || !docDetails) return;
    setSaving(true);
    try {
      await api.verifyDocument(selectedDoc.id, {
        roll_number: docDetails.roll_number || '',
        class_val: docDetails.class || '',
        dob: docDetails.dob || '',
        gender: docDetails.gender || '',
        consent: docDetails.consent || 'Unanswered',
        responses: docDetails.responses,
        academic_scores: docDetails.academic_scores,
        remarks: docDetails.remarks || ''
      });
      setDirty(false);
      show(`Saved ${selectedDoc.filename}`);
      // In-place update — no full list refresh
      setDocuments(prev => prev.map(d =>
        d.id === selectedDoc.id ? { ...d, status: 'verified' as const, verified_by_human: 1 } : d
      ));
      setQueueStatus(prev => prev ? {
        ...prev,
        needs_review: Math.max(0, prev.needs_review - 1),
        verified: prev.verified + 1,
      } : prev);
      nextDoc();
    } catch (err) {
      console.error(err);
      show("Save failed", 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    if (!selectedDoc) return;
    setConfirmState({
      title: 'Reprocess document?',
      description: `Reprocess "${selectedDoc.filename}"?`,
      confirmVariant: 'default',
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        try {
          await api.reprocessDocument(selectedDoc.id);
          setDocDetails(null);
          setSelectedDoc(prev => prev ? { ...prev, status: 'processing' } : null);
          setDirty(false);
          await loadAll();
        } catch (err) {
          console.error(err);
          show("Reprocess failed", 'error');
        }
      },
    });
  };

  const handleDeleteDoc = async (doc: Document) => {
    setConfirmState({
      title: 'Delete document?',
      description: `Delete "${doc.filename}"? This cannot be undone.`,
      confirmVariant: 'destructive',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api.deleteDocument(doc.id);
          if (selectedDoc?.id === doc.id) closeDoc();
          await loadAll();
        } catch { show("Delete failed", 'error'); }
      },
    });
  };

  const downloadIndividualReport = (doc: Document) => {
    window.open(api.getExportUrl({
      format: 'csv',
      doc_ids: doc.id,
    }), '_blank');
  };

  const handleReprocessDoc = async (doc: Document) => {
    setConfirmState({
      title: 'Reprocess document?',
      description: `Reprocess "${doc.filename}"?`,
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        try {
          await api.reprocessDocument(doc.id);
          await loadAll();
        } catch { show("Reprocess failed", 'error'); }
      },
    });
  };

  const handleReprocessAllFailed = async () => {
    const failedDocs = documents.filter(d => STATUS_FAILED.has(d.status));
    if (!failedDocs.length) return;
    setConfirmState({
      title: 'Reprocess all failed?',
      description: `Reprocess all ${failedDocs.length} failed documents?`,
      confirmLabel: 'Reprocess All',
      onConfirm: async () => {
        try {
          await Promise.all(failedDocs.map(d => api.reprocessDocument(d.id)));
          await loadAll();
        } catch { show("Batch reprocess failed", 'error'); }
      },
    });
  };

  const handleBulkVerify = async (docIds: string[]) => {
    setConfirmState({
      title: 'Verify documents?',
      description: `Verify ${docIds.length} selected documents?`,
      confirmLabel: 'Verify',
      confirmVariant: 'default',
      onConfirm: async () => {
        try {
          await api.bulkVerify(docIds);
          show(`Verified ${docIds.length} documents`);
          setSelectedDashDocs(new Set());
          await loadAll();
        } catch { show("Bulk verify failed", 'error'); }
      },
    });
  };

  const handleBulkReprocess = async (docIds: string[]) => {
    setConfirmState({
      title: 'Reprocess documents?',
      description: `Reprocess ${docIds.length} selected documents?`,
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        try {
          await Promise.all(docIds.map(id => api.reprocessDocument(id)));
          show(`Reprocessing ${docIds.length} documents`);
          setSelectedDashDocs(new Set());
        } catch { show("Bulk reprocess failed", 'error'); }
      },
    });
  };

  const handleBulkDelete = async (docIds: string[]) => {
    setConfirmState({
      title: 'Delete documents?',
      description: `Delete ${docIds.length} selected documents? This cannot be undone.`,
      confirmVariant: 'destructive',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api.bulkDelete(docIds);
          show(`Deleted ${docIds.length} documents`);
          setSelectedDashDocs(new Set());
        } catch { show("Bulk delete failed", 'error'); }
      },
    });
  };

  // Upload/batch
  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try { await api.uploadFiles(files, autoVerify, splitPages); await loadAll(); }
    catch { show("Upload failed", 'error'); }
    finally { setUploading(false); }
  };
  // Bulk selection
  const toggleDashDoc = (id: string) => {
    setSelectedDashDocs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllDashDocs = () => {
    if (selectedDashDocs.size === filtered.length) setSelectedDashDocs(new Set());
    else setSelectedDashDocs(new Set(filtered.map(d => d.id)));
  };

  // Reporting
  const toggleReportDoc = (id: string) => {
    setSelectedReportDocs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllReportDocs = () => {
    if (selectedReportDocs.size === reportResults.length) setSelectedReportDocs(new Set());
    else setSelectedReportDocs(new Set(reportResults.map(d => d.id)));
  };

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (selectedDoc && STATUS_REVIEW.has(selectedDoc.status) && docDetails) {
        if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); prevDoc(); return; }
        if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); nextDoc(); return; }
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement)?.closest('input,textarea,select')) {
          e.preventDefault(); handleSkip(); return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleVerify(); return; }
        return;
      }
      if (e.key === 'Escape') { closeDoc(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedDoc, docDetails, prevDoc, nextDoc, handleSkip, handleVerify, closeDoc]);

  // Unsaved warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Sort
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Filtered list
  const filtered = (() => {
    const list = activeTab === 'all' ? documents :
      activeTab === 'needs_review' ? needsReview :
      activeTab === 'verified' ? verified :
      activeTab === 'processing' ? processing : failed;
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = list.filter(d =>
        d.filename.toLowerCase().includes(q) ||
        (d.roll_number && d.roll_number.includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const av = (a[sortKey] || '').toLowerCase();
      const bv = (b[sortKey] || '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  })();

  const reportResults = useMemo(() => documents.filter(d => {
    if (reportStatus && d.status !== reportStatus) return false;
    if (reportClass && d.class !== reportClass) return false;
    if (reportDateFrom && d.created_at && d.created_at.slice(0, 10) < reportDateFrom) return false;
    if (reportDateTo && d.created_at && d.created_at.slice(0, 10) > reportDateTo) return false;
    return true;
  }), [documents, reportStatus, reportClass, reportDateFrom, reportDateTo]);

  // ---- Render ----
  const renderContent = () => {
    if (selectedDoc) {
      if (STATUS_PROCESSING.has(selectedDoc.status) || detailsLoading) {
        return <ProcessingView doc={selectedDoc} />;
      }

      if (STATUS_VERIFIED.has(selectedDoc.status) && docDetails) {
        return <VerifiedView doc={selectedDoc} details={docDetails} onClose={closeDoc} onDetailsChange={setDocDetails} />;
      }

      if (STATUS_FAILED.has(selectedDoc.status)) {
        return <FailedView doc={selectedDoc} onClose={closeDoc} />;
      }

      if (docDetails && STATUS_REVIEW.has(selectedDoc.status)) {
        return (
          <ReviewView
            doc={selectedDoc} details={docDetails}
            onDetailsChange={setDocDetails} onDirtyChange={setDirty}
            reviewIndex={reviewIndex} totalReview={needsReview.length}
            onClose={closeDoc} onVerify={handleVerify}
            onReprocess={handleReprocess} onNext={nextDoc} onPrev={prevDoc} saving={saving}
          />
        );
      }

      return (
        <div className="flex items-center justify-center h-full">
          <Card className="flex flex-col items-center justify-center p-8 min-h-[200px]">
            <Loader2 size={32} className="animate-spin text-[var(--accent-violet)]" />
          </Card>
        </div>
      );
    }

    if (view === 'reporting') {
      return (
        <ReportingView
          documents={documents}
          dateFrom={reportDateFrom} dateTo={reportDateTo}
          reportStatus={reportStatus} reportClass={reportClass} reportFormat={reportFormat}
          selectedReportDocs={selectedReportDocs}
          onDateFromChange={setReportDateFrom} onDateToChange={setReportDateTo}
          onStatusChange={setReportStatus} onClassChange={setReportClass}
          onFormatChange={setReportFormat}
          onToggleSelect={toggleReportDoc} onToggleSelectAll={toggleAllReportDocs}
          onOpenDoc={handleOpenDoc}
        />
      );
    }

    if (view === 'analytics') {
      return (
        <AnalyticsView 
          onBack={() => setView('dashboard')}
          classFilter={analyticsClassFilter}
          genderFilter={analyticsGenderFilter}
          onClassFilterChange={setAnalyticsClassFilter}
          onGenderFilterChange={setAnalyticsGenderFilter}
        />
      );
    }

    if (view === 'dlq') {
      return           <DlqView />;
    }

    return (
      <>
        <StatCards
          statCards={[
            { label: 'Total', value: queueStatus?.total ?? documents.length, color: 'var(--accent-cyan)', icon: FileText },
            { label: 'Processing', value: queueStatus?.processing ?? processing.length, color: 'var(--accent-violet)', icon: Clock, pulse: (queueStatus?.processing ?? processing.length) > 0 },
            { label: 'Needs Review', value: queueStatus?.needs_review ?? needsReview.length, color: 'var(--accent-amber)', icon: AlertTriangle },
            { label: 'Verified', value: queueStatus?.verified ?? verified.length, color: 'var(--accent-emerald)', icon: Check },
            { label: 'Failed', value: queueStatus?.failed ?? failed.length, color: 'var(--accent-rose)', icon: X },
          ]}
          escBreakdown={escBreakdown}
          onTabClick={setActiveTab}
        />

        <UploadZone
          uploading={uploading} autoVerify={autoVerify} onAutoVerifyChange={setAutoVerify}
          splitPages={splitPages} onSplitPagesChange={setSplitPages}
          onUpload={handleUpload}
          failedCount={failed.length} onRetryAllFailed={handleReprocessAllFailed}
          isDragOver={isDragOver} onDragOver={setIsDragOver}
        />

        <DocumentTable
          documents={documents} activeTab={activeTab} onTabChange={setActiveTab}
          searchQuery={searchQuery} onSearchChange={setSearchQuery}
          sortKey={sortKey} sortDir={sortDir} onSortChange={toggleSort}
          selectedIds={selectedDashDocs}
          onToggleSelect={toggleDashDoc} onToggleSelectAll={toggleAllDashDocs}
          onOpenDoc={handleOpenDoc} onDownloadReport={downloadIndividualReport}
          onReprocess={handleReprocessDoc} onDelete={handleDeleteDoc}
          onBulkDone={() => { setSelectedDashDocs(new Set()); loadAll(); }}
          onBulkVerify={handleBulkVerify}
          onBulkReprocess={handleBulkReprocess}
          onBulkDelete={handleBulkDelete}
        />

        {loading && (
          <div className="sticky bottom-0 left-0 right-0 z-20">
            <div className="h-0.5 bg-violet-500/20">
              <div className="h-full bg-violet-500 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        )}
      </>
    );
  };

  const pageTitle = selectedDoc
    ? null
    : view === 'reporting' ? 'Reporting'
    : view === 'analytics' ? 'Analytics'
    : view === 'dlq' ? 'DLQ Resolution'
    : 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar view={view} onViewChange={(v) => { closeDocForce(); setView(v); }} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header view={view} onViewChange={setView} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto" onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
            {pageTitle && (
              <div className="mb-6">
                <h1 className="text-lg font-bold tracking-tight">{pageTitle}</h1>
              </div>
            )}
            {renderContent()}
          </div>
          {!selectedDoc && (
            <div className="flex justify-end mt-8">
              <img src="/logo2.png" alt="Parent company" className="h-6 w-auto opacity-40" />
            </div>
          )}
        </main>
      </div>

      <Toast />

      {confirmState && (
        <ConfirmDialog
          open={!!confirmState}
          onOpenChange={(open) => { if (!open) setConfirmState(null); }}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          confirmVariant={confirmState.confirmVariant}
          onConfirm={confirmState.onConfirm}
        />
      )}
    </div>
  );
}

function AppAuthGate() {
  const { token } = useAuth();
  if (!token) {
    return <LoginPage />;
  }
  return <AppInner />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AppAuthGate />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
