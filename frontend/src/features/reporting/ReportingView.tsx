import React from 'react';
import { Download, FileWarning } from 'lucide-react';
import type { Document, ReportFormat } from '@/api';
import { api } from '@/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';

interface Props {
  reportResults: Document[];
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
  reportResults, dateFrom, dateTo, reportStatus, reportClass, reportFormat, selectedReportDocs,
  onDateFromChange, onDateToChange, onStatusChange, onClassChange, onFormatChange,
  onToggleSelect, onToggleSelectAll, onOpenDoc,
}) => {
  const getExportLink = (fmt: ReportFormat, lang?: string, docIds?: string) =>
    api.getExportUrl({
      format: fmt,
      lang: lang,
      status: reportStatus || undefined,
      class: reportClass || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      doc_ids: docIds,
    });



  return (
    <>
      <Card className="mb-5">
        <CardContent className="p-5">
          <h3 className="text-base mb-4 text-muted-foreground flex items-center gap-1.5">
            <Download size={16} />
            Reporting & Export
          </h3>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label htmlFor="report-date-from" className="text-[11px] text-muted-foreground block mb-1">Date From</label>
              <input id="report-date-from" type="date"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-full sm:w-[150px] text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={dateFrom} onChange={e => onDateFromChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="report-date-to" className="text-[11px] text-muted-foreground block mb-1">Date To</label>
              <input id="report-date-to" type="date"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-full sm:w-[150px] text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={dateTo} onChange={e => onDateToChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="report-status" className="text-[11px] text-muted-foreground block mb-1">Status</label>
              <select id="report-status"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-full sm:w-[120px] text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={reportStatus} onChange={e => onStatusChange(e.target.value)}>
                <option value="">All</option>
                <option value="processing">Processing</option>
                <option value="needs_review">Needs Review</option>
                <option value="verified">Verified</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-class" className="text-[11px] text-muted-foreground block mb-1">Class</label>
              <input id="report-class" type="text"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-full sm:w-[100px] text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={reportClass} onChange={e => onClassChange(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div>
              <label htmlFor="report-format" className="text-[11px] text-muted-foreground block mb-1">Format</label>
              <select id="report-format"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs w-full sm:w-[100px] text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={reportFormat} onChange={e => onFormatChange(e.target.value as ReportFormat)}>
                <option value="excel">Excel</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
            <a href={getExportLink(reportFormat)}
              className="inline-flex shrink-0 items-center justify-center h-7 gap-1 px-3 text-[0.8rem] font-medium whitespace-nowrap rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-all select-none shadow-sm">
              <Download size={14} /> Generate {reportFormat.toUpperCase()}
            </a>
            <a href={getExportLink('excel')}
              className="inline-flex shrink-0 items-center justify-center h-7 gap-1 px-2.5 text-[0.8rem] font-medium whitespace-nowrap rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground transition-all select-none">Excel</a>
            <a href={getExportLink('csv')}
              className="inline-flex shrink-0 items-center justify-center h-7 gap-1 px-2.5 text-[0.8rem] font-medium whitespace-nowrap rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground transition-all select-none">CSV</a>
            <a href={getExportLink('excel', 'hi')}
              className="inline-flex shrink-0 items-center justify-center h-7 gap-1 px-2.5 text-[0.8rem] font-medium whitespace-nowrap rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground transition-all select-none">निर्यात</a>
            {selectedReportDocs.size > 0 && (
              <a href={getExportLink(reportFormat, undefined, Array.from(selectedReportDocs).join(','))}
                className="inline-flex shrink-0 items-center justify-center h-7 gap-1 px-3 text-[0.8rem] font-medium whitespace-nowrap rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-all select-none shadow-sm">
                <Download size={14} /> Selected ({selectedReportDocs.size})
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-sm text-muted-foreground font-semibold">
          <input type="checkbox" checked={reportResults.length > 0 && selectedReportDocs.size === reportResults.length}
            onChange={onToggleSelectAll} className="accent-primary h-4 w-4 rounded border-border" />
          Matching Documents ({reportResults.length})
        </div>
        <div className="max-h-[500px] overflow-y-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:bg-card [&_thead]:z-10">
          {reportResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <FileWarning size={20} className="text-muted-foreground/60" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">No documents match the selected filters</span>
              <span className="text-xs text-muted-foreground/60">Try adjusting your filter criteria</span>
            </div>
          ) : (
            <Table>
              <TableHeader className="[&_tr]:border-b-border/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">Filename</TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">Roll Number</TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">Class</TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-xs text-muted-foreground font-medium text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportResults.map((doc, idx) => (
                  <TableRow key={doc.id}
                    className={`cursor-pointer transition-all ${
                      selectedReportDocs.has(doc.id)
                        ? 'bg-violet-500/[0.04] hover:bg-violet-500/[0.08] border-l-2 border-l-violet-500/40'
                        : 'hover:bg-muted/50 border-l-2 border-l-transparent'
                    } ${idx % 2 === 0 && !selectedReportDocs.has(doc.id) ? 'bg-muted/15' : ''}`}>
                    <TableCell onClick={e => e.stopPropagation()} className="py-2">
                      <input type="checkbox" checked={selectedReportDocs.has(doc.id)}
                        onChange={() => onToggleSelect(doc.id)} className="accent-primary h-4 w-4 rounded border-border" />
                    </TableCell>
                    <TableCell className="font-medium text-sm py-2 max-w-[220px]" onClick={() => onOpenDoc(doc)}>
                      <span className="truncate block" title={doc.filename}>{doc.filename}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2 tabular-nums" onClick={() => onOpenDoc(doc)}>{doc.roll_number || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2 tabular-nums" onClick={() => onOpenDoc(doc)}>{doc.class || '—'}</TableCell>
                    <TableCell className="py-2" onClick={() => onOpenDoc(doc)}><StatusBadge status={doc.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2 text-right tabular-nums" onClick={() => onOpenDoc(doc)}>{doc.created_at?.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </>
  );
};
