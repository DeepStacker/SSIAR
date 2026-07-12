import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { exportToCsv } from '@/lib/utils';
import { AcademicSkeleton, ScoreBand, formatNumber } from './components';
import { VerticalBarChart, RadarChartComponent } from './charts';
import type { AcademicData, QuestionnaireData } from '@/api';

interface Props {
  academic: AcademicData | null;
  questionnaire: QuestionnaireData | null;
  tabLoading: boolean;
}

export function AcademicSection({ academic, questionnaire, tabLoading }: Props) {
  if (tabLoading) return <AcademicSkeleton />;
  if (!academic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-[var(--text-muted)]">
        <span className="text-4xl opacity-30">🎓</span>
        <p className="text-sm font-medium">No academic performance data available</p>
        <p className="text-xs">Academic data will appear once student records are linked and scores are computed.</p>
      </div>
    );
  }

  const hasAverages = academic.averages && Object.keys(academic.averages).length > 0;
  const hasClassAverages = academic.class_averages && academic.class_averages.length > 0;
  const subjectKeys = hasClassAverages
    ? (['Mathematics', 'Science', 'Language'] as const).filter(s => academic.class_averages[0][s] !== undefined)
    : [];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Academic Subject Averages</h2>
        <button onClick={() => {
          if (!academic) return;
          const headers = ['Subject', 'Average'];
          const rows = Object.entries(academic.averages || {}).map(([k, v]) => [k, String(v ?? '')]);
          rows.push([]);
          rows.push(['Class', 'Mathematics', 'Science', 'Language']);
          (academic.class_averages || []).forEach((r: any) =>
            rows.push([r.class, String(r.Mathematics ?? ''), String(r.Science ?? ''), String(r.Language ?? '')])
          );
          exportToCsv(headers, rows, 'academic_averages.csv');
        }} className="text-xs font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card size="sm" className="h-[320px]">
          <CardContent className="h-full flex items-center justify-center">
            {hasAverages ? (
              <RadarChartComponent
                data={Object.keys(academic.averages).map(k => ({
                  subject: k,
                  score: academic.averages[k]
                }))}
                dataKey="score" nameKey="subject" height={280}
                domain={[0, 100]}
                title="Subject Performance Radar"
              />
            ) : (
              <div className="text-[var(--text-muted)] text-sm">No subject averages data available</div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card size="sm" className="flex-1">
            <CardContent>
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Subject Comparison (All Classes)</h3>
              {subjectKeys.length > 0 ? (
                <VerticalBarChart
                  data={subjectKeys.map(subject => {
                    const vals = academic.class_averages.map((r: any) => r[subject]).filter((v: number) => v != null);
                    return {
                      subject,
                      average: vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
                    };
                  })}
                  dataKey="average" nameKey="subject"
                  domain={[0, 100]} height={180}
                  yLabel="Score (%)"
                  xLabel="Subject"
                  colorMap={(_d, idx) => {
                    const colors = ['var(--accent-violet)', 'var(--accent-cyan)', 'var(--accent-rose)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)', 'var(--accent-cyan)'];
                    return colors[idx % colors.length];
                  }}
                  tooltipFormatter={(v) => `${v}%`}
                />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-[var(--text-muted)] text-xs">
                  No class averages data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-[var(--text-secondary)]">Academic Performance by SDQ Category</h3>
                <button onClick={() => {
                  if (!questionnaire || !questionnaire.academic_impact) return;
                  const headers = ['Category', 'Math Avg', 'Science Avg', 'Language Avg', 'Student Count'];
                  const rows = Object.entries(questionnaire.academic_impact).map(([cat, d]: [string, any]) => [
                    cat, `${d.math}%`, `${d.science}%`, `${d.language}%`, formatNumber(d.student_count)
                  ]);
                  exportToCsv(headers, rows, 'academic_performance_by_sdq.csv');
                }} className="text-[10px] font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
                  Export CSV
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                Observing student academic averages grouped by SDQ clinical bands helps trace the impact of behavioral difficulties on educational outcomes.
              </p>
              {questionnaire && questionnaire.academic_impact && Object.keys(questionnaire.academic_impact).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-center text-xs">Math</TableHead>
                      <TableHead className="text-center text-xs">Science</TableHead>
                      <TableHead className="text-center text-xs">Language</TableHead>
                      <TableHead className="text-center text-xs">Students</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(questionnaire.academic_impact).map(([cat, d]: [string, any]) => (
                      <TableRow key={cat}>
                        <TableCell className="font-semibold text-xs">{cat}</TableCell>
                        <TableCell className="text-center text-xs"><ScoreBand value={d.math} /></TableCell>
                        <TableCell className="text-center text-xs"><ScoreBand value={d.science} /></TableCell>
                        <TableCell className="text-center text-xs"><ScoreBand value={d.language} /></TableCell>
                        <TableCell className="text-center text-xs font-bold">{formatNumber(d.student_count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-[80px] text-[var(--text-muted)] text-xs">
                  No academic impact data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card size="sm">
        <CardContent>
          <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Class-wise Academic Averages</h3>
          {hasClassAverages ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Mathematics</TableHead>
                  <TableHead>Science</TableHead>
                  <TableHead>Language</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {academic.class_averages.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-bold">Class {row.class}</TableCell>
                    <TableCell><ScoreBand value={row.Mathematics || 0} /></TableCell>
                    <TableCell><ScoreBand value={row.Science || 0} /></TableCell>
                    <TableCell><ScoreBand value={row.Language || 0} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center h-[120px] text-[var(--text-muted)] text-sm">
              No class-wise averages available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
