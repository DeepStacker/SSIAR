import { useEffect, useRef } from 'react';
import { isTokenExpired, clearAuth, scheduleTokenRefresh, clearApiCache, api } from '@/api';
import type { Document } from '@/api';

export function useInitAuth() {
  useEffect(() => {
    if (isTokenExpired()) {
      clearAuth();
      window.location.href = '/';
    } else {
      scheduleTokenRefresh();
    }
    api.recoverStuckDocuments().catch(() => {});
  }, []);
}

export function useSSE(
  loadAll: () => Promise<void>,
  selectedDoc: Document | null,
) {
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
                  .then(() => { /* handled by caller */ })
                  .catch(() => {});
              }
              loadAll();
            } else if (eventType === 'document_deleted' && data?.doc_id) {
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
  }, [loadAll, selectedDoc?.id]);
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
