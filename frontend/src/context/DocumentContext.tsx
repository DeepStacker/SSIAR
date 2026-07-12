import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { Document, DocumentDetails, QueueStatus, ReportFormat, EscBreakdown } from '@/api';
import { STATUS_REVIEW, STATUS_VERIFIED, STATUS_PROCESSING, STATUS_FAILED } from '@/api';

interface DocumentContextValue {
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  queueStatus: QueueStatus | null;
  setQueueStatus: React.Dispatch<React.SetStateAction<QueueStatus | null>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  selectedDoc: Document | null;
  setSelectedDoc: React.Dispatch<React.SetStateAction<Document | null>>;
  docDetails: DocumentDetails | null;
  setDocDetails: React.Dispatch<React.SetStateAction<DocumentDetails | null>>;
  detailsLoading: boolean;
  setDetailsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  detailsError: string | null;
  setDetailsError: React.Dispatch<React.SetStateAction<string | null>>;
  isDragOver: boolean;
  setIsDragOver: React.Dispatch<React.SetStateAction<boolean>>;
  autoVerify: boolean;
  setAutoVerify: React.Dispatch<React.SetStateAction<boolean>>;
  splitPages: boolean;
  setSplitPages: React.Dispatch<React.SetStateAction<boolean>>;
  reportDateFrom: string;
  setReportDateFrom: React.Dispatch<React.SetStateAction<string>>;
  reportDateTo: string;
  setReportDateTo: React.Dispatch<React.SetStateAction<string>>;
  reportStatus: string;
  setReportStatus: React.Dispatch<React.SetStateAction<string>>;
  reportClass: string;
  setReportClass: React.Dispatch<React.SetStateAction<string>>;
  reportFormat: ReportFormat;
  setReportFormat: React.Dispatch<React.SetStateAction<ReportFormat>>;
  analyticsClassFilter: string;
  setAnalyticsClassFilter: React.Dispatch<React.SetStateAction<string>>;
  analyticsGenderFilter: string;
  setAnalyticsGenderFilter: React.Dispatch<React.SetStateAction<string>>;
  needsReview: Document[];
  verified: Document[];
  processing: Document[];
  failed: Document[];
  escBreakdown: EscBreakdown | null;
  updateDocument: (id: string, updater: (doc: Document) => Document) => void;
  removeDocument: (id: string) => void;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoVerify, setAutoVerify] = useState(true);
  const [splitPages, setSplitPages] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportStatus, setReportStatus] = useState('verified');
  const [reportClass, setReportClass] = useState('');
  const [reportFormat, setReportFormat] = useState<ReportFormat>('excel');
  const [analyticsClassFilter, setAnalyticsClassFilter] = useState<string>('all');
  const [analyticsGenderFilter, setAnalyticsGenderFilter] = useState<string>('all');

  const needsReview = useMemo(() => documents.filter(d => STATUS_REVIEW.has(d.status)), [documents]);
  const verified = useMemo(() => documents.filter(d => STATUS_VERIFIED.has(d.status)), [documents]);
  const processing = useMemo(() => documents.filter(d => STATUS_PROCESSING.has(d.status)), [documents]);
  const failed = useMemo(() => documents.filter(d => STATUS_FAILED.has(d.status)), [documents]);
  const escBreakdown = queueStatus?.by_escalation || null;

  const updateDocument = useCallback((id: string, updater: (doc: Document) => Document) => {
    setDocuments(prev => prev.map(d => d.id === id ? updater(d) : d));
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    setSelectedDoc(prev => prev?.id === id ? null : prev);
    setDocDetails(prev => prev?.id === id ? null : prev);
  }, []);

  const value: DocumentContextValue = {
    documents, setDocuments,
    queueStatus, setQueueStatus,
    loading, setLoading,
    selectedDoc, setSelectedDoc,
    docDetails, setDocDetails,
    detailsLoading, setDetailsLoading,
    detailsError, setDetailsError,
    isDragOver, setIsDragOver,
    autoVerify, setAutoVerify,
    splitPages, setSplitPages,
    reportDateFrom, setReportDateFrom,
    reportDateTo, setReportDateTo,
    reportStatus, setReportStatus,
    reportClass, setReportClass,
    reportFormat, setReportFormat,
    analyticsClassFilter, setAnalyticsClassFilter,
    analyticsGenderFilter, setAnalyticsGenderFilter,
    needsReview,
    verified,
    processing,
    failed,
    escBreakdown,
    updateDocument,
    removeDocument,
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocument = () => {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error('useDocument must be used within DocumentProvider');
  return ctx;
};
