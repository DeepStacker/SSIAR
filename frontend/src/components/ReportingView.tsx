import React from 'react';
import { Download } from 'lucide-react';
import { Document, ReportFormat } from '../api';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      processing: { variant: "secondary", label: "Processing" },
      needs_review: { variant: "outline", label: "Needs Review" },
      verified: { variant: "default", label: "Verified" },
      failed: { variant: "destructive", label: "Failed" },
    };
    const s = map[status] || { variant: "outline" as const, label: status };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <>
      <Card className="mb-5">
        <CardContent className="p-5">
          <h3 className="text-base mb-4 text-[var(--text-secondary)] flex items-center gap-1.5">
            <Download size={16} />
            Reporting & Export
          </h3>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Date From</label>
              <input type="date" className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-[150px]"
                value={dateFrom} onChange={e => onDateFromChange(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Date To</label>
              <input type="date" className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-[150px]"
                value={dateTo} onChange={e => onDateToChange(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Status</label>
              <select className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-[120px]"
                value={reportStatus} onChange={e => onStatusChange(e.target.value)}>
                <option value="">All</option>
                <option value="processing">Processing</option>
                <option value="needs_review">Needs Review</option>
                <option value="verified">Verified</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Class</label>
              <input type="text" className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-[100px]"
                value={reportClass} onChange={e => onClassChange(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">Format</label>
              <select className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-[100px]"
                value={reportFormat} onChange={e => onFormatChange(e.target.value as ReportFormat)}>
                <option value="excel">Excel</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button variant="default" size="sm" render={<a href={getExportLink(reportFormat)} />}>
              <Download size={14} /> Generate {reportFormat.toUpperCase()}
            </Button>
            <Button variant="outline" size="sm" render={<a href={getExportLink('excel')} />}>Excel</Button>
            <Button variant="outline" size="sm" render={<a href={getExportLink('csv')} />}>CSV</Button>
            <Button variant="outline" size="sm" render={<a href={getExportLink('excel', 'hi')} />}>निर्यात</Button>
            {selectedReportDocs.size > 0 && (
              <Button variant="default" size="sm" render={<a href={getExportLink(reportFormat, undefined, Array.from(selectedReportDocs).join(','))} />}>
                <Download size={14} /> Selected ({selectedReportDocs.size})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b text-sm text-[var(--text-secondary)] font-semibold">
          <input type="checkbox" checked={reportResults.length > 0 && selectedReportDocs.size === reportResults.length}
            onChange={onToggleSelectAll} className="accent-[var(--accent-violet)]" />
          Matching Documents ({reportResults.length})
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {reportResults.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)] text-sm">No documents match the selected filters.</div>
          ) : (
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="border-b">
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[30px]"></th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Filename</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Roll Number</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Class</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Status</th>
                  <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Created</th>
                </tr>
              </thead>
              <tbody>
                {reportResults.map(doc => (
                  <tr key={doc.id} className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                    style={{ background: selectedReportDocs.has(doc.id) ? 'rgba(139,92,246,0.08)' : undefined }}>
                    <td className="p-2 align-middle" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedReportDocs.has(doc.id)}
                        onChange={() => onToggleSelect(doc.id)} className="accent-[var(--accent-violet)]" />
                    </td>
                    <td className="p-2 align-middle font-medium text-sm" onClick={() => onOpenDoc(doc)}>{doc.filename}</td>
                    <td className="p-2 align-middle" onClick={() => onOpenDoc(doc)}>{doc.roll_number || '—'}</td>
                    <td className="p-2 align-middle" onClick={() => onOpenDoc(doc)}>{doc.class || '—'}</td>
                    <td className="p-2 align-middle" onClick={() => onOpenDoc(doc)}>{statusBadge(doc.status)}</td>
                    <td className="p-2 align-middle text-xs text-[var(--text-muted)]" onClick={() => onOpenDoc(doc)}>{doc.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
};
