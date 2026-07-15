import React, { useMemo } from 'react';
import { Search, Clock, AlertTriangle, Check, X, Eye, Download, RotateCcw, Trash2, ChevronUp, ChevronDown, FileWarning, Upload, Inbox } from 'lucide-react';
import type { Document, TabType, SortKey } from '@/api';
import { STATUS_REVIEW, STATUS_VERIFIED, STATUS_PROCESSING, STATUS_FAILED } from '@/api';
import { BulkActionBar } from '@/features/documents/BulkActionBar';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

const tabConfig: { key: TabType; label: string; icon: React.ReactNode | null }[] = [
  { key: 'all', label: 'All Files', icon: null },
  { key: 'processing', label: 'Processing', icon: <Clock size={11} /> },
  { key: 'needs_review', label: 'Review', icon: <AlertTriangle size={11} /> },
  { key: 'verified', label: 'Verified', icon: <Check size={11} /> },
  { key: 'failed', label: 'Failed', icon: <X size={11} /> },
];

const matchStatus = (doc: Document, tab: TabType): boolean => {
  if (tab === 'all') return true;
  if (tab === 'needs_review') return STATUS_REVIEW.has(doc.status);
  if (tab === 'verified') return STATUS_VERIFIED.has(doc.status);
  if (tab === 'processing') return STATUS_PROCESSING.has(doc.status);
  if (tab === 'failed') return STATUS_FAILED.has(doc.status);
  return false;
};

interface Props {
  documents: Document[];
  activeTab: TabType;
  onTabChange: (t: TabType) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSortChange: (key: SortKey) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenDoc: (doc: Document) => void;
  onDownloadReport: (doc: Document) => void;
  onReprocess: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  onBulkDone: () => void;
  onBulkVerify?: (docIds: string[]) => void;
  onBulkReprocess?: (docIds: string[]) => void;
  onBulkDelete?: (docIds: string[]) => void;
  loading?: boolean;
  onUpload?: () => void;
}

