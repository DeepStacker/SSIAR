import { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';
import { api, QueueStatus } from '../api';
import { exportToCsv } from '../lib/utils';
import { 
  TrendingUp, Users, Brain, GraduationCap, HelpCircle, AlertOctagon, Download, Clipboard, Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

interface AnalyticsViewProps {
  onBack: () => void;
  classFilter: string;
  genderFilter: string;
  onClassFilterChange: (val: string) => void;
  onGenderFilterChange: (val: string) => void;
}

type SubTab = 'executive' | 'demographics' | 'sdq' | 'domains' | 'academic' | 'correlations' | 'outliers' | 'data-quality' | 'export';

interface SummaryData {
  total_forms: number;
  verified_forms: number;
  average_confidence: number;
  data_completeness: number;
  processing_trend: Array<{ date: string; count: number }>;
  processed_today: number;
  pending_review?: number;
  throughput_window_days?: number;
  throughput_forms_per_min?: number;
}

interface DemographicsData {
  class_distribution: Array<{ class: string; count: number }>;
  gender_distribution: Array<{ gender: string; count: number }>;
  age_gender_heatmap: Array<{ age: string; Male: number; Female: number; Other: number }>;
  age_distribution: Array<{ age: string; count: number }>;
}

interface QuestionnaireData {
  reliability: Array<{ domain: string; cronbach_alpha: number; consistency: string }>;
  questions: Array<{ question_id: string; domain: string; text: string; text_hi: string; not_true: number; somewhat_true: number; certainly_true: number; total: number }>;
  domain_scores: Record<string, { mean: number; sd: number; min: number; max: number; gender_split?: Record<string, number> }>;
  clinical_distribution?: Array<{ category: string; count: number; percentage: number }>;
  academic_impact?: Record<string, { math: number; science: number; language: number; student_count: number }>;
  cohort_summary?: Array<{ class: string; cohort_size: number; consent_rate: number; mean_sdq_difficulties: number; mean_prosocial: number; mean_math: number; mean_science: number; mean_language: number }>;
}

interface AcademicData {
  averages: Record<string, number>;
  top_vs_bottom_difficulties: { low_difficulty_group_academic: number; high_difficulty_group_academic: number } | null;
  class_averages: Array<{ class: string; Mathematics: number; Science: number; Language: number }>;
}

interface CorrelationsData {
  correlation_matrix: Array<{ domain: string; "Math %": number; "Science %": number; "Language %": number; Rank: number }>;
}

interface OutliersData {
  outliers: Array<{ class: string; roll_number: string; gender: string; metric_type: string; value: string }>;
}

interface ProcessingData {
  hourly_breakdown: Array<{ hour: string; count: number }>;
  escalation_distribution: Array<{ level: string; count: number }>;
}

interface FieldConfData {
  field_confidence: Array<{ field: string; average: number }>;
}

interface DataQualityData {
  documents_with_issues: number;
  needs_review: number;
  issues: Array<{ escalation_level: string; filename: string; issues: Array<{ field: string; value: string; reason: string }> }>;
  total_documents?: number;
}

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-[var(--color-border)] ${className}`} />
  );
}

function ExecutiveSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-64 mb-2" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <SkeletonCard key={i} className="h-24" />)}
      </div>
      <SkeletonCard className="h-4 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[250px]" />
        <SkeletonCard className="h-[250px]" />
      </div>
    </div>
  );
}

function DemographicsSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[230px]" />
        <SkeletonCard className="h-[230px]" />
      </div>
      <SkeletonCard className="h-[200px]" />
    </div>
  );
}

function SdgSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <SkeletonCard className="h-[120px]" />
      <SkeletonCard className="h-4 w-48" />
      <SkeletonCard className="h-[300px]" />
    </div>
  );
}

function AcademicSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[300px]" />
        <SkeletonCard className="h-[300px]" />
      </div>
      <SkeletonCard className="h-[250px]" />
    </div>
  );
}

function CorrelationsSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-64 mb-2" />
      <SkeletonCard className="h-4 w-full" />
      <SkeletonCard className="h-[300px]" />
    </div>
  );
}

function OutliersSkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <SkeletonCard className="h-4 w-full" />
      {[1,2,3].map(i => <SkeletonCard key={i} className="h-20" />)}
    </div>
  );
}

function DataQualitySkeleton() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <SkeletonCard className="h-4 w-48 mb-2" />
      <SkeletonCard className="h-4 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
      </div>
      {[1,2].map(i => <SkeletonCard key={i} className="h-32" />)}
    </div>
  );
}

function DonutChart({ percentage, size = 100, strokeWidth = 8, color = 'var(--accent-violet)' }: { percentage: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize={size * 0.16} fontWeight="bold">
        {percentage}%
      </text>
    </svg>
  );
}

function Sparkline({ data, width = 100, height = 28, color = 'var(--accent-violet)' }: { data: Array<{ date: string; count: number }>; width?: number; height?: number; color?: string }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => d.count);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const padding = 2;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((d.count - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle cx={points.split(' ').pop()!.split(',')[0]} cy={points.split(' ').pop()!.split(',')[1]} r="3" fill={color} />
    </svg>
  );
}

function TrendBadge({ value }: { value: number }) {
  if (value > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent-emerald)]">↑ +{value}</span>;
  if (value < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent-rose)]">↓ {value}</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--text-muted)]">→ 0</span>;
}

function ScoreBand({ value }: { value: number }) {
  if (value >= 75) return <span className="font-semibold text-[var(--accent-emerald)]">{value}%</span>;
  if (value >= 50) return <span className="font-semibold text-[var(--accent-amber)]">{value}%</span>;
  return <span className="font-semibold text-[var(--accent-rose)]">{value}%</span>;
}

const escalationBadgeColors: Record<string, string> = {
  level_1: 'bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)] border-[var(--accent-emerald)]/30',
  level_2: 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] border-[var(--accent-amber)]/30',
  level_3: 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)] border-[var(--accent-rose)]/30',
  level_4: 'bg-[var(--accent-rose)]/25 text-[var(--accent-rose)] border-[var(--accent-rose)]/40',
};

const escalationLabels: Record<string, string> = {
  level_1: 'L1 · Clean',
  level_2: 'L2 · Field warning',
  level_3: 'L3 · Alignment',
  level_4: 'L4 · Poor quality / failed',
};

export function AnalyticsView({ onBack, classFilter, genderFilter, ...rest }: AnalyticsViewProps) {
  void rest.onClassFilterChange; void rest.onGenderFilterChange;
  const [subTab, setSubTab] = useState<SubTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tab') as SubTab) || 'executive';
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', subTab);
    window.history.replaceState({}, '', url.toString());
  }, [subTab]);

  const [tabLoading, setTabLoading] = useState(true);
  const loadedTabs = useRef<Set<string>>(new Set());

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [demographics, setDemographics] = useState<DemographicsData | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData | null>(null);
  const [academic, setAcademic] = useState<AcademicData | null>(null);
  const [correlations, setCorrelations] = useState<CorrelationsData | null>(null);
  const [outliers, setOutliers] = useState<OutliersData | null>(null);
  const [processing, setProcessing] = useState<ProcessingData | null>(null);
  const [fieldConf, setFieldConf] = useState<FieldConfData | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityData | null>(null);
  
  const [rCopied, setRCopied] = useState(false);
  const [spssCopied, setSpssCopied] = useState(false);

  useEffect(() => {
    if (subTab === 'export') return;
    if (loadedTabs.current.has(subTab)) return;

    loadedTabs.current.add(subTab);
    setTabLoading(true);

    const fetchData = async () => {
      try {
        switch (subTab) {
          case 'executive': {
            const filters = { class: classFilter, gender: genderFilter };
            const [sumRes, procRes, confRes, qsRes] = await Promise.all([
              api.getAnalyticsSummary(filters).catch(() => null),
              api.getAnalyticsProcessing(filters).catch(() => null),
              api.getPerFieldConfidence(filters).catch(() => null),
              api.getQueueStatus().catch(() => null),
            ]);
            setSummary(sumRes as SummaryData);
            setProcessing(procRes as ProcessingData);
            setFieldConf(confRes as FieldConfData);
            setQueueStatus(qsRes);
            break;
          }
          case 'demographics': {
            const filters = { class: classFilter, gender: genderFilter };
            const [demoRes, questRes] = await Promise.all([
              api.getAnalyticsDemographics(filters).catch(() => null),
              api.getAnalyticsQuestionnaire(filters).catch(() => null)
            ]);
            setDemographics(demoRes as DemographicsData);
            setQuestionnaire(questRes as any);
            break;
          }
          case 'sdq':
          case 'domains': {
            if (!loadedTabs.current.has('sdq') || !loadedTabs.current.has('domains')) {
              loadedTabs.current.add('sdq');
              loadedTabs.current.add('domains');
              const filters = { class: classFilter, gender: genderFilter };
              setQuestionnaire(await api.getAnalyticsQuestionnaire(filters).catch(() => null) as QuestionnaireData);
            }
            break;
          }
          case 'academic': {
            const filters = { class: classFilter, gender: genderFilter };
            setAcademic(await api.getAnalyticsAcademic(filters).catch(() => null) as AcademicData);
            break;
          }
          case 'correlations':
            setCorrelations(await api.getAnalyticsCorrelations({ class: classFilter, gender: genderFilter }).catch(() => null) as CorrelationsData);
            break;
          case 'outliers':
            setOutliers(await api.getAnalyticsOutliers({ class: classFilter, gender: genderFilter }).catch(() => null) as OutliersData);
            break;
          case 'data-quality':
            setDataQuality(await api.getAnalyticsDataQuality({ class: classFilter, gender: genderFilter }).catch(() => null) as DataQualityData);
            break;
        }
      } catch (err) {
        console.error("Failed to load analytics data", err);
      } finally {
        setTabLoading(false);
      }
    };

    fetchData();
  }, [subTab, classFilter, genderFilter]);

  // Clear loaded tabs cache when filters change so data is re-fetched
  useEffect(() => {
    loadedTabs.current.clear();
  }, [classFilter, genderFilter]);

  const COLORS = ['var(--accent-violet)', 'var(--accent-cyan)', 'var(--accent-rose)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-rose)', 'var(--accent-cyan)'];

  const rScript = `# SSIAR R Research Import Script
# Load Data
data <- read.csv("ssiar_research_export.csv")

# Standardize values
data$gender <- as.factor(data$gender)
data$class_clean <- as.factor(data$class_clean)

# Compute Correlation Matrix
numeric_cols <- data[, c("score_prosocial", "score_emotional", "score_conduct", "score_hyperactivity", "score_peer", "math_pct", "science_pct", "language_pct")]
cor_matrix <- cor(numeric_cols, use="complete.obs", method="pearson")
print(cor_matrix)

# Plot Cronbach Alpha
library(psych)
psych::alpha(data[, paste0("q", 1:5)]) # Prosocial
`;

  const spssSyntax = "* SSIAR SPSS Import and Labeling Syntax.\n" +
    "GET DATA  /TYPE=TXT\n" +
    "  /FILE=\"ssiar_spss_import.csv\"\n" +
    "  /DELCASE=LINE\n" +
    "  /DELIMITERS=\",\"\n" +
    "  /ARRANGEMENT=DELIMITED\n" +
    "  /FIRSTCASE=2\n" +
    "  /IMPORTCASE=ALL.\n\n" +
    "VARIABLE LABELS\n" +
    "  roll_number \"Student Roll Number\"\n" +
    "  class_clean \"Normalized Class Grade\"\n" +
    "  score_prosocial \"Prosocial Scale Score\"\n" +
    "  score_emotional \"Emotional Scale Score\"\n" +
    "  score_conduct \"Conduct Problems Score\"\n" +
    "  score_hyperactivity \"Hyperactivity/Inattention Score\"\n" +
    "  score_peer \"Peer Difficulties Score\"\n" +
    "  score_total_difficulties \"Total Difficulties Score (SDQ)\"\n" +
    "  math_pct \"Mathematics Score (%)\"\n" +
    "  science_pct \"Science Score (%)\"\n" +
    "  language_pct \"Language Score (%)\".\n";

  return (
    <div className="flex flex-col gap-6 w-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl font-extrabold">
            <Brain className="w-7 h-7" style={{ color: 'var(--accent-violet)' }} />
            Research Analytics Platform
          </CardTitle>
          <CardDescription>
            Dynamic SDQ domain scoring, psychological-academic correlations, and reliability stats.
          </CardDescription>
          <CardAction>
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back to Dashboard
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)} className="w-full">
        <TabsList className="w-full flex-wrap">
          {[
            { id: 'executive', label: 'Executive Stats', icon: TrendingUp },
            { id: 'demographics', label: 'Demographics', icon: Users },
            { id: 'sdq', label: 'Questionnaire (SDQ)', icon: HelpCircle },
            { id: 'academic', label: 'Academic Performance', icon: GraduationCap },
            { id: 'data-quality', label: 'Data Quality', icon: AlertOctagon },
            { id: 'export', label: 'SPSS / R Export', icon: Download }
          ].map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id}>
                <Icon className="w-4 h-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <Card>
          <CardContent className="min-h-[400px]">
            {subTab === 'executive' && (
            <TabsContent value="executive" className="animate-in fade-in duration-300 mt-0">
              {tabLoading ? <ExecutiveSkeleton /> : !summary ? (
                <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
                  No data available for this section.
                </div>
              ) : (
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
                                    {processing.escalation_distribution.map((_, i: number) => (
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
              )}
            </TabsContent>
            )}

            {subTab === 'demographics' && (
            <TabsContent value="demographics" className="animate-in fade-in duration-300 mt-0">
              {tabLoading ? <DemographicsSkeleton /> : !demographics ? (
                <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
                  No data available for this section.
                </div>
              ) : (
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
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="count"
                                  nameKey="gender"
                                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                  {demographics.gender_distribution.map((_, index: number) => (
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
              )}
            </TabsContent>
            )}

            {subTab === 'sdq' && (
            <TabsContent value="sdq" className="animate-in fade-in duration-300 mt-0">
              {tabLoading ? <SdgSkeleton /> : !questionnaire ? (
                <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
                  No data available for this section.
                </div>
              ) : (
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
                            const rows = questionnaire.clinical_distribution.map((c: any) => [c.category, String(c.count), `${c.percentage}%`]);
                            exportToCsv(headers, rows, 'clinical_sdq_distribution.csv');
                          }} className="text-[10px] font-semibold text-[var(--accent-violet)] hover:underline no-print flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--bg-highlight)]">
                            Export CSV
                          </button>
                        </div>
                        <div className="h-[200px] w-full">
                          {questionnaire.clinical_distribution && questionnaire.clinical_distribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={questionnaire.clinical_distribution}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={50}
                                  outerRadius={70}
                                  paddingAngle={3}
                                  dataKey="count"
                                  nameKey="category"
                                  label={({ name, percent }) => `${name.split(' ')[0]}: ${(percent * 100).toFixed(0)}%`}
                                >
                                  {questionnaire.clinical_distribution.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--accent-emerald)' : index === 1 ? 'var(--accent-amber)' : 'var(--accent-rose)'} />
                                  ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No clinical data.</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card size="sm" className="lg:col-span-2">
                      <CardContent>
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">SDQ Clinical Reference Table</h3>
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
                            {questionnaire.clinical_distribution && questionnaire.clinical_distribution.map((row: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell className="font-semibold text-xs flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: idx === 0 ? 'var(--accent-emerald)' : idx === 1 ? 'var(--accent-amber)' : 'var(--accent-rose)' }} />
                                  {row.category.split(' ')[0]}
                                </TableCell>
                                <TableCell className="text-center text-xs font-mono">{row.category.split(' ').pop()}</TableCell>
                                <TableCell className="text-center text-xs font-bold">{row.count}</TableCell>
                                <TableCell className="text-center text-xs font-bold text-[var(--accent-violet)]">{row.percentage}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>

                  {questionnaire.domain_scores && Object.keys(questionnaire.domain_scores).length > 0 && (
                    <Card size="sm">
                      <CardContent>
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Domain Mean Scores Comparison</h3>
                        <div className="h-[250px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={Object.keys(questionnaire.domain_scores).map(k => ({
                                domain: k,
                                mean: questionnaire.domain_scores[k].mean
                              }))}
                              margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                              <XAxis dataKey="domain" stroke="var(--text-muted)" fontSize={11} />
                              <YAxis domain={[0, 10]} stroke="var(--text-muted)" fontSize={11} />
                              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--color-border)', color: '#fff' }} />
                              <Bar dataKey="mean" fill="var(--accent-violet)" radius={[4,4,0,0]} name="Mean Score">
                                {Object.keys(questionnaire.domain_scores).map((_, idx) => (
                                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card size="sm">
                    <CardContent>
                      <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Individual Question Distributions</h3>
                      <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                        {questionnaire.questions && questionnaire.questions.map((q: any, i: number) => {
                          const total = q.total || 1;
                          const pct1 = ((q.not_true / total) * 100).toFixed(0);
                          const pct2 = ((q.somewhat_true / total) * 100).toFixed(0);
                          const pct3 = ((q.certainly_true / total) * 100).toFixed(0);
                          return (
                            <div key={i} className="p-4 rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)]">
                              <div>
                                <div className="flex justify-between text-xs font-bold text-[var(--text-muted)] mb-1.5">
                                  <span>Question {q.question_id.toUpperCase()} ({q.domain} Domain)</span>
                                </div>
                                <h4 className="text-sm font-semibold text-[var(--text-primary)]">{q.text}</h4>
                                <span className="text-xs italic text-[var(--text-muted)] mt-0.5">{q.text_hi}</span>
                              </div>
                              
                              <div className="flex h-4 rounded-full overflow-hidden bg-[var(--bg-primary)] text-[10px] text-white font-bold text-center my-3 mb-2">
                                <div style={{ width: `${pct1}%`, background: 'var(--accent-violet)' }} className="flex items-center justify-center transition-all duration-300" title={`Not True: ${q.not_true}`}>
                                  {q.not_true > 0 && `${pct1}%`}
                                </div>
                                <div style={{ width: `${pct2}%`, background: 'var(--accent-violet)' }} className="flex items-center justify-center transition-all duration-300" title={`Somewhat True: ${q.somewhat_true}`}>
                                  {q.somewhat_true > 0 && `${pct2}%`}
                                </div>
                                <div style={{ width: `${pct3}%`, background: 'var(--accent-rose)' }} className="flex items-center justify-center transition-all duration-300" title={`Certainly True: ${q.certainly_true}`}>
                                  {q.certainly_true > 0 && `${pct3}%`}
                                </div>
                              </div>
                              
                              <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-violet)' }} /> Not True: {q.not_true}</span>
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-violet)' }} /> Somewhat: {q.somewhat_true}</span>
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-rose)' }} /> Certainly: {q.certainly_true}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
            )}


            {subTab === 'academic' && (
            <TabsContent value="academic" className="animate-in fade-in duration-300 mt-0">
              {tabLoading ? <AcademicSkeleton /> : !academic ? (
                <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
                  No data available for this section.
                </div>
              ) : (
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
              )}
            </TabsContent>
            )}


            {subTab === 'data-quality' && (
            <TabsContent value="data-quality" className="animate-in fade-in duration-300 mt-0">
              {tabLoading ? <DataQualitySkeleton /> : !dataQuality ? (
                <div className="flex items-center justify-center min-h-[400px] text-[var(--text-muted)] text-sm">
                  No data available for this section.
                </div>
              ) : (
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
              )}
            </TabsContent>
            )}

{subTab === 'export' && (
<TabsContent value="export" className="animate-in fade-in duration-300 mt-0">
  <div className="flex flex-col gap-6 w-full">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Research Data Export Hub</h2>
      <span className="text-xs text-[var(--text-muted)] no-print">
        {classFilter !== 'all' && `Class: ${classFilter}`}
        {classFilter !== 'all' && genderFilter !== 'all' ? ' | ' : ''}
        {genderFilter !== 'all' && `Gender: ${genderFilter}`}
        {classFilter === 'all' && genderFilter === 'all' && 'No filters active'}
      </span>
    </div>
    
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
      <a
        href={api.getResearchExportUrl("csv", { class: classFilter, gender: genderFilter })}
        className="flex flex-col items-center gap-3 p-6 text-center rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-violet)] hover:shadow-md"
      >
        <Download className="w-8 h-8" style={{ color: 'var(--accent-violet)' }} />
        <span className="text-sm font-bold text-[var(--text-primary)]">Standard CSV Format</span>
        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">Flat variable list suitable for generic spreadsheets.</span>
      </a>

      <a
        href={api.getResearchExportUrl("excel", { class: classFilter, gender: genderFilter })}
        className="flex flex-col items-center gap-3 p-6 text-center rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-emerald)] hover:shadow-md"
      >
        <Download className="w-8 h-8" style={{ color: 'var(--accent-emerald)' }} />
        <span className="text-sm font-bold text-[var(--text-primary)]">Excel Spreadsheet</span>
        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">Formatted workbook with domain averages.</span>
      </a>

      <a
        href={api.getResearchExportUrl("spss", { class: classFilter, gender: genderFilter })}
        className="flex flex-col items-center gap-3 p-6 text-center rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-violet)] hover:shadow-md"
      >
        <Download className="w-8 h-8" style={{ color: 'var(--accent-violet)' }} />
        <span className="text-sm font-bold text-[var(--text-primary)]">SPSS Import CSV</span>
        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">SPSS-compliant column headers and numeric tags.</span>
      </a>
    </div>

    <p className="text-xs text-[var(--text-secondary)] leading-relaxed no-print">
      Download the full research dataset in your preferred format. Current filters are applied automatically.
    </p>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">R Import Script</h3>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                navigator.clipboard.writeText(rScript);
                setRCopied(true);
                setTimeout(() => setRCopied(false), 2000);
              }}
            >
              {rCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3" />}
              {rCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="font-mono text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] border border-[var(--color-border)] rounded p-4 overflow-x-auto h-[150px] leading-relaxed">
            {rScript}
          </pre>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">SPSS Variable Labels Syntax</h3>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                navigator.clipboard.writeText(spssSyntax);
                setSpssCopied(true);
                setTimeout(() => setSpssCopied(false), 2000);
              }}
            >
              {spssCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3" />}
              {spssCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="font-mono text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] border border-[var(--color-border)] rounded p-4 overflow-x-auto h-[150px] leading-relaxed">
            {spssSyntax}
          </pre>
        </CardContent>
      </Card>
    </div>
  </div>
</TabsContent>
)}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
