import React from 'react';
import { Search, Clock, AlertTriangle, Check, X, Eye, Download, RotateCcw, Trash2, ChevronUp, ChevronDown, FileWarning } from 'lucide-react';
import type { Document, TabType, SortKey } from '../api';
import { STATUS_REVIEW, STATUS_VERIFIED, STATUS_PROCESSING, STATUS_FAILED } from '../api';
import { BulkActionBar } from './BulkActionBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

const tabConfig: { key: TabType; label: string; icon: React.ReactNode | null }[] = [
  { key: 'all', label: 'All', icon: null },
  { key: 'processing', label: 'Processing', icon: <Clock size={12} /> },
  { key: 'needs_review', label: 'Review', icon: <AlertTriangle size={12} /> },
  { key: 'verified', label: 'Verified', icon: <Check size={12} /> },
  { key: 'failed', label: 'Failed', icon: <X size={12} /> },
];

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string; icon: React.ReactNode; label: string }> = {
  processing: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', icon: <Clock size={10} />, label: 'Processing' },
  uploaded: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', icon: <Clock size={10} />, label: 'Processing' },
  queued: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', icon: <Clock size={10} />, label: 'Processing' },
  azure_completed: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', icon: <Clock size={10} />, label: 'Processing' },
  validation_completed: { variant: 'outline', dot: 'bg-violet-500 animate-pulse', icon: <Clock size={10} />, label: 'Processing' },
  needs_review: { variant: 'secondary', dot: 'bg-amber-500', icon: <AlertTriangle size={10} />, label: 'Needs Review' },
  review_required: { variant: 'secondary', dot: 'bg-amber-500', icon: <AlertTriangle size={10} />, label: 'Needs Review' },
  verified: { variant: 'default', dot: 'bg-emerald-500', icon: <Check size={10} />, label: 'Verified' },
  approved: { variant: 'default', dot: 'bg-emerald-500', icon: <Check size={10} />, label: 'Verified' },
  exported: { variant: 'default', dot: 'bg-emerald-500', icon: <Check size={10} />, label: 'Verified' },
  failed: { variant: 'destructive', dot: 'bg-rose-500', icon: <X size={10} />, label: 'Failed' },
};

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
}

