import React from 'react';
import { Search, Clock, AlertTriangle, Check, X, Eye, Download, RotateCcw, Trash2, ChevronUp, Loader2 } from 'lucide-react';
import { Document, TabType, SortKey } from '../api';
import { BulkActionBar } from './BulkActionBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

const tabConfig: { key: TabType; label: string; icon: React.ReactNode | null }[] = [
  { key: 'all', label: 'All', icon: null },
  { key: 'processing', label: 'Processing', icon: <Clock size={12} /> },
  { key: 'needs_review', label: 'Review', icon: <AlertTriangle size={12} /> },
  { key: 'verified', label: 'Verified', icon: <Check size={12} /> },
  { key: 'failed', label: 'Failed', icon: <X size={12} /> },
];

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
  const needsReview = documents.filter(d => d.status === 'needs_review');
  const verified = documents.filter(d => d.status === 'verified');
  const processing = documents.filter(d => d.status === 'processing');
  const failed = documents.filter(d => d.status === 'failed');

  const filtered = (() => {
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
  })();

  const counts: Record<string, number> = {
    all: documents.length,
    processing: processing.length,
    needs_review: needsReview.length,
    verified: verified.length,
    failed: failed.length,
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabType)}>
          <TabsList variant="line">
            {tabConfig.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.icon} {tab.label} ({counts[tab.key]})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-[180px] shrink-0">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" placeholder="Search..." className="w-full pl-7 text-xs"
            value={searchQuery} onChange={e => onSearchChange(e.target.value)} />
        </div>
      </div>

      <BulkActionBar selectedCount={selectedIds.size} docIds={Array.from(selectedIds)} onDone={onBulkDone}
        onBulkVerify={onBulkVerify} onBulkReprocess={onBulkReprocess} onBulkDelete={onBulkDelete} />

      <div className="max-h-[500px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {searchQuery ? 'No matching documents' :
             activeTab === 'processing' ? 'No documents currently processing' :
             activeTab === 'needs_review' ? 'No documents need review' :
             activeTab === 'verified' ? 'No verified documents' :
             activeTab === 'failed' ? 'No failed documents' :
             'No documents. Upload PDFs to get started.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={onToggleSelectAll} className="accent-violet-500"
                    aria-label={selectedIds.size === filtered.length ? "Deselect all documents" : "Select all documents"} />
                </TableHead>
                <SortTh label="Filename" sortKey="filename" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Roll Number" sortKey="roll_number" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <TableHead>Class</TableHead>
                <SortTh label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Date" sortKey="created_at" current={sortKey} dir={sortDir} onSort={onSortChange} right />
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(doc => (
                <TableRow key={doc.id} onClick={() => onOpenDoc(doc)}
                  tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpenDoc(doc); }}
                  className="cursor-pointer" style={{ opacity: doc.status === 'processing' ? 0.7 : 1 }}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(doc.id)}
                      onChange={() => onToggleSelect(doc.id)} className="accent-violet-500"
                      aria-label={`Select ${doc.filename || doc.id}`} />
                  </TableCell>
                  <TableCell className="font-medium text-sm">{doc.filename}</TableCell>
                  <TableCell>{doc.roll_number || '—'}</TableCell>
                  <TableCell>{doc.class || '—'}</TableCell>
                  <TableCell>
                    {doc.status === 'processing' ? (
                      <Badge variant="outline"><Loader2 size={10} className="animate-spin" /> Processing</Badge>
                    ) : (
                      <Badge variant={
                        doc.status === 'needs_review' ? 'secondary' :
                        doc.status === 'verified' ? 'default' :
                        doc.status === 'failed' ? 'destructive' : 'outline'
                      }>
                        {doc.status === 'needs_review' ? 'Needs Review' :
                         doc.status === 'verified' ? 'Verified' :
                         doc.status === 'failed' ? 'Failed' : doc.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{doc.created_at?.slice(0, 10)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1.5">
                      <ActionBtn doc={doc} onOpen={onOpenDoc} onDownload={onDownloadReport} onReprocess={onReprocess} onDelete={onDelete} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
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
      className={`cursor-pointer select-none${right ? ' text-right' : ''}`}>
      {label} {isActive && <ChevronUp size={12} className={`inline-block align-middle${dir === 'desc' ? ' rotate-180' : ''}`} />}
    </TableHead>
  );
};

const ActionBtn: React.FC<{ doc: Document; onOpen: (d: Document) => void; onDownload: (d: Document) => void; onReprocess: (d: Document) => void; onDelete: (d: Document) => void }> = ({ doc, onOpen, onDownload, onReprocess, onDelete }) => (
  <span className="inline-flex items-center gap-1.5">
    <Button variant="default" size="xs" onClick={e => { e.stopPropagation(); onOpen(doc); }}
      disabled={doc.status === 'processing'} className={doc.status === 'processing' ? 'opacity-60' : ''}>
      {doc.status === 'processing' ? <><Clock size={12} /> Processing</> :
       doc.status === 'verified' ? <><Eye size={12} /> View</> :
       doc.status === 'failed' ? <>Details</> : 'Review'}
    </Button>
    {(doc.status === 'needs_review' || doc.status === 'verified' || doc.status === 'failed') && (
      <Button variant="outline" size="icon-xs" onClick={e => { e.stopPropagation(); onDownload(doc); }}
        title="Download report">
        <Download size={12} />
      </Button>
    )}
    {(doc.status === 'failed' || doc.status === 'needs_review') && (
      <Button variant="outline" size="icon-xs" onClick={e => { e.stopPropagation(); onReprocess(doc); }}
        title="Reprocess">
        <RotateCcw size={12} />
      </Button>
    )}
    <Button variant="outline" size="icon-xs" onClick={e => { e.stopPropagation(); onDelete(doc); }}
      className="text-rose-500" title="Delete">
      <Trash2 size={12} />
    </Button>
  </span>
);
