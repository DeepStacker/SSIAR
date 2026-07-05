import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';
import { api } from '../api';
import { 
  Loader2, TrendingUp, Users, Brain, GraduationCap, HelpCircle, AlertOctagon, Download, Clipboard, Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

interface AnalyticsViewProps {
  onBack: () => void;
}

type SubTab = 'executive' | 'demographics' | 'sdq' | 'domains' | 'academic' | 'correlations' | 'outliers' | 'data-quality' | 'export';

export function AnalyticsView({ onBack }: AnalyticsViewProps) {
  const [subTab, setSubTab] = useState<SubTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tab') as SubTab) || 'executive';
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', subTab);
    window.history.replaceState({}, '', url.toString());
  }, [subTab]);

  const [loading, setLoading] = useState(true);
  
  const [summary, setSummary] = useState<any>(null);
  const [demographics, setDemographics] = useState<any>(null);
  const [questionnaire, setQuestionnaire] = useState<any>(null);
  const [academic, setAcademic] = useState<any>(null);
  const [correlations, setCorrelations] = useState<any>(null);
  const [outliers, setOutliers] = useState<any>(null);
  const [processing, setProcessing] = useState<any>(null);
  const [fieldConf, setFieldConf] = useState<any>(null);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [dataQuality, setDataQuality] = useState<any>(null);
  
  const [rCopied, setRCopied] = useState(false);
  const [spssCopied, setSpssCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [sumRes, demoRes, questRes, acadRes, corrRes, outRes, procRes, confRes, qsRes, dqRes] = await Promise.all([
          api.getAnalyticsSummary().catch(() => null),
          api.getAnalyticsDemographics().catch(() => null),
          api.getAnalyticsQuestionnaire().catch(() => null),
          api.getAnalyticsAcademic().catch(() => null),
          api.getAnalyticsCorrelations().catch(() => null),
          api.getAnalyticsOutliers().catch(() => null),
          api.getAnalyticsProcessing().catch(() => null),
          api.getPerFieldConfidence().catch(() => null),
          api.getQueueStatus().catch(() => null),
          api.getAnalyticsDataQuality().catch(() => null),
        ]);
        
        setSummary(sumRes);
        setDemographics(demoRes);
        setQuestionnaire(questRes);
        setAcademic(acadRes);
        setCorrelations(corrRes);
        setOutliers(outRes);
        setProcessing(procRes);
        setFieldConf(confRes);
        setQueueStatus(qsRes);
        setDataQuality(dqRes);
      } catch (err) {
        console.error("Failed to load analytics data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6'];

  const rScript = `# SSIAR R Research Import Script
# Load Data
data <- read.csv("ssiar_research_export.csv")

# Standardize values
data$gender <- as.factor(data$gender)
data$class_clean <- as.factor(data$class_clean)

# Compute Correlation Matrix
numeric_cols <- data[, c("score_prosocial", "score_emotional", "score_conduct", "score_hyperactivity", "score_peer", "math_pct", "science_pct", "language_pct", "hindi_pct")]
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
    "  language_pct \"Language Score (%)\"\n" +
    "  hindi_pct \"Hindi Score (%)\".\n";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-4" />
        <p className="text-lg">Compiling behavioral metrics & correlation matrices...</p>
      </div>
    );
  }

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
        <TabsList className="w-full overflow-x-auto">
          {[
            { id: 'executive', label: 'Executive Stats', icon: TrendingUp },
            { id: 'demographics', label: 'Demographics', icon: Users },
            { id: 'sdq', label: 'Questionnaire (SDQ)', icon: HelpCircle },
            { id: 'domains', label: 'Behavioral Domains', icon: Brain },
            { id: 'academic', label: 'Academic Performance', icon: GraduationCap },
            { id: 'correlations', label: 'Cross-Correlations', icon: TrendingUp },
            { id: 'outliers', label: 'Outliers & anomalies', icon: AlertOctagon },
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
            <TabsContent value="executive">
              {summary && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Platform Summary Metrics</h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      { label: "Total Digits Ingested", value: summary.total_forms, color: "from-blue-600 to-indigo-600" },
                      { label: "Verified Submissions", value: summary.verified_forms, color: "from-emerald-600 to-teal-600" },
                      { label: "OCR Average Confidence", value: `${summary.average_confidence}%`, color: "from-indigo-600 to-purple-600" },
                      { label: "Data Completeness Rate", value: `${summary.data_completeness}%`, color: "from-purple-600 to-pink-600" }
                    ].map((card, i) => (
                      <Card key={i} size="sm">
                        <CardContent>
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{card.label}</span>
                          <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{card.value}</h3>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card size="sm">
                    <CardContent>
                      <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Ingestion & Processing Trend (Last 14 Days)</h3>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={summary.processing_trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                            <YAxis stroke="#94a3b8" fontSize={11} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                            <Line type="monotone" dataKey="count" stroke="var(--accent-violet)" strokeWidth={2.5} activeDot={{ r: 6 }} name="Forms Processed" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

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
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Throughput (forms/min)</span>
                          <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">
                            {summary.processing_trend && summary.processing_trend.length > 1
                              ? (summary.processing_trend.reduce((a: number, b: any) => a + b.count, 0) / summary.processing_trend.length / 1440 * 60).toFixed(1)
                              : '—'}
                          </h3>
                        </CardContent>
                      </Card>
                      <Card size="sm">
                        <CardContent>
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Processing Today</span>
                          <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{summary.processed_today}</h3>
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} />
                                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
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
                                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
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
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                              <YAxis type="category" dataKey="field" stroke="#94a3b8" fontSize={11} width={90} />
                              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} formatter={(val) => `${val}%`} />
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

            <TabsContent value="demographics">
              {demographics && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Student Cohort Demographics</h2>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card size="sm">
                      <CardContent>
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Cohort Distribution by Class Grade</h3>
                        <div className="h-[230px] w-full">
                          {demographics.class_distribution && demographics.class_distribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={demographics.class_distribution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="class" stroke="#94a3b8" fontSize={11} />
                                <YAxis stroke="#94a3b8" fontSize={11} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                                <Bar dataKey="count" fill="var(--accent-violet)" radius={[4, 4, 0, 0]} name="Students" />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No class data available.</div>
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
                                  {demographics.gender_distribution.map((_: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 text-sm">No gender data available.</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card size="sm">
                    <CardContent>
                      <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Age × Gender Heatmap Grid</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cohort Age</TableHead>
                            <TableHead className="text-center">Male</TableHead>
                            <TableHead className="text-center">Female</TableHead>
                            <TableHead className="text-center">Other</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {demographics.age_gender_heatmap && demographics.age_gender_heatmap.length > 0 ? (
                            demographics.age_gender_heatmap.map((row: any, i: number) => {
                              const totalRow = (row.Male || 0) + (row.Female || 0) + (row.Other || 0);
                              const getStyle = (val: number) => {
                                if (totalRow === 0) return {};
                                const ratio = val / totalRow;
                                return {
                                  backgroundColor: `rgba(99, 102, 241, ${Math.max(0.05, ratio * 0.75)})`,
                                  color: ratio > 0.4 ? '#fff' : 'var(--text-secondary)'
                                };
                              };
                              return (
                                <TableRow key={i}>
                                  <TableCell className="font-semibold">{row.age}</TableCell>
                                  <TableCell className="text-center" style={getStyle(row.Male || 0)}>
                                    {row.Male || 0}
                                  </TableCell>
                                  <TableCell className="text-center" style={getStyle(row.Female || 0)}>
                                    {row.Female || 0}
                                  </TableCell>
                                  <TableCell className="text-center" style={getStyle(row.Other || 0)}>
                                    {row.Other || 0}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center">No cohort age data available.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sdq">
              {questionnaire && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">SDQ Response Item Analysis</h2>
                  
                  <Card size="sm">
                    <CardContent>
                      <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Cronbach's Alpha Internal Consistency Reliability</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        {questionnaire.reliability && questionnaire.reliability.map((rel: any, i: number) => (
                          <Card key={i} size="sm">
                            <CardContent>
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{rel.domain} Scale</span>
                              <h4 className="text-3xl font-extrabold text-[var(--text-primary)] my-2 mb-1">{rel.cronbach_alpha}</h4>
                              <Badge variant="secondary">{rel.consistency} Consistency</Badge>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

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
                                <div style={{ width: `${pct2}%`, background: '#a855f7' }} className="flex items-center justify-center transition-all duration-300" title={`Somewhat True: ${q.somewhat_true}`}>
                                  {q.somewhat_true > 0 && `${pct2}%`}
                                </div>
                                <div style={{ width: `${pct3}%`, background: 'var(--accent-rose)' }} className="flex items-center justify-center transition-all duration-300" title={`Certainly True: ${q.certainly_true}`}>
                                  {q.certainly_true > 0 && `${pct3}%`}
                                </div>
                              </div>
                              
                              <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-violet)' }} /> Not True: {q.not_true}</span>
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#a855f7' }} /> Somewhat: {q.somewhat_true}</span>
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

            <TabsContent value="domains">
              {questionnaire && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Behavioral Domain Summaries</h2>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card size="sm" className="h-[350px]">
                      <CardContent className="h-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={
                            Object.keys(questionnaire.domain_scores || {}).map(k => ({
                              domain: k,
                              score: questionnaire.domain_scores[k].mean
                            }))
                          }>
                            <PolarGrid stroke="#334155" />
                            <PolarAngleAxis dataKey="domain" stroke="#94a3b8" fontSize={11} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#475569" fontSize={10} />
                            <Radar name="Mean Score" dataKey="score" stroke="var(--accent-violet)" fill="var(--accent-violet)" fillOpacity={0.3} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                      {Object.keys(questionnaire.domain_scores || {}).map((dom, idx) => {
                        const stat = questionnaire.domain_scores[dom];
                        return (
                          <div key={idx} className="rounded-xl border bg-card p-4 flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{dom} Scale</h4>
                              <span className="text-xs text-[var(--text-muted)]">Standard Deviation: {stat.sd} | Range: {stat.min} - {stat.max}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-[var(--text-muted)] block uppercase">Mean Score</span>
                              <span className="text-xl font-extrabold text-[var(--accent-violet)]">{stat.mean} <span className="text-xs text-[var(--text-muted)] font-normal">/10</span></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="academic">
              {academic && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Academic Subject Averages</h2>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card size="sm" className="h-[300px]">
                      <CardContent className="h-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={
                            Object.keys(academic.averages || {}).map(k => ({
                              subject: k,
                              score: academic.averages[k]
                            }))
                          }>
                            <PolarGrid stroke="#334155" />
                            <PolarAngleAxis dataKey="subject" stroke="#94a3b8" fontSize={11} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" fontSize={10} />
                            <Radar name="Class Average" dataKey="score" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card size="sm" className="flex flex-col justify-between">
                      <CardContent>
                        <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-4">Academic Score vs. Behavioral Difficulties</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                          By sorting students into quantiles based on their SDQ Total Difficulties score, we can observe the aggregate academic performance offset between low-difficulty and high-difficulty groups.
                        </p>
                        
                        {academic.top_vs_bottom_difficulties && academic.top_vs_bottom_difficulties.low_difficulty_group_academic ? (
                          <div className="flex flex-col gap-3">
                            <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
                              <span className="text-xs font-medium">Low Behavioral Difficulties (Bottom 10% SDQ)</span>
                              <span className="text-lg font-extrabold text-[var(--accent-emerald)]">{academic.top_vs_bottom_difficulties.low_difficulty_group_academic}%</span>
                            </div>
                            <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
                              <span className="text-xs font-medium">High Behavioral Difficulties (Top 10% SDQ)</span>
                              <span className="text-lg font-extrabold text-[var(--accent-rose)]">{academic.top_vs_bottom_difficulties.high_difficulty_group_academic}%</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center p-6 text-[var(--text-muted)] text-xs italic">Insufficient data points to calculate quantile offset.</div>
                        )}
                      </CardContent>
                    </Card>
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
                            <TableHead>Hindi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {academic.class_averages && academic.class_averages.map((row: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-bold">Class {row.class}</TableCell>
                              <TableCell>{row.Mathematics || 0}%</TableCell>
                              <TableCell>{row.Science || 0}%</TableCell>
                              <TableCell>{row.Language || 0}%</TableCell>
                              <TableCell>{row.Hindi || 0}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="correlations">
              {correlations && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Behavioral Domains vs. Academic Subject Correlations</h2>
                  <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                    This matrix displays the Pearson Correlation Coefficients ($r$) between computed behavioral domain scores and academic metrics.
                    Values range from $-1.0$ (strong negative correlation) to $+1.0$ (strong positive correlation), with cells colored according to correlation direction and strength.
                  </p>
                  
                  <Card size="sm">
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Scale Domain</TableHead>
                            <TableHead className="text-center">Math %</TableHead>
                            <TableHead className="text-center">Science %</TableHead>
                            <TableHead className="text-center">Language %</TableHead>
                            <TableHead className="text-center">Hindi %</TableHead>
                            <TableHead className="text-center">Rank</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {correlations.correlation_matrix && correlations.correlation_matrix.map((row: any, i: number) => {
                            const getStyle = (val: number) => {
                              const abs = Math.abs(val);
                              if (val > 0) {
                                return {
                                  backgroundColor: `rgba(16, 185, 129, ${Math.max(0.04, abs * 0.75)})`,
                                  color: abs > 0.35 ? '#fff' : 'var(--text-primary)'
                                };
                              } else {
                                return {
                                  backgroundColor: `rgba(244, 63, 94, ${Math.max(0.04, abs * 0.75)})`,
                                  color: abs > 0.35 ? '#fff' : 'var(--text-primary)'
                                };
                              }
                            };
                            return (
                              <TableRow key={i}>
                                <TableCell className="font-semibold">{row.domain}</TableCell>
                                <TableCell className="text-center font-mono" style={getStyle(row["Math %"] || 0)}>
                                  {row["Math %"] || 0}
                                </TableCell>
                                <TableCell className="text-center font-mono" style={getStyle(row["Science %"] || 0)}>
                                  {row["Science %"] || 0}
                                </TableCell>
                                <TableCell className="text-center font-mono" style={getStyle(row["Language %"] || 0)}>
                                  {row["Language %"] || 0}
                                </TableCell>
                                <TableCell className="text-center font-mono" style={getStyle(row["Hindi %"] || 0)}>
                                  {row["Hindi %"] || 0}
                                </TableCell>
                                <TableCell className="text-center font-mono" style={getStyle(row["Rank"] || 0)}>
                                  {row["Rank"] || 0}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="outliers">
              {outliers && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Anomalous Profile & Outlier Detection</h2>
                  <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                    Automatic queries look for students showing anomalous patterns, such as highly elevated hyperactivity/distress metrics coupled with top class rankings or marks. These exceptions are critical for targeted child support interventions.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    {outliers.outliers && outliers.outliers.length > 0 ? (
                      outliers.outliers.map((out: any, i: number) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)]">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Class {out.class}</Badge>
                              <span className="text-xs text-[var(--text-muted)]">Roll: {out.roll_number} ({out.gender})</span>
                            </div>
                            <h4 className="text-sm font-semibold text-[var(--text-primary)] mt-1.5">{out.metric_type}</h4>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-xs font-bold text-[var(--accent-violet)] bg-[var(--bg-primary)] px-3 py-1.5 rounded border border-[var(--color-border)]">
                              {out.value}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center p-12 text-[var(--text-muted)]">No anomalous student profiles detected in current cohort.</div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="data-quality">
              {dataQuality && (
                <div className="flex flex-col gap-6 w-full">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">OCR Data Quality Audit</h2>
                  <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                    Documents whose OCR output fails basic validation — long digit strings, repetitive patterns, fields exceeding expected lengths. These need human review before verification.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <Card size="sm">
                      <CardContent>
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Documents with Issues</span>
                        <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{dataQuality.documents_with_issues}</h3>
                      </CardContent>
                    </Card>
                    <Card size="sm">
                      <CardContent>
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Needs Review</span>
                        <h3 className="text-3xl font-extrabold text-[var(--text-primary)] mt-1.5">{dataQuality.needs_review}</h3>
                      </CardContent>
                    </Card>
                  </div>

                  {dataQuality.issues && dataQuality.issues.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {dataQuality.issues.map((doc: any, i: number) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)]">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{doc.escalation_level}</Badge>
                              <span className="text-xs text-[var(--text-muted)]">{doc.filename}</span>
                            </div>
                            <div className="mt-1.5 flex flex-col gap-1">
                              {doc.issues.map((iss: any, j: number) => (
                                <div key={j} className="text-xs text-[var(--text-secondary)]">
                                  <span className="font-semibold text-[var(--accent-amber)]">{iss.field}</span>:{' '}
                                  <code className="text-xs text-[var(--text-muted)]">{iss.value}</code>
                                  <span className="text-[#f43f5e] ml-1.5">— {iss.reason}</span>
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

            <TabsContent value="export">
              <div className="flex flex-col gap-6 w-full">
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Research Data Export Hub</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <a
                    href={api.getResearchExportUrl("csv")}
                    className="flex flex-col items-center gap-3 p-6 text-center rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-violet)] hover:shadow-md"
                  >
                    <Download className="w-8 h-8" style={{ color: 'var(--accent-violet)' }} />
                    <span className="text-sm font-bold text-[var(--text-primary)]">Standard CSV Format</span>
                    <span className="text-xs text-[var(--text-secondary)] leading-relaxed">Flat variable list suitable for generic spreadsheets.</span>
                  </a>

                  <a
                    href={api.getResearchExportUrl("excel")}
                    className="flex flex-col items-center gap-3 p-6 text-center rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-violet)] hover:shadow-md"
                  >
                    <Download className="w-8 h-8" style={{ color: 'var(--accent-emerald)' }} />
                    <span className="text-sm font-bold text-[var(--text-primary)]">Excel Spreadsheet</span>
                    <span className="text-xs text-[var(--text-secondary)] leading-relaxed">Formatted workbook with domain averages.</span>
                  </a>

                  <a
                    href={api.getResearchExportUrl("spss")}
                    className="flex flex-col items-center gap-3 p-6 text-center rounded-xl border bg-[var(--bg-secondary)] border-[var(--color-border)] no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--accent-violet)] hover:shadow-md"
                  >
                    <Download className="w-8 h-8" style={{ color: '#a855f7' }} />
                    <span className="text-sm font-bold text-[var(--text-primary)]">SPSS Import CSV</span>
                    <span className="text-xs text-[var(--text-secondary)] leading-relaxed">SPSS-compliant column headers and numeric tags.</span>
                  </a>
                </div>

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
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
