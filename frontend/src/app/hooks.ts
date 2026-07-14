import { useEffect, useRef, useMemo } from 'react';
import { isTokenExpired, redirectToLogin, scheduleTokenRefresh, invalidateCache, api } from '@/api';
import type { Document } from '@/api';
import { useDocument } from '@/context/DocumentContext';
import { useUI } from '@/context/UIContext';

export function useInitAuth() {
  useEffect(() => {
    if (isTokenExpired()) {
      redirectToLogin();
    } else {
      scheduleTokenRefresh();
    }
    api.recoverStuckDocuments().catch(() => {});
  }, []);
}

export function useSSE(
  loadAll: () => Promise<void>,
) {
  const doc = useDocument();
  const docRef = useRef(doc);
  docRef.current = doc;
  const loadRef = useRef(loadAll);
  loadRef.current = loadAll;

  useEffect(() => {
    loadAll();
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (isTokenExpired()) { redirectToLogin(); return; }
      try {
        es?.close();
        es = new EventSource(api.getEventsUrl());
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const { event: eventType, data } = parsed;
            
            if (eventType === 'document_updated' && data?.doc_id) {
              invalidateCache(`/documents/${data.doc_id}`);
              invalidateCache('/documents');
              api.getDocumentDetails(data.doc_id).then(detail => {
                docRef.current.updateDocument(data.doc_id, () => ({...detail} as any));
              }).catch(() => {});
            } else if (eventType === 'document_deleted' && data?.doc_id) {
              docRef.current.removeDocument(data.doc_id);
            } else if (eventType === 'document_upload' && data?.doc_id) {
              invalidateCache('/documents');
              docRef.current.setDocuments(prev => {
                const exists = prev.some(item => item.id === data.doc_id);
                if (exists) {
                  return prev.map(item => item.id === data.doc_id ? { ...item, ...data } : item);
                } else {
                  return [{
                    id: data.doc_id,
                    filename: data.filename || 'Uploading...',
                    status: data.status || 'processing',
                    created_at: new Date().toISOString(),
                    roll_number: '',
                    class: ''
                  }, ...prev];
                }
              });
            } else if (['feedback_created', 'feedback_message', 'feedback_status'].includes(eventType) && data?.feedback_id) {
              window.dispatchEvent(new CustomEvent(eventType, { detail: data }));
            } else if (eventType !== 'connected') {
              invalidateCache('/documents');
              loadRef.current();
            }
          } catch (err) {
            console.error("SSE targeted update error:", err);
            loadRef.current();
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
      if (isTokenExpired()) { redirectToLogin(); return; }
      if (!es || es.readyState !== EventSource.OPEN) { invalidateCache('/documents'); loadRef.current(); }
    }, 15000);
    return () => { es?.close(); if (reconnectTimer) clearTimeout(reconnectTimer); clearInterval(fallback); };
  }, [loadAll]);
}

export function useKeyboardShortcuts(
  selectedDoc: Document | null,
  docDetails: any,
  prevDoc: () => void,
  nextDoc: () => void,
  handleSkip: () => void,
  handleVerify: () => void,
  closeDoc: () => void,
) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (selectedDoc && new Set(['needs_review', 'review_required']).has(selectedDoc.status) && docDetails) {
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
}

export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

export function useUrlSync(selectedDoc: Document | null) {
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!selectedDoc) return;
    const url = new URL(window.location.href);
    url.searchParams.set('doc_id', selectedDoc.id);
    window.history.replaceState({}, '', url.toString());
  }, [selectedDoc?.id]);

  return { initialLoadDone };
}

export function useFilteredDocuments() {
  const doc = useDocument();
  const ui = useUI();

  return useMemo(() => {
    const list = ui.activeTab === 'all' ? doc.documents :
      ui.activeTab === 'needs_review' ? doc.needsReview :
      ui.activeTab === 'verified' ? doc.verified :
      ui.activeTab === 'processing' ? doc.processing : doc.failed;
    let result = list;
    if (ui.searchQuery.trim()) {
      const q = ui.searchQuery.toLowerCase();
      result = list.filter(d =>
        d.filename.toLowerCase().includes(q) ||
        (d.roll_number && d.roll_number.includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const av = (a[ui.sortKey] || '').toLowerCase();
      const bv = (b[ui.sortKey] || '').toLowerCase();
      return ui.sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [doc.documents, doc.needsReview, doc.verified, doc.processing, doc.failed, ui.activeTab, ui.searchQuery, ui.sortKey, ui.sortDir]);
}
