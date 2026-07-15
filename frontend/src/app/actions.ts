import type { Document } from '@/api';
import { STATUS_FAILED, api, invalidateCache } from '@/api';
import { useDocument } from '@/context/DocumentContext';
import { useUI } from '@/context/UIContext';
import { useReview } from '@/context/ReviewContext';
import { useSelection } from '@/context/SelectionContext';
import { useToast } from '@/context/ToastContext';

export function useHandlers(
  closeDoc: () => void,
  closeDocForce: () => void,
  refreshDocuments: () => void,
) {
  const { show } = useToast();
  const doc = useDocument();
  const ui = useUI();
  const review = useReview();
  const sel = useSelection();

  const loadDocDetails = async (d: Document) => {
    doc.setSelectedDoc(d);
    review.setDirty(false);
    doc.setDetailsLoading(true);
    doc.setDetailsError(null);
    try {
      const data = await api.getDocumentDetails(d.id);
      if (!data.responses) data.responses = {};
      if (!data.academic_scores) data.academic_scores = { math_pct: "", science_pct: "", language_pct: "", rank: "" };
      doc.setDocDetails(data);
      doc.setDetailsError(null);
    } catch (err) {
      console.error(err);
      doc.setDocDetails(null);
      doc.setDetailsError((err instanceof Error ? err.message : null) || 'Failed to load details');
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
    
    // Save original documents state for rollback
    const origDocs = [...doc.documents];
    
    // Optimistic Update
    doc.setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, status: 'verified' } : d));
    
    try {
      const result = await api.verifyDocument(selectedDoc.id, {
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
      show(result.message || `Saved ${selectedDoc.filename}`);
      invalidateCache('/documents');
      invalidateCache(`/documents/${selectedDoc.id}`);
      nextDoc();
    } catch (err) {
      console.error(err);
      doc.setDocuments(origDocs); // Rollback
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
        const origDocs = [...doc.documents];
        // Optimistic Update
        doc.setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, status: 'processing' } : d));
        doc.setSelectedDoc((prev: Document | null) => prev ? { ...prev, status: 'processing' } : null);
        doc.setDocDetails(null);
        review.setDirty(false);
        try {
          await api.reprocessDocument(selectedDoc.id);
          invalidateCache('/documents');
          invalidateCache(`/documents/${selectedDoc.id}`);
        } catch (err) {
          console.error(err);
          doc.setDocuments(origDocs); // Rollback
          doc.setSelectedDoc(selectedDoc);
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
        doc.removeDocument(d.id);
        try {
          await api.deleteDocument(d.id);
          invalidateCache('/documents');
          invalidateCache(`/documents/${d.id}`);
          if (doc.selectedDoc?.id === d.id) closeDoc();
          show("Document deleted");
        } catch {
          invalidateCache('/documents');
          show("Delete failed", 'error');
        }
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
        const origDocs = [...doc.documents];
        // Optimistic Update
        doc.setDocuments(prev => prev.map(x => x.id === d.id ? { ...x, status: 'processing' } : x));
        try {
          await api.reprocessDocument(d.id);
          invalidateCache('/documents');
          invalidateCache(`/documents/${d.id}`);
        } catch {
          doc.setDocuments(origDocs); // Rollback
          show("Reprocess failed", 'error');
        }
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
        const origDocs = [...doc.documents];
        // Optimistic Update
        doc.setDocuments(prev => prev.map(x => STATUS_FAILED.has(x.status) ? { ...x, status: 'processing' } : x));
        try {
          await Promise.all(failedDocs.map(d => api.reprocessDocument(d.id)));
          invalidateCache('/documents');
        } catch {
          doc.setDocuments(origDocs); // Rollback
          show("Batch reprocess failed", 'error');
        }
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
        const origDocs = [...doc.documents];
        const targetIds = new Set(docIds);
        // Optimistic Update
        doc.setDocuments(prev => prev.map(d => targetIds.has(d.id) ? { ...d, status: 'verified' } : d));
        try {
          const result = await api.bulkVerify(docIds);
          invalidateCache('/documents');
          show(result.message || `Verified ${docIds.length} documents`);
          sel.setSelectedDashDocs(new Set());
        } catch {
          doc.setDocuments(origDocs); // Rollback
          show("Bulk verify failed", 'error');
        }
      },
    });
  };

  const handleBulkReprocess = async (docIds: string[]) => {
    ui.setConfirmState({
      title: 'Reprocess documents?',
      description: `Reprocess ${docIds.length} selected documents?`,
      confirmLabel: 'Reprocess',
      onConfirm: async () => {
        const origDocs = [...doc.documents];
        const targetIds = new Set(docIds);
        // Optimistic Update
        doc.setDocuments(prev => prev.map(d => targetIds.has(d.id) ? { ...d, status: 'processing' } : d));
        try {
          await Promise.all(docIds.map(id => api.reprocessDocument(id)));
          invalidateCache('/documents');
          show(`Reprocessing ${docIds.length} documents`);
          sel.setSelectedDashDocs(new Set());
        } catch {
          doc.setDocuments(origDocs); // Rollback
          show("Bulk reprocess failed", 'error');
        }
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
        const origDocs = [...doc.documents];
        const targetIds = new Set(docIds);
        // Optimistic Update
        doc.setDocuments(prev => prev.filter(d => !targetIds.has(d.id)));
        try {
          const result = await api.bulkDelete(docIds);
          invalidateCache('/documents');
          show(result.message || `Deleted ${docIds.length} documents`);
          sel.setSelectedDashDocs(new Set());
        } catch {
          doc.setDocuments(origDocs); // Rollback
          show("Bulk delete failed", 'error');
        }
      },
    });
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    ui.setUploading(true);
    
    // Optimistic Update: Add temporary processing document tags
    const tempDocs: Document[] = files.map(file => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      filename: file.name,
      status: 'processing',
      created_at: new Date().toISOString(),
      roll_number: '',
      class: ''
    }));
    doc.setDocuments(prev => [...tempDocs, ...prev]);

    try { 
      const result = await api.uploadFiles(files, doc.autoVerify, doc.splitPages); 
      show(result.message || `Uploaded ${result.document_ids?.length || files.length} file(s)`); 
      invalidateCache('/documents');
      
      // Clean up temporary placeholders and fetch real entities
      refreshDocuments();
    } catch { 
      // Remove temporary tags on failure
      const tempIds = new Set(tempDocs.map(t => t.id));
      doc.setDocuments(prev => prev.filter(d => !tempIds.has(d.id)));
      show("Upload failed", 'error'); 
    } finally { 
      ui.setUploading(false); 
    }
  };

  const toggleSort = (key: import('@/api').SortKey) => {
    if (ui.sortKey === key) ui.setSortDir((d: 'asc' | 'desc') => d === 'asc' ? 'desc' : 'asc');
    else { ui.setSortKey(key); ui.setSortDir('asc'); }
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
    toggleSort,
    nextDoc,
    prevDoc,
    handleSkip,
  };
}