export const DocumentTable = React.memo<Props>(({
  documents, activeTab, onTabChange, searchQuery, onSearchChange,
  sortKey, sortDir, onSortChange, selectedIds, onToggleSelect, onToggleSelectAll,
  onOpenDoc, onDownloadReport, onReprocess, onDelete, onBulkDone,
  onBulkVerify, onBulkReprocess, onBulkDelete, loading, onUpload,
}) => {
  const filtered = useMemo(() => {
    const list = documents.filter(d => matchStatus(d, activeTab));
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
  }, [documents, activeTab, searchQuery, sortKey, sortDir]);

  const counts = useMemo(() => ({
    all: documents.length,
    processing: documents.filter(d => STATUS_PROCESSING.has(d.status)).length,
    needs_review: documents.filter(d => STATUS_REVIEW.has(d.status)).length,
    verified: documents.filter(d => STATUS_VERIFIED.has(d.status)).length,
    failed: documents.filter(d => STATUS_FAILED.has(d.status)).length,
  }), [documents]);

  return (
    <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabType)}>
          <TabsList variant="line" className="bg-transparent border-none p-0 flex gap-1 overflow-x-auto min-w-0 pb-0.5">
            {tabConfig.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key}
                className="text-xs px-3 py-1.5 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground font-semibold gap-1.5 text-muted-foreground rounded-none transition-all">
                {tab.icon} {tab.label}
                <span className="text-[10px] bg-secondary/60 px-1.5 py-0.5 rounded-full">
                  {counts[tab.key]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by filename or roll number..."
              className="w-full pl-9 text-xs h-9"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <BulkActionBar selectedCount={selectedIds.size} docIds={Array.from(selectedIds)} onDone={onBulkDone}
        onBulkVerify={onBulkVerify} onBulkReprocess={onBulkReprocess} onBulkDelete={onBulkDelete} />

      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-4 sm:py-6 px-4 sm:px-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-4 w-4 rounded shrink-0" />
                <div className="skeleton h-4 rounded flex-1" />
                <div className="skeleton h-4 rounded w-20 sm:w-24" />
                <div className="skeleton h-4 rounded w-12 sm:w-16" />
                <div className="skeleton h-4 rounded w-16 sm:w-20" />
                <div className="skeleton h-4 rounded w-20 sm:w-24" />
                <div className="skeleton h-7 rounded w-16 sm:w-20" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
              {searchQuery ? (
                <Search size={26} className="text-muted-foreground" />
              ) : activeTab === 'all' && documents.length === 0 ? (
                <Inbox size={26} className="text-primary" />
              ) : activeTab === 'processing' ? (
                <Clock size={26} className="text-muted-foreground" />
              ) : activeTab === 'needs_review' ? (
                <AlertTriangle size={26} className="text-violet-500" />
              ) : activeTab === 'verified' ? (
                <Check size={26} className="text-emerald-500" />
              ) : activeTab === 'failed' ? (
                <X size={26} className="text-rose-500" />
              ) : (
                <FileWarning size={26} className="text-muted-foreground" />
              )}
            </div>
            <div>
              <span className="font-semibold text-sm block">
                {searchQuery ? 'No matching documents' :
                 documents.length === 0 ? 'No documents yet' :
                 activeTab === 'processing' ? 'No active background tasks' :
                 activeTab === 'needs_review' ? 'All caught up! No reviews needed' :
                 activeTab === 'verified' ? 'No verified datasets yet' :
                 activeTab === 'failed' ? 'No failed processes' :
                 'No documents found'}
              </span>
              <span className="text-xs text-muted-foreground mt-1 block">
                {searchQuery ? 'Try a different search term' :
                 documents.length === 0 ? 'Upload your first research PDF to get started' :
                 activeTab === 'all' ? 'Adjust your search or filters' :
                 'All documents are processed'}
              </span>
            </div>
            {(documents.length === 0 && !searchQuery && activeTab === 'all' && onUpload) && (
              <Button variant="default" size="sm" onClick={onUpload} className="mt-2 gap-2">
                <Upload size={14} /> Upload Your First Document
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="w-10 px-3 sm:px-6">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={onToggleSelectAll}
                    className="rounded border-border h-4 w-4"
                    aria-label={selectedIds.size === filtered.length ? "Deselect all documents" : "Select all documents"}
                  />
                </TableHead>
                <SortTh label="Filename" sortKey="filename" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Roll Number" sortKey="roll_number" current={sortKey} dir={sortDir} onSort={onSortChange} className="hidden sm:table-cell" />
                <TableHead className="hidden sm:table-cell text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 w-20">Class</TableHead>
                <SortTh label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Date" sortKey="created_at" current={sortKey} dir={sortDir} onSort={onSortChange} right />
                <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 w-28 sm:w-32 px-2 sm:px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const isSelected = selectedIds.has(doc.id);
                return (
                  <TableRow key={doc.id} onClick={() => onOpenDoc(doc)}
                    tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpenDoc(doc); }}
                    className={`border-b border-border cursor-pointer group transition-colors ${
                      isProc(doc.status) ? 'opacity-65' : ''
                    } ${
                      isSelected ? 'bg-accent/5 hover:bg-accent/10' : 'hover:bg-muted'
                    }`}>
                    <TableCell onClick={e => e.stopPropagation()} className="px-3 sm:px-6 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(doc.id)}
                        className="rounded border-border h-4 w-4"
                        aria-label={`Select ${doc.filename || doc.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-semibold py-3 max-w-[180px] sm:max-w-[280px]">
                      <span className="truncate block text-xs sm:text-sm" title={doc.filename}>{doc.filename}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground py-3">{doc.roll_number || '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs font-mono text-muted-foreground py-3">{doc.class || '—'}</TableCell>
                    <TableCell className="py-3">
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-right text-[10px] sm:text-xs font-mono text-muted-foreground py-3 whitespace-nowrap">
                      {doc.created_at?.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap py-3 px-2 sm:px-6" onClick={e => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        <ActionBtn doc={doc} onOpen={onOpenDoc} onDownload={onDownloadReport} onReprocess={onReprocess} onDelete={onDelete} />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter className="bg-transparent border-t border-border">
                <TableRow>
                  <TableCell colSpan={7} className="text-xs font-medium text-muted-foreground px-6 py-3 text-right uppercase tracking-wider">
                    Total: {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>
    </div>
  );
});

const SortTh: React.FC<{ label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; right?: boolean; className?: string }> = ({ label, sortKey, current, dir, onSort, right, className = '' }) => {
  const isActive = current === sortKey;
  return (
    <TableHead onClick={() => onSort(sortKey)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onSort(sortKey); }}
      className={`cursor-pointer select-none text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 group/sort${right ? ' text-right' : ''} ${className}`}>
      <span className={`inline-flex items-center gap-1.5 ${right ? 'justify-end w-full' : ''}`}>
        {label}
        <span className={`inline-flex flex-col leading-none ${isActive ? 'text-foreground' : 'opacity-0 group-hover/sort:opacity-50 transition-opacity'}`}>
          <ChevronUp size={9} className={isActive && dir === 'asc' ? 'text-primary font-bold' : 'text-muted-foreground/40'} />
          <ChevronDown size={9} className={isActive && dir === 'desc' ? 'text-primary font-bold' : 'text-muted-foreground/40'} />
        </span>
      </span>
    </TableHead>
  );
};

const isProc = (s: string) => STATUS_PROCESSING.has(s);
const isReview = (s: string) => STATUS_REVIEW.has(s);
const isVerified = (s: string) => STATUS_VERIFIED.has(s);
const isFailed = (s: string) => STATUS_FAILED.has(s);

const ActionBtn: React.FC<{ doc: Document; onOpen: (d: Document) => void; onDownload: (d: Document) => void; onReprocess: (d: Document) => void; onDelete: (d: Document) => void }> = ({ doc, onOpen, onDownload, onReprocess, onDelete }) => (
  <>
    <Button variant="outline" size="xs" onClick={e => { e.stopPropagation(); onOpen(doc); }}
      disabled={isProc(doc.status)} className="h-7 text-[10px] px-2.5 font-bold">
      {isProc(doc.status) ? <><Clock size={10} className="animate-spin mr-1" />Proc.</> :
       isVerified(doc.status) ? <><Eye size={10} className="mr-1" />View</> :
       isFailed(doc.status) ? 'Details' : 'Review'}
    </Button>
    {(isReview(doc.status) || isVerified(doc.status) || isFailed(doc.status)) && (
      <Button variant="ghost" size="icon-xs" onClick={e => { e.stopPropagation(); onDownload(doc); }}
        title="Download report" className="h-7 w-7 text-muted-foreground hover:text-foreground">
        <Download size={11} />
      </Button>
    )}
    {(isFailed(doc.status) || isReview(doc.status)) && (
      <Button variant="ghost" size="icon-xs" onClick={e => { e.stopPropagation(); onReprocess(doc); }}
        title="Reprocess" className="h-7 w-7 text-muted-foreground hover:text-foreground">
        <RotateCcw size={11} />
      </Button>
    )}
    <Button variant="ghost" size="icon-xs" onClick={e => { e.stopPropagation(); onDelete(doc); }}
      className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete">
      <Trash2 size={11} />
    </Button>
  </>
);
