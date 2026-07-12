import { Card, CardContent } from "@/components/ui/card";
import { exportToCsv } from '@/lib/utils';
import { DataQualitySkeleton, DonutChart, escalationBadgeColors, escalationLabels } from './components';
import type { DataQualityData } from '@/api';

interface Props {
  dataQuality: DataQualityData | null;
  tabLoading: boolean;
}

export function DataQualitySection({ dataQuality, tabLoading }: Props) {
  if (tabLoading) return <DataQualitySkeleton />;
  if (!dataQuality) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
        No data available for this section.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">OCR Data Quality Audit</h2>
        <button onClick={() => {
          if (!dataQuality || !dataQuality.issues) return;
          const headers = ['File', 'Escalation', 'Field', 'Value', 'Reason'];
          const rows: string[][] = [];
          dataQuality.issues.forEach((doc: any) => {
            (doc.issues || []).forEach((iss: any) => {
              rows.push([doc.filename, doc.escalation_level || '', iss.field, iss.value, iss.reason]);
            });
          });
          exportToCsv(headers, rows, 'data_quality_issues.csv');
        }} className="text-xs font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
          Export CSV
        </button>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
        Documents whose OCR output fails basic validation — long digit strings, repetitive patterns, fields exceeding expected lengths. These need human review before verification.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card size="sm">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Documents with Issues</span>
                <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{dataQuality.documents_with_issues}</h3>
              </div>
              <DonutChart
                percentage={
                  dataQuality.total_documents && dataQuality.total_documents > 0
                    ? Math.round((dataQuality.documents_with_issues / dataQuality.total_documents) * 100)
                    : 0
                }
                size={70}
                strokeWidth={6}
                color="var(--accent-rose)"
              />
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Needs Review</span>
            <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{dataQuality.needs_review}</h3>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Clean Documents</span>
                <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">
                  {dataQuality.total_documents != null
                    ? dataQuality.total_documents - dataQuality.documents_with_issues
                    : '—'}
                </h3>
              </div>
              <DonutChart
                percentage={
                  dataQuality.total_documents && dataQuality.total_documents > 0
                    ? Math.round(((dataQuality.total_documents - dataQuality.documents_with_issues) / dataQuality.total_documents) * 100)
                    : 0
                }
                size={70}
                strokeWidth={6}
                color="var(--accent-emerald)"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {dataQuality.issues && dataQuality.issues.length > 0 ? (
        <div className="flex flex-col gap-3">
          {dataQuality.issues.map((doc: any, i: number) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${escalationBadgeColors[doc.escalation_level] || 'bg-[var(--bg-highlight)] text-[var(--text-secondary)] border-[var(--color-border)]'}`}>
                    {escalationLabels[doc.escalation_level] || doc.escalation_level}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{doc.filename}</span>
                </div>
                <div className="mt-1.5 flex flex-col gap-1">
                  {doc.issues.map((iss: any, j: number) => (
                    <div key={j} className="text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--accent-amber)]">{iss.field}</span>:{' '}
                      <code className="text-xs text-[var(--text-muted)]">{iss.value}</code>
                      <span className="text-[var(--accent-rose)] ml-1.5">— {iss.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-12 text-[var(--text-muted)]">
          No data quality issues detected.
        </div>
      )}
    </div>
  );
}
