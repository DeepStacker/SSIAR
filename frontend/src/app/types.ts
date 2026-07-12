import type { Document, DocumentDetails, TabType, SortKey, ReportFormat } from '@/api';

export interface ConfirmState {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  onConfirm: () => void;
}

export interface AppState {
  documents: Document[];
  queueStatus: import('@/api').QueueStatus | null;
  loading: boolean;
  selectedDoc: Document | null;
  docDetails: DocumentDetails | null;
  detailsLoading: boolean;
  dirty: boolean;
  saving: boolean;
  reviewIndex: number;
  sidebarCollapsed: boolean;
  uploading: boolean;
  autoVerify: boolean;
  splitPages: boolean;
  isDragOver: boolean;
  activeTab: TabType;
  searchQuery: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  selectedDashDocs: Set<string>;
  view: import('@/api').ViewMode;
  reportDateFrom: string;
  reportDateTo: string;
  reportStatus: string;
  reportClass: string;
  reportFormat: ReportFormat;
  selectedReportDocs: Set<string>;
  analyticsClassFilter: string;
  analyticsGenderFilter: string;
  confirmState: ConfirmState | null;
  initialLoadDone: import('react').MutableRefObject<boolean>;
  loadingRef: import('react').MutableRefObject<boolean>;
}
