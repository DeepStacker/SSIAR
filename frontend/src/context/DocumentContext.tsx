import React, { createContext, useContext, useState, useMemo } from 'react';
import type { Document, DocumentDetails, QueueStatus, TabType, SortKey, ReportFormat, EscBreakdown } from '@/api';
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
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  activeTab: TabType;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  sortKey: SortKey;
  setSortKey: React.Dispatch<React.SetStateAction<SortKey>>;
  sortDir: 'asc' | 'desc';
  setSortDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
  selectedDashDocs: Set<string>;
  setSelectedDashDocs: React.Dispatch<React.SetStateAction<Set<string>>>;
  autoVerify: boolean;
  setAutoVerify: React.Dispatch<React.SetStateAction<boolean>>;
  splitPages: boolean;
  setSplitPages: React.Dispatch<React.SetStateAction<boolean>>;
  selectedReportDocs: Set<string>;
  setSelectedReportDocs: React.Dispatch<React.SetStateAction<Set<string>>>;
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
  filtered: Document[];
  reportResults: Document[];
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedDashDocs, setSelectedDashDocs] = useState<Set<string>>(new Set());
  const [autoVerify, setAutoVerify] = useState(true);
  const [splitPages, setSplitPages] = useState(false);
  const [selectedReportDocs, setSelectedReportDocs] = useState<Set<string>>(new Set());
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

  const reportResults = useMemo(() => documents.filter(d => {
    if (reportStatus && d.status !== reportStatus) return false;
    if (reportClass && d.class !== reportClass) return false;
    if (reportDateFrom && d.created_at && d.created_at.slice(0, 10) < reportDateFrom) return false;
    if (reportDateTo && d.created_at && d.created_at.slice(0, 10) > reportDateTo) return false;
    return true;
  }), [documents, reportStatus, reportClass, reportDateFrom, reportDateTo]);

  const filtered = useMemo(() => {
    const list = activeTab === 'all' ? documents :
      activeTab === 'needs_review' ? needsReview :
      activeTab === 'verified' ? verified :
      activeTab === 'processing' ? processing : failed;
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = list.filter(d =>
        d.filename.toLowerCase().includes(q) ||
        (d.roll_number && d.roll_number.includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const av = (a[sortKey] || '').toLowerCase();
      const bv = (b[sortKey] || '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [documents, activeTab, needsReview, verified, processing, failed, searchQuery, sortKey, sortDir]);

  const value: DocumentContextValue = {
    documents, setDocuments,
    queueStatus, setQueueStatus,
    loading, setLoading,
    selectedDoc, setSelectedDoc,
    docDetails, setDocDetails,
    detailsLoading, setDetailsLoading,
    searchQuery, setSearchQuery,
    activeTab, setActiveTab,
    sortKey, setSortKey,
    sortDir, setSortDir,
    selectedDashDocs, setSelectedDashDocs,
    autoVerify, setAutoVerify,
    splitPages, setSplitPages,
    selectedReportDocs, setSelectedReportDocs,
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
    filtered,
    reportResults,
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
