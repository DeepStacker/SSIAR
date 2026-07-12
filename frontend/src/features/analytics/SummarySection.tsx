import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { exportToCsv } from '@/lib/utils';
import { DonutChart, Sparkline, TrendBadge, ExecutiveSkeleton } from './components';
import type { SummaryData, ProcessingData, FieldConfData, QueueStatus } from '@/api';

interface Props {
  summary: SummaryData | null;
  processing: ProcessingData | null;
  fieldConf: FieldConfData | null;
  queueStatus: QueueStatus | null;
  tabLoading: boolean;
  classFilter: string;
  genderFilter: string;
}

const COLORS = ['var(--accent-violet)', 'var(--accent-cyan)', 'var(--accent-rose)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)', 'var(--accent-cyan)'];

export function SummarySection({ summary, processing, fieldConf, queueStatus, tabLoading }: Props) {
  if (tabLoading) return <ExecutiveSkeleton />;
  if (!summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
        No data available for this section.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <span>📊 {summary.total_forms} total forms processed</span>
        <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
        <span>{summary.average_confidence != null ? Number(summary.average_confidence).toFixed(1) : '—'}% avg confidence</span>
        <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
        <span>{summary.data_completeness}% complete</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Platform Summary Metrics</h2>
        <button onClick={() => {
          if (!summary) return;
          const headers = ['Metric', 'Value'];
          const rows = [
            ['Total Forms', String(summary.total_forms)],
            ['Verified', String(summary.verified_forms)],
            ['Avg Confidence', `${summary.average_confidence}%`],
            ['Completeness', `${summary.data_completeness}%`],
            ['Processed Today', String(summary.processed_today)],
            ...(summary.pending_review != null ? [['Pending Review', String(summary.pending_review)]] : []),
          ];
          exportToCsv(headers, rows, 'executive_summary.csv');
        }} className="text-xs font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(() => {
          const trend = summary.processing_trend;
          const vsYesterday = trend && trend.length >= 2 ? trend[trend.length - 1].count - trend[trend.length - 2].count : 0;
          return [
            { label: "Total Digits Ingested", value: summary.total_forms, vs: vsYesterday },
            { label: "Verified Submissions", value: summary.verified_forms, vs: 0 },
            { label: "OCR Average Confidence", value: `${summary.average_confidence != null ? Number(summary.average_confidence).toFixed(1) : '—'}%`, vs: 0 },
            { label: "Data Completeness Rate", value: `${summary.data_completeness}%`, vs: 0 }
          ].map((card, i) => (
            <Card key={i} size="sm">
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{card.label}</span>
                  {card.vs !== 0 && <TrendBadge value={card.vs} />}
                </div>
                <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{card.value}</h3>
              </CardContent>
            </Card>
          ));
        })()}
      </div>

      {summary.pending_review != null && (
        <Card size="sm">
          <CardContent>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Pending Review</span>
            <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{summary.pending_review}</h3>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card size="sm" className="lg:col-span-2">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Ingestion & Processing Trend (Last 14 Days)</h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.processing_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                  <Line type="monotone" dataKey="count" stroke="var(--accent-violet)" strokeWidth={2.5} activeDot={{ r: 6 }} name="Forms Processed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardContent>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Data Completeness</span>
              <div className="flex items-center justify-center mt-2">
                <DonutChart percentage={summary.data_completeness} size={110} strokeWidth={10} color="var(--accent-violet)" />
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Processed Today</span>
                <Sparkline data={summary.processing_trend} width={80} height={24} />
              </div>
              <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1">{summary.processed_today}</h3>
            </CardContent>
          </Card>
        </div>
      </div>

      {queueStatus && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <Card size="sm">
            <CardContent>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Workers</span>
              <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{queueStatus.workers}</h3>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Throughput (forms/min, {summary.throughput_window_days ?? 14}d)</span>
              <span className="text-2xl font-bold text-foreground">
                {summary.throughput_forms_per_min != null
                  ? summary.throughput_forms_per_min.toFixed(4)
                  : '—'}
              </span>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Processing Today</span>
              <h3 className="text-3xl font-extrabold text-foreground mt-1.5">{summary.processed_today}</h3>
            </CardContent>
          </Card>
        </div>
      )}

      {processing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
          <Card size="sm">
            <CardContent>
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Hourly Processing (Today)</h3>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processing.hourly_breakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="hour" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                    <Bar dataKey="count" fill="var(--accent-violet)" radius={[4,4,0,0]} name="Documents" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Escalation Level Distribution</h3>
              <div className="h-[200px] w-full flex items-center justify-center">
                {processing.escalation_distribution && processing.escalation_distribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={processing.escalation_distribution}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={70}
                        paddingAngle={4} dataKey="count" nameKey="level"
                        label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {processing.escalation_distribution.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">No escalation data</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {fieldConf && fieldConf.field_confidence && fieldConf.field_confidence.length > 0 && (
        <Card size="sm" className="mt-4">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">OCR Confidence by Field</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fieldConf.field_confidence} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" domain={[0, 100]} stroke="var(--text-muted)" fontSize={11} />
                  <YAxis type="category" dataKey="field" stroke="var(--text-muted)" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} formatter={(val) => `${val}%`} />
                  <Bar dataKey="average" fill="var(--accent-violet)" radius={[0,4,4,0]} name="Avg Confidence %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
