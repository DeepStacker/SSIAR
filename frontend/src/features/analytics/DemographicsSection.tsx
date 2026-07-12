import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { exportToCsv } from '@/lib/utils';
import { DemographicsSkeleton } from './components';
import type { DemographicsData, QuestionnaireData } from '@/api';

interface Props {
  demographics: DemographicsData | null;
  questionnaire: QuestionnaireData | null;
  tabLoading: boolean;
}

const COLORS = ['var(--accent-violet)', 'var(--accent-cyan)', 'var(--accent-rose)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)', 'var(--accent-cyan)'];

export function DemographicsSection({ demographics, questionnaire, tabLoading }: Props) {
  if (tabLoading) return <DemographicsSkeleton />;
  if (!demographics) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
        No data available for this section.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Student Cohort Demographics</h2>
        <button onClick={() => {
          if (!demographics) return;
          const headers = ['Class', 'Count'];
          const rows = (demographics.class_distribution || []).map((d: any) => [d.class, String(d.count)]);
          rows.push([]);
          rows.push(['Gender', 'Count']);
          (demographics.gender_distribution || []).forEach((d: any) => rows.push([d.gender, String(d.count)]));
          rows.push([]);
          rows.push(['Age', 'Count']);
          (demographics.age_distribution || []).forEach((d: any) => rows.push([d.age.replace(' Years',''), String(d.count)]));
          exportToCsv(headers, rows, 'demographics.csv');
        }} className="text-xs font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card size="sm">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Cohort Distribution by Class Grade</h3>
            <div className="h-[230px] w-full">
              {demographics.class_distribution && demographics.class_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demographics.class_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="class" stroke="var(--text-muted)" fontSize={11} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                    <Bar dataKey="count" fill="var(--accent-violet)" radius={[4, 4, 0, 0]} name="Students" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No class data available.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Cohort Distribution by Gender</h3>
            <div className="h-[230px] w-full flex items-center justify-center">
              {demographics.gender_distribution && demographics.gender_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={demographics.gender_distribution}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={80}
                      paddingAngle={5} dataKey="count" nameKey="gender"
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {demographics.gender_distribution.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No gender data available.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card size="sm">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Age Distribution</h3>
            <div className="h-[230px] w-full">
              {demographics.age_distribution && demographics.age_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demographics.age_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="age" stroke="var(--text-muted)" fontSize={11} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                    <Bar dataKey="count" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} name="Students" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No age data available.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="lg:col-span-2">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-[var(--text-secondary)]">Cohort Research Summary Matrix</h3>
              <button onClick={() => {
                if (!questionnaire || !questionnaire.cohort_summary) return;
                const headers = ['Class', 'Cohort Size', 'Consent Rate (%)', 'Mean SDQ Total Difficulties', 'Mean Prosocial', 'Mean Math', 'Mean Science', 'Mean Language'];
                const rows = questionnaire.cohort_summary.map((r: any) => [
                  r.class, String(r.cohort_size), `${r.consent_rate}%`, String(r.mean_sdq_difficulties),
                  String(r.mean_prosocial), `${r.mean_math}%`, `${r.mean_science}%`, `${r.mean_language}%`
                ]);
                exportToCsv(headers, rows, 'cohort_research_summary.csv');
              }} className="text-[10px] font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
                Export Matrix CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Class</TableHead>
                    <TableHead className="text-xs text-center">Cohort Size</TableHead>
                    <TableHead className="text-xs text-center">Consent Rate</TableHead>
                    <TableHead className="text-xs text-center">Mean SDQ Score</TableHead>
                    <TableHead className="text-xs text-center">Mean Prosocial</TableHead>
                    <TableHead className="text-xs text-center">Mean Math</TableHead>
                    <TableHead className="text-xs text-center">Mean Science</TableHead>
                    <TableHead className="text-xs text-center">Mean Language</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionnaire && questionnaire.cohort_summary && questionnaire.cohort_summary.length > 0 ? (
                    questionnaire.cohort_summary.map((row: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold text-xs">Class {row.class}</TableCell>
                        <TableCell className="text-center text-xs">{row.cohort_size}</TableCell>
                        <TableCell className="text-center text-xs">{row.consent_rate}%</TableCell>
                        <TableCell className="text-center text-xs font-semibold text-[var(--accent-violet)]">{row.mean_sdq_difficulties}</TableCell>
                        <TableCell className="text-center text-xs font-semibold text-[var(--accent-emerald)]">{row.mean_prosocial}</TableCell>
                        <TableCell className="text-center text-xs">{row.mean_math}%</TableCell>
                        <TableCell className="text-center text-xs">{row.mean_science}%</TableCell>
                        <TableCell className="text-center text-xs">{row.mean_language}%</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-xs text-[var(--text-muted)] py-4">No cohort summary data available.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
