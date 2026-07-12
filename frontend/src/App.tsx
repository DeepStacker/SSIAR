import { useRef, useCallback, useEffect } from 'react';
import { clearApiCache, api } from '@/api';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DocumentProvider, useDocument } from '@/context/DocumentContext';
import { UIProvider, useUI } from '@/context/UIContext';
import { ReviewProvider, useReview } from '@/context/ReviewContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { Header } from '@/features/layout/Header';
import { Sidebar } from '@/features/layout/Sidebar';
import { Toast } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AppContent } from '@/app/routes';
import { useHandlers } from '@/app/actions';
import { useInitAuth, useSSE, useKeyboardShortcuts, useUnsavedWarning, useUrlSync } from '@/app/hooks';

function AppInnerContents() {
  const { show } = useToast();
  const doc = useDocument();
  const ui = useUI();
  const review = useReview();

  useInitAuth();

  const loadingRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    clearApiCache();
    loadingRef.current = true;
    doc.setLoading(true);
    try {
      const [docs, qs] = await Promise.all([
        api.listDocuments(),
        api.getQueueStatus().catch(() => null),
      ]);
      doc.setDocuments(docs);
      if (qs) doc.setQueueStatus(qs);
    } catch (err) {
      console.error(err);
      show("Failed to load documents from backend", 'error');
    } finally {
      doc.setLoading(false);
      loadingRef.current = false;
    }
  }, [show, doc]);

  useSSE(loadAll, doc.selectedDoc);

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

  const handlers = useHandlers(loadAll, closeDoc, closeDocForce);

  useKeyboardShortcuts(doc.selectedDoc, doc.docDetails, handlers.prevDoc, handlers.nextDoc, handlers.handleSkip, handlers.handleVerify, closeDoc);
  useUnsavedWarning(review.dirty);
  const { initialLoadDone } = useUrlSync(doc.selectedDoc);

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
    const sel = doc.selectedDoc;
    if (!sel) return;
    const match = doc.documents.find(d => d.id === sel.id);
    if (match && match.status !== sel.status) {
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

  const pageTitle = doc.selectedDoc
    ? null
    : ui.view === 'reporting' ? 'Reporting'
    : ui.view === 'analytics' ? 'Analytics'
    : ui.view === 'dlq' ? 'DLQ Resolution'
    : 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar view={ui.view} onViewChange={(v) => { closeDocForce(); ui.setView(v); }} collapsed={ui.sidebarCollapsed} onToggle={() => ui.setSidebarCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header view={ui.view} onViewChange={ui.setView} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[1400px] mx-auto" onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
            {pageTitle && (
              <div className="mb-6">
                <h1 className="text-lg font-bold tracking-tight">{pageTitle}</h1>
              </div>
            )}
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
              onBulkDone={() => { doc.setSelectedDashDocs(new Set()); loadAll(); }}
              onBulkVerify={handlers.handleBulkVerify}
              onBulkReprocess={handlers.handleBulkReprocess}
              onBulkDelete={handlers.handleBulkDelete}
              onUpload={handlers.handleUpload}
              onRetryAllFailed={handlers.handleReprocessAllFailed}
              onToggleSelect={handlers.toggleDashDoc}
              onToggleSelectAll={() => handlers.toggleAllDashDocs(doc.filtered)}
              toggleSort={handlers.toggleSort}
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
        <ReviewProvider>
          <AppInnerContents />
        </ReviewProvider>
      </UIProvider>
    </DocumentProvider>
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
