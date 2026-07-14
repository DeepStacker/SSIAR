import { lazy, Suspense, memo, useRef } from 'react';
import { Loader2, FileText, Clock, AlertTriangle, Check, X, RefreshCw, Activity, Users, ShieldOff } from 'lucide-react';
import type { Document } from '@/api';
import { STATUS_REVIEW, STATUS_VERIFIED, STATUS_PROCESSING, STATUS_FAILED } from '@/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDocument } from '@/context/DocumentContext';
import { useUI } from '@/context/UIContext';
import { useReview } from '@/context/ReviewContext';
import { useSelection } from '@/context/SelectionContext';
import { useAuth } from '@/context/AuthContext';
import { StatCards } from '@/features/analytics/StatCards';
import { UploadZone } from '@/features/documents/UploadZone';
import { DocumentTable } from '@/features/documents/DocumentTable';
import { UsersView } from '@/components/UsersView';

const ReviewView = memo(lazy(() => import('@/features/review/ReviewView').then(m => ({ default: m.ReviewView }))));
const VerifiedView = memo(lazy(() => import('@/features/verification/VerifiedView').then(m => ({ default: m.VerifiedView }))));
const FailedView = memo(lazy(() => import('@/features/verification/FailedView').then(m => ({ default: m.FailedView }))));
const ProcessingView = memo(lazy(() => import('@/features/documents/ProcessingView').then(m => ({ default: m.ProcessingView }))));
const AnalyticsView = memo(lazy(() => import('@/features/analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView }))));
const DeadLetterQueueView = memo(lazy(() => import('@/features/dead-letter-queue/DeadLetterQueueView').then(m => ({ default: m.DeadLetterQueueView }))));
const ReportingView = memo(lazy(() => import('@/features/reporting/ReportingView').then(m => ({ default: m.ReportingView }))));
const FeedbackView = memo(lazy(() => import('@/features/feedback/FeedbackView').then(m => ({ default: m.FeedbackView }))));

interface Props {
  onClose: () => void;
  onVerify: () => void;
  onReprocess: () => void;
  onNext: () => void;
  onPrev: () => void;
  onOpenDoc: (doc: Document) => void;
  onDownloadReport: (doc: Document) => void;
  onReprocessDoc: (doc: Document) => void;
  onDeleteDoc: (doc: Document) => void;
  onBulkDone: () => void;
  onBulkVerify: (ids: string[]) => void;
  onBulkReprocess: (ids: string[]) => void;
  onBulkDelete: (ids: string[]) => void;
  onUpload: (files: File[]) => void;
  onRetryAllFailed: () => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onReportToggleSelect: (id: string) => void;
  onReportToggleSelectAll: () => void;
  toggleSort: (key: import('@/api').SortKey) => void;
  onRetryDetails: (d: Document) => void;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function AppContent(props: Props) {
  const doc = useDocument();
  const ui = useUI();
  const review = useReview();
  const sel = useSelection();
  const { role } = useAuth();
  const quickUploadRef = useRef<HTMLInputElement>(null);

  if (doc.selectedDoc) {
    if (doc.detailsError && !doc.detailsLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Card className="flex flex-col items-center justify-center p-8 min-h-[200px] max-w-md text-center gap-4">
            <div className="rounded-full bg-red-50 p-3 dark:bg-red-900/20">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Failed to load document</h3>
              <p className="text-xs text-muted-foreground mt-1">{doc.detailsError}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={() => props.onRetryDetails(doc.selectedDoc!)}>
                <RefreshCw size={14} className="mr-1.5" />Retry
              </Button>
              <Button variant="outline" size="sm" onClick={props.onClose}>Go Back</Button>
            </div>
          </Card>
        </div>
      );
    }

    if (STATUS_PROCESSING.has(doc.selectedDoc.status) || doc.detailsLoading) {
      return <Suspense fallback={<LoadingFallback />}><ProcessingView doc={doc.selectedDoc} /></Suspense>;
    }

    if (STATUS_VERIFIED.has(doc.selectedDoc.status) && doc.docDetails) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <VerifiedView
            doc={doc.selectedDoc}
            details={doc.docDetails}
            onClose={props.onClose}
            onDetailsChange={doc.setDocDetails}
          />
        </Suspense>
      );
    }

    if (STATUS_FAILED.has(doc.selectedDoc.status)) {
      return <Suspense fallback={<LoadingFallback />}><FailedView doc={doc.selectedDoc} onClose={props.onClose} /></Suspense>;
    }

    if (doc.docDetails && STATUS_REVIEW.has(doc.selectedDoc.status)) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <ReviewView
            doc={doc.selectedDoc}
            details={doc.docDetails}
            onDetailsChange={doc.setDocDetails}
            onDirtyChange={review.setDirty}
            reviewIndex={review.reviewIndex}
            totalReview={doc.needsReview.length}
            onClose={props.onClose}
            onVerify={props.onVerify}
            onReprocess={props.onReprocess}
            onNext={props.onNext}
            onPrev={props.onPrev}
            saving={review.saving}
          />
        </Suspense>
      );
    }

    return <LoadingFallback />;
  }

  if (ui.view === 'reporting') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <ReportingView
          reportResults={sel.reportResults}
          dateFrom={doc.reportDateFrom}
          dateTo={doc.reportDateTo}
          reportStatus={doc.reportStatus}
          reportClass={doc.reportClass}
          reportFormat={doc.reportFormat}
          selectedReportDocs={sel.selectedReportDocs}
          onDateFromChange={doc.setReportDateFrom}
          onDateToChange={doc.setReportDateTo}
          onStatusChange={doc.setReportStatus}
          onClassChange={doc.setReportClass}
          onFormatChange={doc.setReportFormat}
          onToggleSelect={props.onReportToggleSelect}
          onToggleSelectAll={props.onReportToggleSelectAll}
          onOpenDoc={props.onOpenDoc}
        />
      </Suspense>
    );
  }

  if (ui.view === 'analytics') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AnalyticsView
          onBack={() => ui.setView('dashboard')}
          classFilter={doc.analyticsClassFilter}
          genderFilter={doc.analyticsGenderFilter}
        />
      </Suspense>
    );
  }

  if (ui.view === 'dlq') {
    return <Suspense fallback={<LoadingFallback />}><DeadLetterQueueView /></Suspense>;
  }

  if (ui.view === 'feedback') {
    return <Suspense fallback={<LoadingFallback />}><FeedbackView /></Suspense>;
  }

  if (ui.view === 'users') {
    if (role !== 'admin') {
      return (
        <div className="flex items-center justify-center h-full">
          <Card className="flex flex-col items-center justify-center p-8 min-h-[200px] max-w-md text-center gap-4">
            <div className="rounded-full bg-red-50 p-3 dark:bg-red-900/20">
              <ShieldOff className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Access Denied</h3>
              <p className="text-xs text-muted-foreground mt-1">You need admin privileges to manage users.</p>
            </div>
          </Card>
        </div>
      );
    }
    return <UsersView />;
  }

  const needsReviewCount = doc.queueStatus?.needs_review ?? doc.needsReview.length;
  const processingCount = doc.queueStatus?.processing ?? doc.processing.length;
  const workerCount = doc.queueStatus?.workers ?? 0;

  return (
    <>
      <StatCards
        statCards={[
          { label: 'Total', value: doc.queueStatus?.total ?? doc.documents.length, color: 'var(--accent-violet)', icon: FileText },
          { label: 'Verified', value: doc.queueStatus?.verified ?? doc.verified.length, color: 'var(--accent-cyan)', icon: Check },
          { label: 'Processing', value: processingCount, color: 'var(--accent-amber)', icon: Clock, pulse: processingCount > 0 },
          { label: 'Needs Review', value: needsReviewCount, color: 'var(--accent-emerald)', icon: AlertTriangle },
          { label: 'Failed', value: doc.queueStatus?.failed ?? doc.failed.length, color: 'var(--accent-rose)', icon: X },
        ]}
        escBreakdown={doc.escBreakdown}
        onTabClick={ui.setActiveTab}
      />

      <UploadZone
        uploading={ui.uploading}
        autoVerify={doc.autoVerify}
        onAutoVerifyChange={doc.setAutoVerify}
        splitPages={doc.splitPages}
        onSplitPagesChange={doc.setSplitPages}
        onUpload={props.onUpload}
        failedCount={doc.failed.length}
        onRetryAllFailed={props.onRetryAllFailed}
        isDragOver={doc.isDragOver}
        onDragOver={doc.setIsDragOver}
      />

      <DocumentTable
        documents={doc.documents}
        activeTab={ui.activeTab}
        onTabChange={ui.setActiveTab}
        searchQuery={ui.searchQuery}
        onSearchChange={ui.setSearchQuery}
        sortKey={ui.sortKey}
        sortDir={ui.sortDir}
        onSortChange={props.toggleSort}
        selectedIds={sel.selectedDashDocs}
        onToggleSelect={props.onToggleSelect}
        onToggleSelectAll={props.onToggleSelectAll}
        onOpenDoc={props.onOpenDoc}
        onDownloadReport={props.onDownloadReport}
        onReprocess={props.onReprocessDoc}
        onDelete={props.onDeleteDoc}
        onBulkDone={props.onBulkDone}
        onBulkVerify={props.onBulkVerify}
        onBulkReprocess={props.onBulkReprocess}
        onBulkDelete={props.onBulkDelete}
        loading={doc.loading}
        onUpload={() => quickUploadRef.current?.click()}
      />

      <div className="sticky bottom-0 left-0 right-0 z-20 mt-2">
        <div className="border-t border-border px-0 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Activity size={13} className={processingCount > 0 ? 'text-[var(--accent-amber)] animate-pulse' : 'text-muted-foreground'} />
              {processingCount > 0 ? (
                <span className="font-medium text-[var(--accent-amber)]">{processingCount} processing</span>
              ) : (
                <span>Queue idle</span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              <span>{workerCount} worker{workerCount !== 1 ? 's' : ''}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{doc.documents.length} total docs</span>
            {doc.loading && (
              <span className="flex items-center gap-1 text-primary font-medium">
                <Loader2 size={12} className="animate-spin" />Syncing...
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