export const DocumentTable: React.FC<Props> = ({
  documents, activeTab, onTabChange, searchQuery, onSearchChange,
  sortKey, sortDir, onSortChange, selectedIds, onToggleSelect, onToggleSelectAll,
  onOpenDoc, onDownloadReport, onReprocess, onDelete, onBulkDone,
  onBulkVerify, onBulkReprocess, onBulkDelete,
}) => {
  const filtered = (() => {
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
  })();

  const counts: Record<string, number> = {
    all: documents.length,
    processing: documents.filter(d => STATUS_PROCESSING.has(d.status)).length,
    needs_review: documents.filter(d => STATUS_REVIEW.has(d.status)).length,
    verified: documents.filter(d => STATUS_VERIFIED.has(d.status)).length,
    failed: documents.filter(d => STATUS_FAILED.has(d.status)).length,
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabType)}>
          <TabsList variant="line">
            {tabConfig.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-xs gap-1">
                {tab.icon} {tab.label}
                <span className="tabular-nums opacity-70">({counts[tab.key]})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-[180px] shrink-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" placeholder="Search files..." className="w-full pl-8 text-xs h-8"
            value={searchQuery} onChange={e => onSearchChange(e.target.value)} />
        </div>
      </div>

      <BulkActionBar selectedCount={selectedIds.size} docIds={Array.from(selectedIds)} onDone={onBulkDone}
        onBulkVerify={onBulkVerify} onBulkReprocess={onBulkReprocess} onBulkDelete={onBulkDelete} />

      <div className="max-h-[500px] overflow-y-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:bg-card [&_thead]:z-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <FileWarning size={20} className="text-muted-foreground/60" />
            </div>
            <span className="font-medium">
              {searchQuery ? 'No documents match your search' :
               activeTab === 'processing' ? 'No documents are currently being processed' :
               activeTab === 'needs_review' ? 'No documents need review' :
               activeTab === 'verified' ? 'No verified documents yet' :
               activeTab === 'failed' ? 'No failed documents' :
               'No documents yet'}
            </span>
            {!searchQuery && activeTab === 'all' && (
              <span className="text-xs text-muted-foreground/60">Upload a PDF above to get started</span>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={onToggleSelectAll} className="accent-violet-500"
                    aria-label={selectedIds.size === filtered.length ? "Deselect all documents" : "Select all documents"} />
                </TableHead>
                <SortTh label="Filename" sortKey="filename" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Roll No" sortKey="roll_number" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <TableHead className="text-xs text-muted-foreground font-medium w-16">Class</TableHead>
                <SortTh label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Date" sortKey="created_at" current={sortKey} dir={sortDir} onSort={onSortChange} right />
                <TableHead className="text-right text-xs text-muted-foreground font-medium w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc, idx) => {
                const sc = statusConfig[doc.status] || statusConfig.failed;
                const isSelected = selectedIds.has(doc.id);
                return (
                  <TableRow key={doc.id} onClick={() => onOpenDoc(doc)}
                    tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpenDoc(doc); }}
                    className={`cursor-pointer group transition-colors ${
                      isProc(doc.status) ? 'opacity-70' : ''
                    } ${
                      isSelected ? 'bg-violet-500/[0.04] hover:bg-violet-500/[0.06]' : 'hover:bg-muted/50'
                    } ${idx % 2 === 0 && !isSelected ? 'bg-muted/20' : ''}`}>
                    <TableCell onClick={e => e.stopPropagation()} className="py-2">
                      <input type="checkbox" checked={isSelected}
                        onChange={() => onToggleSelect(doc.id)} className="accent-violet-500"
                        aria-label={`Select ${doc.filename || doc.id}`} />
                    </TableCell>
                    <TableCell className="font-medium text-sm py-2 max-w-[220px]">
                      <span className="truncate block" title={doc.filename}>{doc.filename}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2 tabular-nums">{doc.roll_number || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2 tabular-nums">{doc.class || '—'}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant={sc.variant} className="gap-1.5 text-[11px] px-2.5 py-0.5 font-normal rounded-full">
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground py-2 whitespace-nowrap tabular-nums">
                      {doc.created_at?.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap py-2" onClick={e => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <ActionBtn doc={doc} onOpen={onOpenDoc} onDownload={onDownloadReport} onReprocess={onReprocess} onDelete={onDelete} />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7} className="text-[11px] text-muted-foreground/70 px-4 py-2 text-right tabular-nums">
                    {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>
    </div>
  );
};

const SortTh: React.FC<{ label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; right?: boolean }> = ({ label, sortKey, current, dir, onSort, right }) => {
  const isActive = current === sortKey;
  return (
    <TableHead onClick={() => onSort(sortKey)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onSort(sortKey); }}
      className={`cursor-pointer select-none text-xs text-muted-foreground font-medium group/sort${right ? ' text-right' : ''}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`inline-flex flex-col leading-none ${isActive ? 'text-foreground' : 'opacity-0 group-hover/sort:opacity-40 transition-opacity'}`}>
          <ChevronUp size={9} className={isActive && dir === 'asc' ? 'text-foreground' : 'text-muted-foreground/40'} />
          <ChevronDown size={9} className={isActive && dir === 'desc' ? 'text-foreground' : 'text-muted-foreground/40'} />
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
    <Button variant="ghost" size="xs" onClick={e => { e.stopPropagation(); onOpen(doc); }}
      disabled={isProc(doc.status)} className="h-7 text-[11px] px-2 font-medium">
      {isProc(doc.status) ? <><Clock size={11} className="animate-spin mr-1" />Proc.</> :
       isVerified(doc.status) ? <><Eye size={11} className="mr-1" />View</> :
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
      className="h-7 w-7 text-muted-foreground hover:text-rose-600" title="Delete">
      <Trash2 size={11} />
    </Button>
  </>
);