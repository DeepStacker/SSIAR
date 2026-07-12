import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { Document } from '@/api';
import { STATUS_PROCESSING, STATUS_REVIEW, STATUS_VERIFIED, STATUS_FAILED } from '@/api';
import { useDocument } from '@/context/DocumentContext';

interface SelectionContextValue {
  selectedDashDocs: Set<string>;
  setSelectedDashDocs: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedReportDocs: Set<string>;
  setSelectedReportDocs: React.Dispatch<React.SetStateAction<Set<string>>>;
  reportResults: Document[];
  onToggleDashDoc: (id: string) => void;
  onToggleAllDashDocs: (docIds: string[]) => void;
  onToggleReportDoc: (id: string) => void;
  onToggleAllReportDocs: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export const SelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedDashDocs, setSelectedDashDocs] = useState<Set<string>>(new Set());
  const [selectedReportDocs, setSelectedReportDocs] = useState<Set<string>>(new Set());
  const doc = useDocument();

  const reportResults = useMemo(() => doc.documents.filter(d => {
    if (doc.reportStatus && d.status !== doc.reportStatus) {
      const groupMatch =
        (doc.reportStatus === 'processing' && STATUS_PROCESSING.has(d.status)) ||
        (doc.reportStatus === 'needs_review' && STATUS_REVIEW.has(d.status)) ||
        (doc.reportStatus === 'verified' && STATUS_VERIFIED.has(d.status)) ||
        (doc.reportStatus === 'failed' && STATUS_FAILED.has(d.status));
      if (!groupMatch) return false;
    }
    if (doc.reportClass && d.class !== doc.reportClass) return false;
    if (doc.reportDateFrom && d.created_at && d.created_at.slice(0, 10) < doc.reportDateFrom) return false;
    if (doc.reportDateTo && d.created_at && d.created_at.slice(0, 10) > doc.reportDateTo) return false;
    return true;
  }), [doc.documents, doc.reportStatus, doc.reportClass, doc.reportDateFrom, doc.reportDateTo]);

  const onToggleDashDoc = useCallback((id: string) => {
    setSelectedDashDocs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onToggleAllDashDocs = useCallback((docIds: string[]) => {
    setSelectedDashDocs((prev: Set<string>) => {
      if (prev.size === docIds.length) return new Set();
      return new Set(docIds);
    });
  }, []);

  const onToggleReportDoc = useCallback((id: string) => {
    setSelectedReportDocs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onToggleAllReportDocs = useCallback(() => {
    setSelectedReportDocs((prev: Set<string>) => {
      if (prev.size === reportResults.length) return new Set();
      return new Set(reportResults.map(d => d.id));
    });
  }, [reportResults]);

  return (
    <SelectionContext.Provider value={{
      selectedDashDocs, setSelectedDashDocs,
      selectedReportDocs, setSelectedReportDocs,
      reportResults,
      onToggleDashDoc, onToggleAllDashDocs,
      onToggleReportDoc, onToggleAllReportDocs,
    }}>
      {children}
    </SelectionContext.Provider>
  );
};

export const useSelection = () => {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
};
