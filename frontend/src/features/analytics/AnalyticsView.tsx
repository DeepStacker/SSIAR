import { useState, useEffect } from 'react';
import { TrendingUp, Users, Brain, GraduationCap, HelpCircle, AlertOctagon, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { useAnalyticsData } from './hooks';
import { SummarySection } from './SummarySection';
import { DemographicsSection } from './DemographicsSection';
import { QuestionnaireSection } from './QuestionnaireSection';
import { AcademicSection } from './AcademicSection';
import { DataQualitySection } from './DataQualitySection';
import { ExportSection } from './ExportSection';
import type { AnalyticsViewProps, SubTab } from './types';

export function AnalyticsView({ onBack, classFilter, genderFilter }: AnalyticsViewProps) {
  const [subTab, setSubTab] = useState<SubTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tab') as SubTab) || 'executive';
  });

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

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)} className="w-full">
        <TabsList className="w-full flex-wrap">
          {[
            { id: 'executive' as const, label: 'Executive Stats', icon: TrendingUp },
            { id: 'demographics' as const, label: 'Demographics', icon: Users },
            { id: 'sdq' as const, label: 'Questionnaire (SDQ)', icon: HelpCircle },
            { id: 'academic' as const, label: 'Academic Performance', icon: GraduationCap },
            { id: 'data-quality' as const, label: 'Data Quality', icon: AlertOctagon },
            { id: 'export' as const, label: 'SPSS / R Export', icon: Download }
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
            <TabsContent value="executive" className="animate-in fade-in duration-300 mt-0">
              <SummarySection
                summary={summary}
                processing={processing}
                fieldConf={fieldConf}
                queueStatus={queueStatus}
                tabLoading={tabLoading}
                classFilter={classFilter}
                genderFilter={genderFilter}
              />
            </TabsContent>

            <TabsContent value="demographics" className="animate-in fade-in duration-300 mt-0">
              <DemographicsSection
                demographics={demographics}
                questionnaire={questionnaire}
                tabLoading={tabLoading}
              />
            </TabsContent>

            <TabsContent value="sdq" className="animate-in fade-in duration-300 mt-0">
              <QuestionnaireSection
                questionnaire={questionnaire}
                tabLoading={tabLoading}
              />
            </TabsContent>

            <TabsContent value="academic" className="animate-in fade-in duration-300 mt-0">
              <AcademicSection
                academic={academic}
                questionnaire={questionnaire}
                tabLoading={tabLoading}
              />
            </TabsContent>

            <TabsContent value="data-quality" className="animate-in fade-in duration-300 mt-0">
              <DataQualitySection
                dataQuality={dataQuality}
                tabLoading={tabLoading}
              />
            </TabsContent>

            <TabsContent value="export" className="animate-in fade-in duration-300 mt-0">
              <ExportSection
                classFilter={classFilter}
                genderFilter={genderFilter}
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
