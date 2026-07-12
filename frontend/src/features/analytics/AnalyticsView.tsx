import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, Brain, GraduationCap, HelpCircle, AlertOctagon, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { useAnalyticsData } from './hooks';
import { SummarySection } from './SummarySection';
import { DemographicsSection } from './DemographicsSection';
import { QuestionnaireSection } from './QuestionnaireSection';
import { AcademicSection } from './AcademicSection';
import { DataQualitySection } from './DataQualitySection';
import { ExportSection } from './ExportSection';
import type { AnalyticsViewProps, SubTab } from './types';

const tabs = [
  { id: 'executive' as const, label: 'Executive Stats', icon: TrendingUp },
  { id: 'demographics' as const, label: 'Demographics', icon: Users },
  { id: 'sdq' as const, label: 'Questionnaire (SDQ)', icon: HelpCircle },
  { id: 'academic' as const, label: 'Academic Performance', icon: GraduationCap },
  { id: 'data-quality' as const, label: 'Data Quality', icon: AlertOctagon },
  { id: 'export' as const, label: 'SPSS / R Export', icon: Download },
];

export function AnalyticsView({ onBack, classFilter, genderFilter }: AnalyticsViewProps) {
  const [subTab, setSubTab] = useState<SubTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tab') as SubTab) || 'executive';
  });
  const [animatingTab, setAnimatingTab] = useState<SubTab | null>(null);

  const handleTabChange = useCallback((v: string) => {
    setAnimatingTab(v as SubTab);
    setSubTab(v as SubTab);
  }, []);

  useEffect(() => {
    if (animatingTab) {
      const t = setTimeout(() => setAnimatingTab(null), 300);
      return () => clearTimeout(t);
    }
  }, [animatingTab]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', subTab);
    window.history.replaceState({}, '', url.toString());
  }, [subTab]);

  const { tabLoading, summary, demographics, questionnaire, academic, processing, fieldConf, queueStatus, dataQuality } = useAnalyticsData(subTab, classFilter, genderFilter);

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

      <div className="glass-card rounded-xl p-1">
        <Tabs value={subTab} onValueChange={handleTabChange} className="w-full">
          <TabsList variant="line" className="w-full flex-wrap gap-0 bg-transparent">
            {tabs.map(t => {
              const Icon = t.icon;
              const isActive = subTab === t.id;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200"
                  style={{
                    color: isActive ? 'var(--accent-violet)' : 'var(--text-muted)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--accent-violet)] animate-chart-enter" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {tabs.map(t => {
        const isActive = subTab === t.id || animatingTab === t.id;
        if (!isActive && animatingTab !== t.id) return null;
        return (
          <div key={t.id} className={animatingTab ? 'animate-chart-enter' : ''} style={{ display: subTab === t.id ? 'block' : 'none' }}>
            <Card>
              <CardContent className="min-h-[400px]">
                {t.id === 'executive' && (
                  <SummarySection
                    summary={summary}
                    processing={processing}
                    fieldConf={fieldConf}
                    queueStatus={queueStatus}
                    tabLoading={tabLoading}
                    classFilter={classFilter}
                    genderFilter={genderFilter}
                  />
                )}
                {t.id === 'demographics' && (
                  <DemographicsSection
                    demographics={demographics}
                    questionnaire={questionnaire}
                    tabLoading={tabLoading}
                  />
                )}
                {t.id === 'sdq' && (
                  <QuestionnaireSection
                    questionnaire={questionnaire}
                    tabLoading={tabLoading}
                  />
                )}
                {t.id === 'academic' && (
                  <AcademicSection
                    academic={academic}
                    questionnaire={questionnaire}
                    tabLoading={tabLoading}
                  />
                )}
                {t.id === 'data-quality' && (
                  <DataQualitySection
                    dataQuality={dataQuality}
                    tabLoading={tabLoading}
                  />
                )}
                {t.id === 'export' && (
                  <ExportSection
                    classFilter={classFilter}
                    genderFilter={genderFilter}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
