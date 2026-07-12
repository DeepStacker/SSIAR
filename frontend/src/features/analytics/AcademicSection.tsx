import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell
} from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { exportToCsv } from '@/lib/utils';
import { AcademicSkeleton, ScoreBand } from './components';
import type { AcademicData, QuestionnaireData } from '@/api';

interface Props {
  academic: AcademicData | null;
  questionnaire: QuestionnaireData | null;
  tabLoading: boolean;
}

const COLORS = ['var(--accent-violet)', 'var(--accent-cyan)', 'var(--accent-rose)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)', 'var(--accent-cyan)'];

export function AcademicSection({ academic, questionnaire, tabLoading }: Props) {
  if (tabLoading) return <AcademicSkeleton />;
  if (!academic) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
        No data available for this section.
      </div>
    );
  }

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
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={
                Object.keys(academic.averages || {}).map(k => ({
                  subject: k,
                  score: academic.averages[k]
                }))
              }>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="subject" stroke="var(--text-muted)" fontSize={11} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--text-secondary)" fontSize={10} />
                <Radar name="Class Average" dataKey="score" stroke="var(--accent-violet)" fill="var(--accent-violet)" fillOpacity={0.3}
                  label={{ position: 'outside', fill: 'var(--text-primary)', fontSize: 11, formatter: (v: any) => `${v}%` }}
                />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card size="sm" className="flex-1">
            <CardContent>
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Subject Comparison (All Classes)</h3>
              {academic.class_averages && academic.class_averages.length > 0 ? (
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(['Mathematics', 'Science', 'Language'] as const).filter(s => academic.class_averages[0][s] !== undefined).map(subject => {
                        const vals = academic.class_averages.map((r: any) => r[subject]).filter((v: number) => v != null);
                        return {
                          subject,
                          average: vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
                        };
                      })}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="subject" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} formatter={(v) => `${v}%`} />
                      <Bar dataKey="average" radius={[4,4,0,0]} name="Class Average">
                        {(['Mathematics', 'Science', 'Language'] as const).filter(s => academic.class_averages[0][s] !== undefined).map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center text-[var(--text-muted)] text-xs py-8">No class averages data available.</div>
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
                    cat, `${d.math}%`, `${d.science}%`, `${d.language}%`, String(d.student_count)
                  ]);
                  exportToCsv(headers, rows, 'academic_performance_by_sdq.csv');
                }} className="text-[10px] font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
                  Export CSV
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                Observing student academic averages grouped by SDQ clinical bands helps trace the impact of behavioral difficulties on educational outcomes.
              </p>
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
                  {questionnaire && questionnaire.academic_impact && Object.keys(questionnaire.academic_impact).length > 0 ? (
                    Object.entries(questionnaire.academic_impact).map(([cat, d]: [string, any]) => (
                      <TableRow key={cat}>
                        <TableCell className="font-semibold text-xs">{cat}</TableCell>
                        <TableCell className="text-center text-xs"><ScoreBand value={d.math} /></TableCell>
                        <TableCell className="text-center text-xs"><ScoreBand value={d.science} /></TableCell>
                        <TableCell className="text-center text-xs"><ScoreBand value={d.language} /></TableCell>
                        <TableCell className="text-center text-xs font-bold">{d.student_count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-[var(--text-muted)] py-4">No data available.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card size="sm">
        <CardContent>
          <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Class-wise Academic Averages</h3>
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
              {academic.class_averages && academic.class_averages.map((row: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-bold">Class {row.class}</TableCell>
                  <TableCell><ScoreBand value={row.Mathematics || 0} /></TableCell>
                  <TableCell><ScoreBand value={row.Science || 0} /></TableCell>
                  <TableCell><ScoreBand value={row.Language || 0} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
