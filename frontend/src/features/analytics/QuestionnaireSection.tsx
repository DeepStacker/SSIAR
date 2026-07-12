import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { exportToCsv } from '@/lib/utils';
import { SdgSkeleton, formatNumber } from './components';
import { VerticalBarChart, DonutPieChart } from './charts';
import type { QuestionnaireData } from '@/api';

interface Props {
  questionnaire: QuestionnaireData | null;
  tabLoading: boolean;
}

export function QuestionnaireSection({ questionnaire, tabLoading }: Props) {
  if (tabLoading) return <SdgSkeleton />;
  if (!questionnaire) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-[var(--text-muted)]">
        <span className="text-4xl opacity-30">📋</span>
        <p className="text-sm font-medium">No questionnaire data available</p>
        <p className="text-xs">SDQ response data will appear once form submissions are verified and scored.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">SDQ Response Item Analysis</h2>
        <button onClick={() => {
          if (!questionnaire) return;
          const headers = ['Question', 'Domain', 'Not True', 'Somewhat True', 'Certainly True', 'Total'];
          const rows = (questionnaire.questions || []).map((q: any) => [
            q.question_id.toUpperCase(), q.domain,
            String(q.not_true), String(q.somewhat_true), String(q.certainly_true), String(q.total)
          ]);
          exportToCsv(headers, rows, 'sdq_questionnaire.csv');
        }} className="text-xs font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card size="sm" className="lg:col-span-1">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-[var(--text-secondary)]">Clinical SDQ Categories</h3>
              <button onClick={() => {
                if (!questionnaire || !questionnaire.clinical_distribution) return;
                const headers = ['Category', 'Student Count', 'Percentage (%)'];
                const rows = questionnaire.clinical_distribution.map((c: any) => [c.category, formatNumber(c.count), `${c.percentage}%`]);
                exportToCsv(headers, rows, 'clinical_sdq_distribution.csv');
              }} className="text-[10px] font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
                Export CSV
              </button>
            </div>
            <div className="h-[200px] w-full">
              {questionnaire.clinical_distribution && questionnaire.clinical_distribution.length > 0 ? (
                <DonutPieChart
                  data={questionnaire.clinical_distribution}
                  dataKey="count" nameKey="category"
                  innerRadius={50} outerRadius={70}
                  colors={['var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)']}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No clinical data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="lg:col-span-2">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">SDQ Clinical Reference Table</h3>
            {questionnaire.clinical_distribution && questionnaire.clinical_distribution.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-center">Score Range</TableHead>
                    <TableHead className="text-xs text-center">Student Count</TableHead>
                    <TableHead className="text-xs text-center">Cohort Percentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionnaire.clinical_distribution.map((row: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-semibold text-xs flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: idx === 0 ? 'var(--accent-emerald)' : idx === 1 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
                        {row.category.split(' ')[0]}
                      </TableCell>
                      <TableCell className="text-center text-xs font-mono">{row.category.split(' ').pop()}</TableCell>
                      <TableCell className="text-center text-xs font-bold">{formatNumber(row.count)}</TableCell>
                      <TableCell className="text-center text-xs font-bold text-[var(--accent-violet)]">{row.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex items-center justify-center h-[120px] text-[var(--text-muted)] text-sm">No clinical distribution data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {questionnaire.domain_scores && Object.keys(questionnaire.domain_scores).length > 0 && (
        <Card size="sm">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Domain Mean Scores Comparison</h3>
            <VerticalBarChart
              data={Object.keys(questionnaire.domain_scores).map(k => ({
                domain: k,
                mean: questionnaire.domain_scores[k].mean
              }))}
              dataKey="mean" nameKey="domain"
              domain={[0, 10]} height={250}
              yLabel="Mean Score"
              xLabel="Domain"
              colorMap={(_d, idx) => {
                const colors = ['var(--accent-violet)', 'var(--accent-cyan)', 'var(--accent-rose)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)', 'var(--accent-cyan)'];
                return colors[idx % colors.length];
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardContent>
          <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Individual Question Distributions</h3>
          {questionnaire.questions && questionnaire.questions.length > 0 ? (
            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
              {questionnaire.questions.map((q: any, i: number) => {
                const total = q.total || 1;
                const pct1 = ((q.not_true / total) * 100).toFixed(0);
                const pct2 = ((q.somewhat_true / total) * 100).toFixed(0);
                const pct3 = ((q.certainly_true / total) * 100).toFixed(0);
                return (
                  <div key={i} className="p-4 rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] animate-chart-enter" style={{ animationDelay: `${i * 30}ms` }}>
                    <div>
                      <div className="flex justify-between text-xs font-bold text-[var(--text-muted)] mb-1.5">
                        <span>Question {q.question_id.toUpperCase()} ({q.domain} Domain)</span>
                      </div>
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{q.text}</h4>
                      <span className="text-xs italic text-[var(--text-muted)] mt-0.5">{q.text_hi}</span>
                    </div>
                    <div className="flex h-4 rounded-full overflow-hidden bg-[var(--bg-primary)] text-[10px] text-white font-bold text-center my-3 mb-2">
                      <div style={{ width: `${pct1}%`, background: 'var(--accent-violet)' }} className="flex items-center justify-center transition-all duration-300" title={`Not True: ${formatNumber(q.not_true)}`}>
                        {q.not_true > 0 && `${pct1}%`}
                      </div>
                      <div style={{ width: `${pct2}%`, background: 'var(--accent-cyan)' }} className="flex items-center justify-center transition-all duration-300" title={`Somewhat True: ${formatNumber(q.somewhat_true)}`}>
                        {q.somewhat_true > 0 && `${pct2}%`}
                      </div>
                      <div style={{ width: `${pct3}%`, background: 'var(--accent-rose)' }} className="flex items-center justify-center transition-all duration-300" title={`Certainly True: ${formatNumber(q.certainly_true)}`}>
                        {q.certainly_true > 0 && `${pct3}%`}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-violet)' }} /> Not True: {formatNumber(q.not_true)}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-cyan)' }} /> Somewhat: {formatNumber(q.somewhat_true)}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-rose)' }} /> Certainly: {formatNumber(q.certainly_true)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-[var(--text-muted)] text-sm">
              No individual question data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
