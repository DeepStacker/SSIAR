import { exportToCsv } from '@/lib/utils';
import { DataQualitySkeleton, DonutChart, escalationBadgeColors, escalationLabels, formatNumber } from './components';
import type { DataQualityData } from '@/api';
import { Button } from '@/components/ui/button';

interface Props {
  dataQuality: DataQualityData | null;
  tabLoading: boolean;
}

export function DataQualitySection({ dataQuality, tabLoading }: Props) {
  if (tabLoading) return <DataQualitySkeleton />;
  if (!dataQuality) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-muted-foreground">
        <span className="text-4xl opacity-30">🔍</span>
        <p className="text-sm font-medium">No data quality information available</p>
        <p className="text-xs">Quality audit results will appear after OCR processing and validation checks complete.</p>
      </div>
    );
  }

  const issueCount = dataQuality.documents_with_issues ?? 0;
  const totalDocs = dataQuality.total_documents ?? 0;
  const cleanCount = totalDocs - issueCount;
  const issuePct = totalDocs > 0 ? Math.round((issueCount / totalDocs) * 100) : 0;
  const cleanPct = totalDocs > 0 ? Math.round((cleanCount / totalDocs) * 100) : 0;
  const hasIssues = dataQuality.issues && dataQuality.issues.length > 0;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">OCR Data Quality Audit</h2>
        <Button variant="outline" size="sm" onClick={() => {
          if (!dataQuality || !dataQuality.issues) return;
          const headers = ['File', 'Escalation', 'Field', 'Value', 'Reason'];
          const rows: string[][] = [];
          dataQuality.issues.forEach((doc: any) => {
            (doc.issues || []).forEach((iss: any) => {
              rows.push([doc.filename, doc.escalation_level || '', iss.field, iss.value, iss.reason]);
            });
          });
          exportToCsv(headers, rows, 'data_quality_issues.csv');
        }} className="text-xs">
          Export CSV
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
        Documents whose OCR output fails basic validation — long digit strings, repetitive patterns, fields exceeding expected lengths. These need human review before verification.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground">Documents with Issues</span>
              <h3 className="text-3xl font-semibold tracking-tight mt-2">{formatNumber(issueCount)}</h3>
            </div>
            <DonutChart
              percentage={issuePct}
              size={70}
              strokeWidth={6}
              color="var(--accent-rose)"
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <span className="text-sm text-muted-foreground">Needs Review</span>
          <h3 className="text-3xl font-semibold tracking-tight mt-2">{formatNumber(dataQuality.needs_review)}</h3>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground">Clean Documents</span>
              <h3 className="text-3xl font-semibold tracking-tight mt-2">
                {totalDocs > 0 ? formatNumber(cleanCount) : '—'}
              </h3>
            </div>
            <DonutChart
              percentage={cleanPct}
              size={70}
              strokeWidth={6}
              color="var(--accent-emerald)"
            />
          </div>
        </div>
      </div>

      {hasIssues ? (
        <div className="flex flex-col gap-3">
          {dataQuality.issues.map((doc: any, i: number) => (
            <div key={i}
                className="bg-card border border-border rounded-lg p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${escalationBadgeColors[doc.escalation_level] || 'bg-secondary text-muted-foreground border-border'}`}>
                        {escalationLabels[doc.escalation_level] || doc.escalation_level}
                      </span>
                      <span className="text-xs text-muted-foreground">{doc.filename}</span>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {doc.issues.map((iss: any, j: number) => (
                        <div key={j} className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{iss.field}</span>:{' '}
                          <code className="text-xs">{iss.value}</code>
                          <span className="text-destructive ml-1.5">— {iss.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <span className="text-3xl opacity-30">-</span>
          <p className="text-sm font-medium">No data quality issues detected</p>
          <p className="text-xs">All processed documents passed validation checks.</p>
        </div>
      )}
    </div>
  );
}
