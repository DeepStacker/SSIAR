import { lazy, Suspense } from 'react';
import { Loader2, FileText, Clock, AlertTriangle, Check, X } from 'lucide-react';
import type { Document } from '@/api';
import { STATUS_REVIEW, STATUS_VERIFIED, STATUS_PROCESSING, STATUS_FAILED } from '@/api';
import { Card } from '@/components/ui/card';
import { useDocument } from '@/context/DocumentContext';
import { useUI } from '@/context/UIContext';
import { useReview } from '@/context/ReviewContext';
import { StatCards } from '@/features/analytics/StatCards';
import { UploadZone } from '@/features/documents/UploadZone';
import { DocumentTable } from '@/features/documents/DocumentTable';

const ReviewView = lazy(() => import('@/features/review/ReviewView').then(m => ({ default: m.ReviewView })));
const VerifiedView = lazy(() => import('@/features/verification/VerifiedView').then(m => ({ default: m.VerifiedView })));
const FailedView = lazy(() => import('@/features/verification/FailedView').then(m => ({ default: m.FailedView })));
const ProcessingView = lazy(() => import('@/features/documents/ProcessingView').then(m => ({ default: m.ProcessingView })));
const AnalyticsView = lazy(() => import('@/features/analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const DeadLetterQueueView = lazy(() => import('@/features/dead-letter-queue/DeadLetterQueueView').then(m => ({ default: m.DeadLetterQueueView })));
const ReportingView = lazy(() => import('@/features/reporting/ReportingView').then(m => ({ default: m.ReportingView })));

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
  toggleSort: (key: import('@/api').SortKey) => void;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Card className="flex flex-col items-center justify-center p-8 min-h-[200px]">
        <Loader2 size={32} className="animate-spin text-[var(--accent-violet)]" />
      </Card>
    </div>
  );
}

export function AppContent(props: Props) {
  const doc = useDocument();
  const ui = useUI();
  const review = useReview();

  if (doc.selectedDoc) {
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
          documents={doc.documents}
          dateFrom={doc.reportDateFrom}
          dateTo={doc.reportDateTo}
          reportStatus={doc.reportStatus}
          reportClass={doc.reportClass}
          reportFormat={doc.reportFormat}
          selectedReportDocs={doc.selectedReportDocs}
          onDateFromChange={doc.setReportDateFrom}
          onDateToChange={doc.setReportDateTo}
          onStatusChange={doc.setReportStatus}
          onClassChange={doc.setReportClass}
          onFormatChange={doc.setReportFormat}
          onToggleSelect={props.onToggleSelect}
          onToggleSelectAll={props.onToggleSelectAll}
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

  return (
    <>
      <StatCards
        statCards={[
          { label: 'Total', value: doc.queueStatus?.total ?? doc.documents.length, color: 'var(--accent-cyan)', icon: FileText },
          { label: 'Processing', value: doc.queueStatus?.processing ?? doc.processing.length, color: 'var(--accent-violet)', icon: Clock, pulse: (doc.queueStatus?.processing ?? doc.processing.length) > 0 },
          { label: 'Needs Review', value: doc.queueStatus?.needs_review ?? doc.needsReview.length, color: 'var(--accent-amber)', icon: AlertTriangle },
          { label: 'Verified', value: doc.queueStatus?.verified ?? doc.verified.length, color: 'var(--accent-emerald)', icon: Check },
          { label: 'Failed', value: doc.queueStatus?.failed ?? doc.failed.length, color: 'var(--accent-rose)', icon: X },
        ]}
        escBreakdown={doc.escBreakdown}
        onTabClick={doc.setActiveTab}
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
        isDragOver={ui.isDragOver}
        onDragOver={ui.setIsDragOver}
      />

      <DocumentTable
        documents={doc.documents}
        activeTab={doc.activeTab}
        onTabChange={doc.setActiveTab}
        searchQuery={doc.searchQuery}
        onSearchChange={doc.setSearchQuery}
        sortKey={doc.sortKey}
        sortDir={doc.sortDir}
        onSortChange={props.toggleSort}
        selectedIds={doc.selectedDashDocs}
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
      />

      {doc.loading && (
        <div className="sticky bottom-0 left-0 right-0 z-20">
          <div className="h-0.5 bg-violet-500/20">
            <div className="h-full bg-violet-500 rounded-full animate-pulse w-2/3" />
          </div>
        </div>
      )}
    </>
  );
}
