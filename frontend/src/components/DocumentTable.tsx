import React from 'react';
import { Search, Clock, AlertTriangle, Check, X, Eye, Download, RotateCcw, Trash2, ChevronUp, Loader2 } from 'lucide-react';
import { Document, TabType, SortKey } from '../api';
import { BulkActionBar } from './BulkActionBar';

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
}

export const DocumentTable: React.FC<Props> = ({
  documents, activeTab, onTabChange, searchQuery, onSearchChange,
  sortKey, sortDir, onSortChange, selectedIds, onToggleSelect, onToggleSelectAll,
  onOpenDoc, onDownloadReport, onReprocess, onDelete, onBulkDone,
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

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'All', icon: null, count: documents.length },
    { key: 'processing', label: 'Processing', icon: <Clock size={12} />, count: processing.length },
    { key: 'needs_review', label: 'Review', icon: <AlertTriangle size={12} />, count: needsReview.length },
    { key: 'verified', label: 'Verified', icon: <Check size={12} />, count: verified.length },
    { key: 'failed', label: 'Failed', icon: <X size={12} />, count: failed.length },
  ];

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0', alignItems: 'center' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)}
            className={`tab-btn ${activeTab === tab.key ? 'tab-active' : ''}`}>
            {tab.icon} {tab.label} ({tab.count})
          </button>
        ))}
        <div style={{ marginLeft: 'auto', position: 'relative', width: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search..." className="form-input" style={{ width: '100%', paddingLeft: '28px', fontSize: '12px' }}
            value={searchQuery} onChange={e => onSearchChange(e.target.value)} />
        </div>
      </div>

      <BulkActionBar selectedCount={selectedIds.size} docIds={Array.from(selectedIds)} onDone={onBulkDone} />

      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {searchQuery ? 'No matching documents' :
             activeTab === 'processing' ? 'No documents currently processing' :
             activeTab === 'needs_review' ? 'No documents need review' :
             activeTab === 'verified' ? 'No verified documents' :
             activeTab === 'failed' ? 'No failed documents' :
             'No documents. Upload PDFs to get started.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '32px' }}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={onToggleSelectAll} style={{ accentColor: 'var(--accent-violet)' }} />
                </th>
                <SortTh label="Filename" sortKey="filename" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Roll Number" sortKey="roll_number" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <th>Class</th>
                <SortTh label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={onSortChange} />
                <SortTh label="Date" sortKey="created_at" current={sortKey} dir={sortDir} onSort={onSortChange} right />
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id} onClick={() => onOpenDoc(doc)}
                  style={{ cursor: 'pointer', opacity: doc.status === 'processing' ? 0.7 : 1 }}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(doc.id)}
                      onChange={() => onToggleSelect(doc.id)} style={{ accentColor: 'var(--accent-violet)' }} />
                  </td>
                  <td style={{ fontWeight: '500', fontSize: '13px' }}>{doc.filename}</td>
                  <td>{doc.roll_number || '—'}</td>
                  <td>{doc.class || '—'}</td>
                  <td>
                    {doc.status === 'processing' ? (
                      <span className="badge badge-processing"><Loader2 size={10} className="animate-spin" /> Processing</span>
                    ) : (
                      <span className={`badge badge-${doc.status}`}>
                        {doc.status === 'needs_review' ? 'Needs Review' :
                         doc.status === 'verified' ? 'Verified' :
                         doc.status === 'failed' ? 'Failed' : doc.status}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>{doc.created_at?.slice(0, 10)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <ActionBtn doc={doc} onOpen={onOpenDoc} onDownload={onDownloadReport} onReprocess={onReprocess} onDelete={onDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const SortTh: React.FC<{ label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; right?: boolean }> = ({ label, sortKey, current, dir, onSort, right }) => (
  <th onClick={() => onSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', textAlign: right ? 'right' : 'left' }}>
    {label} {current === sortKey && <ChevronUp size={12} style={{ transform: dir === 'desc' ? 'rotate(180deg)' : 'none', verticalAlign: 'middle' }} />}
  </th>
);

const ActionBtn: React.FC<{ doc: Document; onOpen: (d: Document) => void; onDownload: (d: Document) => void; onReprocess: (d: Document) => void; onDelete: (d: Document) => void }> = ({ doc, onOpen, onDownload, onReprocess, onDelete }) => (
  <>
    <button onClick={e => { e.stopPropagation(); onOpen(doc); }}
      className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px', opacity: doc.status === 'processing' ? 0.6 : 1 }} disabled={doc.status === 'processing'}>
      {doc.status === 'processing' ? <><Clock size={12} /> Processing</> :
       doc.status === 'verified' ? <><Eye size={12} /> View</> :
       doc.status === 'failed' ? <>Details</> : 'Review'}
    </button>
    {(doc.status === 'needs_review' || doc.status === 'verified' || doc.status === 'failed') && (
      <button onClick={e => { e.stopPropagation(); onDownload(doc); }}
        className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px', marginLeft: '4px' }} title="Download report">
        <Download size={12} />
      </button>
    )}
    {(doc.status === 'failed' || doc.status === 'needs_review') && (
      <button onClick={e => { e.stopPropagation(); onReprocess(doc); }}
        className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px', marginLeft: '4px' }} title="Reprocess">
        <RotateCcw size={12} />
      </button>
    )}
    <button onClick={e => { e.stopPropagation(); onDelete(doc); }}
      className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px', marginLeft: '4px', color: '#f43f5e' }} title="Delete">
      <Trash2 size={12} />
    </button>
  </>
);
