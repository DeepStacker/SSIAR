import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { exportToCsv } from '@/lib/utils';
import { DemographicsSkeleton, formatNumber } from './components';
import { VerticalBarChart, DonutPieChart } from './charts';
import type { DemographicsData, QuestionnaireData } from '@/api';

interface Props {
  demographics: DemographicsData | null;
  questionnaire: QuestionnaireData | null;
  tabLoading: boolean;
}

export function DemographicsSection({ demographics, questionnaire, tabLoading }: Props) {
  if (tabLoading) return <DemographicsSkeleton />;
  if (!demographics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-[var(--text-muted)]">
        <span className="text-4xl opacity-30">👥</span>
        <p className="text-sm font-medium">No demographics data available</p>
        <p className="text-xs">Student cohort data will appear once forms are verified and demographics are extracted.</p>
      </div>
    );
  }

  const hasClassData = demographics.class_distribution && demographics.class_distribution.length > 0;
  const hasGenderData = demographics.gender_distribution && demographics.gender_distribution.length > 0;
  const hasAgeData = demographics.age_distribution && demographics.age_distribution.length > 0;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Student Cohort Demographics</h2>
        <Button variant="outline" size="xs" onClick={() => {
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
        }}>
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card size="sm">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Cohort Distribution by Class Grade</h3>
            <div className="h-[230px] w-full">
              {hasClassData ? (
                <VerticalBarChart
                  data={demographics.class_distribution}
                  dataKey="count" nameKey="class"
                  barColor="var(--accent-violet)"
                  yLabel="Students"
                  xLabel="Class"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                  No class data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Cohort Distribution by Gender</h3>
            <div className="h-[230px] w-full flex items-center justify-center">
              {hasGenderData ? (
                <DonutPieChart
                  data={demographics.gender_distribution}
                  dataKey="count" nameKey="gender"
                  innerRadius={60} outerRadius={80}
                />
              ) : (
                <div className="text-[var(--text-muted)] text-sm">No gender data available</div>
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
              {hasAgeData ? (
                <VerticalBarChart
                  data={demographics.age_distribution}
                  dataKey="count" nameKey="age"
                  barColor="var(--accent-cyan)"
                  yLabel="Students"
                  xLabel="Age Group"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                  No age data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="lg:col-span-2">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-[var(--text-secondary)]">Cohort Research Summary Matrix</h3>
              <Button variant="outline" size="xs" onClick={() => {
                if (!questionnaire || !questionnaire.cohort_summary) return;
                const headers = ['Class', 'Cohort Size', 'Consent Rate (%)', 'Mean SDQ Total Difficulties', 'Mean Prosocial', 'Mean Math', 'Mean Science', 'Mean Language'];
                const rows = questionnaire.cohort_summary.map((r: any) => [
                  r.class, formatNumber(r.cohort_size), `${r.consent_rate}%`, String(r.mean_sdq_difficulties),
                  String(r.mean_prosocial), `${r.mean_math}%`, `${r.mean_science}%`, `${r.mean_language}%`
                ]);
                exportToCsv(headers, rows, 'cohort_research_summary.csv');
              }}>
                Export Matrix CSV
              </Button>
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
                        <TableCell className="text-center text-xs">{formatNumber(row.cohort_size)}</TableCell>
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
                      <TableCell colSpan={8} className="text-center text-xs text-[var(--text-muted)] py-6">
                        No cohort summary data available
                      </TableCell>
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
