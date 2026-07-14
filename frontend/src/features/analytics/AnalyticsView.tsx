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

  const handleTabChange = useCallback((v: string) => {
    setSubTab(v as SubTab);
  }, []);

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
          <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-2xl font-extrabold">
            <Brain className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
            <span className="hidden xs:inline">Research Analytics Platform</span>
            <span className="xs:hidden">Analytics</span>
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

      <div className="p-1">
        <Tabs value={subTab} onValueChange={handleTabChange} className="w-full">
          <TabsList variant="line" className="w-full flex-wrap gap-0 bg-transparent">
            {tabs.map(t => {
              const Icon = t.icon;
              const isActive = subTab === t.id;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-none border-b-2 transition-colors ${
                    isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="min-h-[400px]">
          {subTab === 'executive' && (
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
          {subTab === 'demographics' && (
            <DemographicsSection
              demographics={demographics}
              questionnaire={questionnaire}
              tabLoading={tabLoading}
            />
          )}
          {subTab === 'sdq' && (
            <QuestionnaireSection
              questionnaire={questionnaire}
              tabLoading={tabLoading}
            />
          )}
          {subTab === 'academic' && (
            <AcademicSection
              academic={academic}
              questionnaire={questionnaire}
              tabLoading={tabLoading}
            />
          )}
          {subTab === 'data-quality' && (
            <DataQualitySection
              dataQuality={dataQuality}
              tabLoading={tabLoading}
            />
          )}
          {subTab === 'export' && (
            <ExportSection
              classFilter={classFilter}
              genderFilter={genderFilter}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
