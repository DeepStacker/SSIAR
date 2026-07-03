import React from 'react';
import { Download } from 'lucide-react';
import { Document, ReportFormat } from '../api';
import { api } from '../api';

interface Props {
  documents: Document[];
  dateFrom: string;
  dateTo: string;
  reportStatus: string;
  reportClass: string;
  reportFormat: ReportFormat;
  selectedReportDocs: Set<string>;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onClassChange: (v: string) => void;
  onFormatChange: (v: ReportFormat) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenDoc: (doc: Document) => void;
}

export const ReportingView: React.FC<Props> = ({
  documents, dateFrom, dateTo, reportStatus, reportClass, reportFormat, selectedReportDocs,
  onDateFromChange, onDateToChange, onStatusChange, onClassChange, onFormatChange,
  onToggleSelect, onToggleSelectAll, onOpenDoc,
}) => {
  const reportResults = documents.filter(d => {
    if (reportStatus && d.status !== reportStatus) return false;
    if (reportClass && d.class !== reportClass) return false;
    if (dateFrom && d.created_at && d.created_at.slice(0, 10) < dateFrom) return false;
    if (dateTo && d.created_at && d.created_at.slice(0, 10) > dateTo) return false;
    return true;
  });

  const getExportLink = (fmt: ReportFormat, lang?: string, docIds?: string) =>
    api.getExportUrl({
      format: fmt,
      lang: lang as any,
      status: reportStatus || undefined,
      class: reportClass || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      doc_ids: docIds,
    });

  return (
    <>
      <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
          <Download size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Reporting & Export
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Date From</label>
            <input type="date" className="form-input" style={{ fontSize: '12px', padding: '6px 10px', width: '150px' }}
              value={dateFrom} onChange={e => onDateFromChange(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Date To</label>
            <input type="date" className="form-input" style={{ fontSize: '12px', padding: '6px 10px', width: '150px' }}
              value={dateTo} onChange={e => onDateToChange(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Status</label>
            <select className="form-input" style={{ fontSize: '12px', padding: '6px 10px', width: '120px' }}
              value={reportStatus} onChange={e => onStatusChange(e.target.value)}>
              <option value="">All</option>
              <option value="processing">Processing</option>
              <option value="needs_review">Needs Review</option>
              <option value="verified">Verified</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Class</label>
            <input type="text" className="form-input" style={{ fontSize: '12px', padding: '6px 10px', width: '100px' }}
              value={reportClass} onChange={e => onClassChange(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Format</label>
            <select className="form-input" style={{ fontSize: '12px', padding: '6px 10px', width: '100px' }}
              value={reportFormat} onChange={e => onFormatChange(e.target.value as ReportFormat)}>
              <option value="excel">Excel</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
          <a href={getExportLink(reportFormat)} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '13px' }}>
            <Download size={14} /> Generate {reportFormat.toUpperCase()}
          </a>
          <a href={getExportLink('excel')} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            Excel
          </a>
          <a href={getExportLink('csv')} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            CSV
          </a>
          <a href={getExportLink('excel', 'hi')} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            निर्यात
          </a>
          {selectedReportDocs.size > 0 && (
            <a href={getExportLink(reportFormat, undefined, Array.from(selectedReportDocs).join(','))} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
              <Download size={14} /> Selected ({selectedReportDocs.size})
            </a>
          )}
        </div>
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={reportResults.length > 0 && selectedReportDocs.size === reportResults.length}
            onChange={onToggleSelectAll} style={{ accentColor: 'var(--accent-violet)' }} />
          Matching Documents ({reportResults.length})
        </div>
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {reportResults.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No documents match the selected filters.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '30px' }}></th>
                  <th>Filename</th>
                  <th>Roll Number</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {reportResults.map(doc => (
                  <tr key={doc.id}
                    style={{ cursor: 'pointer', background: selectedReportDocs.has(doc.id) ? 'rgba(139,92,246,0.08)' : undefined }}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedReportDocs.has(doc.id)}
                        onChange={() => onToggleSelect(doc.id)} style={{ accentColor: 'var(--accent-violet)' }} />
                    </td>
                    <td onClick={() => onOpenDoc(doc)} style={{ fontWeight: '500', fontSize: '13px' }}>{doc.filename}</td>
                    <td onClick={() => onOpenDoc(doc)}>{doc.roll_number || '—'}</td>
                    <td onClick={() => onOpenDoc(doc)}>{doc.class || '—'}</td>
                    <td onClick={() => onOpenDoc(doc)}><span className={`badge badge-${doc.status}`}>
                      {doc.status === 'needs_review' ? 'Needs Review' :
                       doc.status === 'verified' ? 'Verified' :
                       doc.status === 'failed' ? 'Failed' : doc.status}
                    </span></td>
                    <td onClick={() => onOpenDoc(doc)} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{doc.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
};
