import { exportToCsv } from '@/lib/utils';
import { DataQualitySkeleton, DonutChart, escalationBadgeColors, escalationLabels, formatNumber } from './components';
import type { DataQualityData } from '@/api';

interface Props {
  dataQuality: DataQualityData | null;
  tabLoading: boolean;
}

const severityStyles: Record<string, { border: string; bg: string }> = {
  level_1: { border: 'border-[var(--accent-emerald)]/20', bg: 'bg-[var(--accent-emerald)]/[0.03]' },
  level_2: { border: 'border-[var(--accent-amber)]/20', bg: 'bg-[var(--accent-amber)]/[0.03]' },
  level_3: { border: 'border-[var(--accent-rose)]/20', bg: 'bg-[var(--accent-rose)]/[0.03]' },
  level_4: { border: 'border-[var(--accent-rose)]/30', bg: 'bg-[var(--accent-rose)]/[0.06]' },
};

const severityAccent: Record<string, string> = {
  level_1: 'var(--accent-emerald)',
  level_2: 'var(--accent-amber)',
  level_3: 'var(--accent-rose)',
  level_4: 'var(--accent-rose)',
};

export function DataQualitySection({ dataQuality, tabLoading }: Props) {
  if (tabLoading) return <DataQualitySkeleton />;
  if (!dataQuality) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-[var(--text-muted)]">
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
        <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: '0ms' }}>
          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-rose)]" />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Documents with Issues</span>
              <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">{formatNumber(issueCount)}</h3>
            </div>
            <DonutChart
              percentage={issuePct}
              size={70}
              strokeWidth={6}
              color="var(--accent-rose)"
            />
          </div>
        </div>
        <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: '80ms' }}>
          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-amber)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Needs Review</span>
          <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">{formatNumber(dataQuality.needs_review)}</h3>
        </div>
        <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: '160ms' }}>
          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-emerald)]" />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Clean Documents</span>
              <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">
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
          {dataQuality.issues.map((doc: any, i: number) => {
            const level = doc.escalation_level || 'level_1';
            const sev = severityStyles[level] || severityStyles.level_1;
            const accent = severityAccent[level] || 'var(--accent-emerald)';
            return (
              <div key={i}
                className={`glass-card rounded-xl p-4 animate-chart-enter relative overflow-hidden ${sev.border}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full" style={{ background: accent }} />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                          <span className="font-semibold" style={{ color: accent }}>{iss.field}</span>:{' '}
                          <code className="text-xs text-[var(--text-muted)]">{iss.value}</code>
                          <span className="text-[var(--accent-rose)] ml-1.5">— {iss.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-muted)]">
          <span className="text-3xl opacity-30">✅</span>
          <p className="text-sm font-medium">No data quality issues detected</p>
          <p className="text-xs">All processed documents passed validation checks.</p>
        </div>
      )}
    </div>
  );
}
