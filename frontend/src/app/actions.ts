import type { Document, QueueStatus } from '@/api';
import { STATUS_FAILED, api } from '@/api';
import { useDocument } from '@/context/DocumentContext';
import { useUI } from '@/context/UIContext';
import { useReview } from '@/context/ReviewContext';
import { useToast } from '@/context/ToastContext';

export function useHandlers(
  loadAll: () => Promise<void>,
  closeDoc: () => void,
  closeDocForce: () => void,
) {
  const { show } = useToast();
  const doc = useDocument();
  const ui = useUI();
  const review = useReview();

  const loadDocDetails = async (d: Document) => {
    doc.setSelectedDoc(d);
    review.setDirty(false);
    doc.setDetailsLoading(true);
    try {
      const data = await api.getDocumentDetails(d.id);
      if (!data.responses) data.responses = {};
      if (!data.academic_scores) data.academic_scores = { math_pct: "", science_pct: "", language_pct: "", rank: "" };
      doc.setDocDetails(data);
    } catch (err) {
      console.error(err);
      show("Failed to load details", 'error');
    } finally {
      doc.setDetailsLoading(false);
    }
  };

  const handleOpenDoc = (d: Document) => {
    const PROCESSING = new Set(['processing', 'uploaded', 'queued', 'azure_completed', 'validation_completed']);
    if (PROCESSING.has(d.status)) {
      review.setDirty(false);
      doc.setSelectedDoc(d);
      doc.setDocDetails(null);
      return;
    }
    const idx = doc.needsReview.findIndex(x => x.id === d.id);
    review.setReviewIndex(Math.max(0, idx));
    loadDocDetails(d);
  };

  const handleVerify = async () => {
    const { selectedDoc, docDetails } = doc;
    if (!selectedDoc || !docDetails) return;
    review.setSaving(true);
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
      review.setDirty(false);
      show(`Saved ${selectedDoc.filename}`);
      doc.setDocuments(prev => prev.map(x =>
        x.id === selectedDoc.id ? { ...x, status: 'verified' as const, verified_by_human: 1 } : x
      ));
      doc.setQueueStatus((prev: QueueStatus | null) => prev ? {
        ...prev,
        needs_review: Math.max(0, prev.needs_review - 1),
        verified: prev.verified + 1,
      } : prev);
      nextDoc();
    } catch (err) {
      console.error(err);
      show("Save failed", 'error');
    } finally {
      review.setSaving(false);
    }
  };

  const doNextDoc = () => {
    const list = doc.needsReview;
    const next = review.reviewIndex + 1;
    review.setDirty(false);
    if (next < list.length) {
      review.setReviewIndex(next);
      loadDocDetails(list[next]);
    } else {
      closeDocForce();
      review.setReviewIndex(0);
    }
  };

  const nextDoc = () => {
    if (review.dirty) {
      ui.setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them and continue?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: doNextDoc,
      });
    } else {
      doNextDoc();
    }
  };

  const doPrevDoc = () => {
    const list = doc.needsReview;
    const prev = review.reviewIndex - 1;
    review.setDirty(false);
    if (prev >= 0) {
      review.setReviewIndex(prev);
      loadDocDetails(list[prev]);
    }
  };

  const prevDoc = () => {
    if (review.dirty) {
      ui.setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them and continue?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: doPrevDoc,
      });
    } else {
      doPrevDoc();
    }
  };

  const handleSkip = () => {
    const doSkip = () => { closeDocForce(); review.setReviewIndex(0); };
    if (review.dirty) {
      ui.setConfirmState({
        title: 'Unsaved changes',
        description: 'You have unsaved changes. Discard them and skip?',
        confirmLabel: 'Discard',
        confirmVariant: 'destructive',
        onConfirm: doSkip,
      });
    } else { doSkip(); }
  };

  const handleReprocess = async () => {
    const { selectedDoc } = doc;
    if (!selectedDoc) return;
    ui.setConfirmState({
      title: 'Reprocess document?',
      description: `Reprocess "${selectedDoc.filename}"?`,
      confirmVariant: 'default',
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        try {
          await api.reprocessDocument(selectedDoc.id);
          doc.setDocDetails(null);
          doc.setSelectedDoc((prev: Document | null) => prev ? { ...prev, status: 'processing' } : null);
          review.setDirty(false);
          await loadAll();
        } catch (err) {
          console.error(err);
          show("Reprocess failed", 'error');
        }
      },
    });
  };

  const handleDeleteDoc = async (d: Document) => {
    ui.setConfirmState({
      title: 'Delete document?',
      description: `Delete "${d.filename}"? This cannot be undone.`,
      confirmVariant: 'destructive',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api.deleteDocument(d.id);
          if (doc.selectedDoc?.id === d.id) closeDoc();
          await loadAll();
        } catch { show("Delete failed", 'error'); }
      },
    });
  };

  const downloadIndividualReport = (d: Document) => {
    window.open(api.getExportUrl({ format: 'csv', doc_ids: d.id }), '_blank');
  };

  const handleReprocessDoc = async (d: Document) => {
    ui.setConfirmState({
      title: 'Reprocess document?',
      description: `Reprocess "${d.filename}"?`,
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        try {
          await api.reprocessDocument(d.id);
          await loadAll();
        } catch { show("Reprocess failed", 'error'); }
      },
    });
  };

  const handleReprocessAllFailed = async () => {
    const failedDocs = doc.documents.filter(d => STATUS_FAILED.has(d.status));
    if (!failedDocs.length) return;
    ui.setConfirmState({
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
    ui.setConfirmState({
      title: 'Verify documents?',
      description: `Verify ${docIds.length} selected documents?`,
      confirmLabel: 'Verify',
      confirmVariant: 'default',
      onConfirm: async () => {
        try {
          await api.bulkVerify(docIds);
          show(`Verified ${docIds.length} documents`);
          doc.setSelectedDashDocs(new Set());
          await loadAll();
        } catch { show("Bulk verify failed", 'error'); }
      },
    });
  };

  const handleBulkReprocess = async (docIds: string[]) => {
    ui.setConfirmState({
      title: 'Reprocess documents?',
      description: `Reprocess ${docIds.length} selected documents?`,
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        try {
          await Promise.all(docIds.map(id => api.reprocessDocument(id)));
          show(`Reprocessing ${docIds.length} documents`);
          doc.setSelectedDashDocs(new Set());
        } catch { show("Bulk reprocess failed", 'error'); }
      },
    });
  };

  const handleBulkDelete = async (docIds: string[]) => {
    ui.setConfirmState({
      title: 'Delete documents?',
      description: `Delete ${docIds.length} selected documents? This cannot be undone.`,
      confirmVariant: 'destructive',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api.bulkDelete(docIds);
          show(`Deleted ${docIds.length} documents`);
          doc.setSelectedDashDocs(new Set());
        } catch { show("Bulk delete failed", 'error'); }
      },
    });
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    ui.setUploading(true);
    try { await api.uploadFiles(files, doc.autoVerify, doc.splitPages); await loadAll(); }
    catch { show("Upload failed", 'error'); }
    finally { ui.setUploading(false); }
  };

  const toggleDashDoc = (id: string) => {
    doc.setSelectedDashDocs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllDashDocs = (filtered: Document[]) => {
    if (doc.selectedDashDocs.size === filtered.length) doc.setSelectedDashDocs(new Set());
    else doc.setSelectedDashDocs(new Set(filtered.map(d => d.id)));
  };

  const toggleReportDoc = (id: string) => {
    doc.setSelectedReportDocs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllReportDocs = () => {
    if (doc.selectedReportDocs.size === doc.reportResults.length) doc.setSelectedReportDocs(new Set());
    else doc.setSelectedReportDocs(new Set(doc.reportResults.map(d => d.id)));
  };

  const toggleSort = (key: import('@/api').SortKey) => {
    if (doc.sortKey === key) doc.setSortDir((d: 'asc' | 'desc') => d === 'asc' ? 'desc' : 'asc');
    else { doc.setSortKey(key); doc.setSortDir('asc'); }
  };

  return {
    loadDocDetails,
    handleOpenDoc,
    handleVerify,
    handleReprocess,
    handleDeleteDoc,
    downloadIndividualReport,
    handleReprocessDoc,
    handleReprocessAllFailed,
    handleBulkVerify,
    handleBulkReprocess,
    handleBulkDelete,
    handleUpload,
    toggleDashDoc,
    toggleAllDashDocs,
    toggleReportDoc,
    toggleAllReportDocs,
    toggleSort,
    nextDoc,
    prevDoc,
    handleSkip,
  };
}
