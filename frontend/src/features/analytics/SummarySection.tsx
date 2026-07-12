import { Card, CardContent } from "@/components/ui/card";
import { exportToCsv } from '@/lib/utils';
import { DonutChart, Sparkline, TrendBadge, ExecutiveSkeleton, formatNumber } from './components';
import { VerticalBarChart, HorizontalBarChart, LineChartComponent, DonutPieChart } from './charts';
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

function StatCard({ label, value, trend, accent, delay = 0 }: { label: string; value: string; trend?: number; accent: string; delay?: number }) {
  return (
    <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: `${delay}ms` }}>
      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        {trend !== undefined && trend !== 0 && <TrendBadge value={trend} />}
      </div>
      <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">{value}</h3>
    </div>
  );
}

export function SummarySection({ summary, processing, fieldConf, queueStatus, tabLoading }: Props) {
  if (tabLoading) return <ExecutiveSkeleton />;
  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-[var(--text-muted)]">
        <span className="text-4xl opacity-30">📊</span>
        <p className="text-sm font-medium">No executive summary data available</p>
        <p className="text-xs">Processed data will appear here once forms are submitted and OCR extraction completes.</p>
      </div>
    );
  }

  const trend = summary.processing_trend;
  const vsYesterday = trend && trend.length >= 2
    ? trend[trend.length - 1].count - trend[trend.length - 2].count
    : 0;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <span>{formatNumber(summary.total_forms)} total forms processed</span>
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
        <StatCard
          label="Total Digits Ingested"
          value={formatNumber(summary.total_forms)}
          trend={vsYesterday}
          accent="var(--accent-violet)"
          delay={0}
        />
        <StatCard
          label="Verified Submissions"
          value={formatNumber(summary.verified_forms)}
          accent="var(--accent-emerald)"
          delay={60}
        />
        <StatCard
          label="OCR Average Confidence"
          value={`${summary.average_confidence != null ? Number(summary.average_confidence).toFixed(1) : '—'}%`}
          accent="var(--accent-cyan)"
          delay={120}
        />
        <StatCard
          label="Data Completeness Rate"
          value={`${summary.data_completeness}%`}
          accent="var(--accent-amber)"
          delay={180}
        />
      </div>

      {summary.pending_review != null && (
        <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter">
          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-rose)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Pending Review</span>
          <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">{formatNumber(summary.pending_review)}</h3>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card size="sm" className="lg:col-span-2">
          <CardContent>
            <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Ingestion & Processing Trend (Last 14 Days)</h3>
            <div className="h-[250px] w-full">
              <LineChartComponent
                data={summary.processing_trend}
                dataKey="count" nameKey="date" height={250}
                yLabel="Forms"
                xLabel="Date"
              />
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
              <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1">{formatNumber(summary.processed_today)}</h3>
            </CardContent>
          </Card>
        </div>
      </div>

      {queueStatus && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: '0ms' }}>
            <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-violet)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Workers</span>
            <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">{formatNumber(queueStatus.workers)}</h3>
          </div>
          <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: '80ms' }}>
            <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-cyan)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Throughput (forms/min, {summary.throughput_window_days ?? 14}d)</span>
            <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">
              {summary.throughput_forms_per_min != null
                ? summary.throughput_forms_per_min.toFixed(4)
                : '—'}
            </h3>
          </div>
          <div className="glass-card rounded-xl p-5 relative overflow-hidden animate-chart-enter" style={{ animationDelay: '160ms' }}>
            <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent-emerald)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Processing Today</span>
            <h3 className="text-2xl font-extrabold text-[var(--text-primary)] mt-2">{formatNumber(summary.processed_today)}</h3>
          </div>
        </div>
      )}

      {processing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
          <Card size="sm">
            <CardContent>
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Hourly Processing (Today)</h3>
              <div className="h-[200px] w-full">
                <VerticalBarChart
                  data={processing.hourly_breakdown}
                  dataKey="count" nameKey="hour" height={200}
                  barColor="var(--accent-violet)"
                  yLabel="Forms"
                  xLabel="Hour"
                />
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Escalation Level Distribution</h3>
              <div className="h-[200px] w-full flex items-center justify-center">
                {processing.escalation_distribution && processing.escalation_distribution.length > 0 ? (
                  <DonutPieChart
                    data={processing.escalation_distribution}
                    dataKey="count" nameKey="level"
                    innerRadius={50} outerRadius={70}
                  />
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
              <HorizontalBarChart
                data={fieldConf.field_confidence}
                dataKey="average" nameKey="field" height={300}
                marginLeft={100} domain={[0, 100]}
                tooltipFormatter={(v) => `${v}%`}
                xLabel="Confidence (%)"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
