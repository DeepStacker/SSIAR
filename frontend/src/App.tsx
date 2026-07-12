import { useRef, useCallback, useEffect } from 'react';
import { clearApiCache, invalidateCache, api } from '@/api';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DocumentProvider, useDocument } from '@/context/DocumentContext';
import { UIProvider, useUI } from '@/context/UIContext';
import { ReviewProvider, useReview } from '@/context/ReviewContext';
import { SelectionProvider, useSelection } from '@/context/SelectionContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { LandingPage } from '@/features/marketing/LandingPage';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from '@/features/layout/Header';
import { Sidebar } from '@/features/layout/Sidebar';
import { Toast } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AppContent } from '@/app/routes';
import { useHandlers } from '@/app/actions';
import { useInitAuth, useSSE, useKeyboardShortcuts, useUnsavedWarning, useUrlSync, useFilteredDocuments } from '@/app/hooks';

function AppInnerContents() {
  const { show } = useToast();
  const doc = useDocument();
  const ui = useUI();
  const review = useReview();
  const sel = useSelection();

  useInitAuth();

  const loadingRef = useRef(false);
  const lastLoadRef = useRef(0);
  const pendingRef = useRef(false);

  const showRef = useRef(show);
  showRef.current = show;
  const setLoadingRef = useRef(doc.setLoading);
  setLoadingRef.current = doc.setLoading;
  const setDocumentsRef = useRef(doc.setDocuments);
  setDocumentsRef.current = doc.setDocuments;
  const setQueueStatusRef = useRef(doc.setQueueStatus);
  setQueueStatusRef.current = doc.setQueueStatus;

  const loadAll = useCallback(async () => {
    if (loadingRef.current) { pendingRef.current = true; return; }
    if (Date.now() - lastLoadRef.current < 5000) { pendingRef.current = true; return; }
    pendingRef.current = false;
    lastLoadRef.current = Date.now();
    invalidateCache('/documents');
    invalidateCache('/queue-status');
    loadingRef.current = true;
    setLoadingRef.current(true);
    try {
      const [docs, qs] = await Promise.all([
        api.listDocuments(['id', 'status', 'filename', 'roll_number', 'class', 'created_at', 'error_message', 'verified_by_human', 'classification', 'escalation_level']),
        api.getQueueStatus().catch(() => null),
      ]);
      setDocumentsRef.current(docs);
      if (qs) setQueueStatusRef.current(qs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRef.current(false);
      loadingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
    lastLoadRef.current = Date.now();
        loadAll();
      }
    }
  }, []);

  const refreshDocuments = useCallback(() => {
    clearApiCache();
    loadAll();
  }, [loadAll]);

  useSSE(loadAll);

  const closeDoc = useCallback((force = false) => {
    if (review.dirty && !force) {
      ui.setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: () => closeDoc(true),
      });
      return;
    }
    review.setDirty(false);
    doc.setSelectedDoc(null);
    doc.setDocDetails(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('doc_id');
    window.history.replaceState({}, '', url.toString());
  }, [review.dirty, doc.setSelectedDoc, doc.setDocDetails, review.setDirty, ui.setConfirmState]);

  const closeDocForce = useCallback(() => closeDoc(true), [closeDoc]);

  const handlers = useHandlers(closeDoc, closeDocForce, refreshDocuments);

  useKeyboardShortcuts(doc.selectedDoc, doc.docDetails, handlers.prevDoc, handlers.nextDoc, handlers.handleSkip, handlers.handleVerify, closeDoc);
  useUnsavedWarning(review.dirty);
  const { initialLoadDone } = useUrlSync(doc.selectedDoc);

  const filtered = useFilteredDocuments();

  useEffect(() => {
    if (doc.documents.length > 0 && !initialLoadDone.current) {
      initialLoadDone.current = true;
      const params = new URLSearchParams(window.location.search);
      const docId = params.get('doc_id');
      if (docId) {
        const found = doc.documents.find(d => d.id === docId);
        if (found) handlers.handleOpenDoc(found);
      }
    }
  }, [doc.documents]);

  useEffect(() => {
    const sel_ = doc.selectedDoc;
    if (!sel_) return;
    const match = doc.documents.find(d => d.id === sel_.id);
    if (match && match.status !== sel_.status) {
      doc.setSelectedDoc(match);
    }
  }, [doc.documents, doc.selectedDoc?.id]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('doc_id');
    if (ui.view === 'dashboard') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', ui.view);
    }
    if (ui.view !== 'analytics') {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  }, [ui.view]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        view={ui.view}
        onViewChange={(v) => { closeDocForce(); ui.setView(v); }}
        collapsed={ui.sidebarCollapsed}
        onToggle={() => ui.setSidebarCollapsed(c => !c)}
        mobileOpen={ui.sidebarMobileOpen}
        onMobileClose={() => ui.setSidebarMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header view={ui.view} onViewChange={ui.setView} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto" onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
            <AppContent
              onClose={closeDoc}
              onVerify={handlers.handleVerify}
              onReprocess={handlers.handleReprocess}
              onNext={handlers.nextDoc}
              onPrev={handlers.prevDoc}
              onOpenDoc={handlers.handleOpenDoc}
              onDownloadReport={handlers.downloadIndividualReport}
              onReprocessDoc={handlers.handleReprocessDoc}
              onDeleteDoc={handlers.handleDeleteDoc}
              onBulkDone={() => { sel.setSelectedDashDocs(new Set()); refreshDocuments(); }}
              onBulkVerify={handlers.handleBulkVerify}
              onBulkReprocess={handlers.handleBulkReprocess}
              onBulkDelete={handlers.handleBulkDelete}
              onUpload={handlers.handleUpload}
              onRetryAllFailed={handlers.handleReprocessAllFailed}
              onToggleSelect={sel.onToggleDashDoc}
              onToggleSelectAll={() => sel.onToggleAllDashDocs(filtered.map(d => d.id))}
              onReportToggleSelect={sel.onToggleReportDoc}
              onReportToggleSelectAll={sel.onToggleAllReportDocs}
              toggleSort={handlers.toggleSort}
              onRetryDetails={handlers.loadDocDetails}
            />
          </div>
          {!doc.selectedDoc && (
            <div className="flex justify-end mt-8">
              <img src="/logo2.png" alt="Parent company" className="h-6 w-auto opacity-40" />
            </div>
          )}
        </main>
      </div>

      <Toast />

      {ui.confirmState && (
        <ConfirmDialog
          open={!!ui.confirmState}
          onOpenChange={(open) => { if (!open) ui.setConfirmState(null); }}
          title={ui.confirmState.title}
          description={ui.confirmState.description}
          confirmLabel={ui.confirmState.confirmLabel}
          confirmVariant={ui.confirmState.confirmVariant}
          onConfirm={ui.confirmState.onConfirm}
        />
      )}
    </div>
  );
}

function AppInner() {
  return (
    <DocumentProvider>
      <UIProvider>
        <SelectionProvider>
          <ReviewProvider>
            <AppInnerContents />
          </ReviewProvider>
        </SelectionProvider>
      </UIProvider>
    </DocumentProvider>
  );
}

function AppAuthGate() {
  const { token, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app/*" element={token ? <AppInner /> : <Navigate to="/login" replace />} />
      <Route path="/" element={token ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route path="*" element={<Navigate to={token ? "/app" : "/"} replace />} />
    </Routes>
  );
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
