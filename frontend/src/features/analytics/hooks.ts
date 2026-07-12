import { useState, useEffect, useRef } from 'react';
import { api } from '@/api';
import type { SubTab, AnalyticsState } from './types';

export function useAnalyticsData(
  subTab: SubTab,
  classFilter: string,
  genderFilter: string
) {
  const [tabLoading, setTabLoading] = useState(true);
  const loadedTabs = useRef<Set<string>>(new Set());

  const [state, setState] = useState<AnalyticsState>({
    summary: null,
    demographics: null,
    questionnaire: null,
    academic: null,
    processing: null,
    fieldConf: null,
    queueStatus: null,
    dataQuality: null,
  });

  useEffect(() => {
    if (subTab === 'export') return;
    if (loadedTabs.current.has(subTab)) return;

    loadedTabs.current.add(subTab);
    setTabLoading(true);

    const fetchData = async () => {
      try {
        const filters = { class: classFilter, gender: genderFilter };

        switch (subTab) {
          case 'executive': {
            const [sumRes, procRes, confRes, qsRes] = await Promise.all([
              api.getAnalyticsSummary(filters).catch(() => null),
              api.getAnalyticsProcessing(filters).catch(() => null),
              api.getPerFieldConfidence(filters).catch(() => null),
              api.getQueueStatus().catch(() => null),
            ]);
            setState(prev => ({ ...prev, summary: sumRes, processing: procRes, fieldConf: confRes, queueStatus: qsRes }));
            break;
          }
          case 'demographics': {
            const [demoRes, questRes] = await Promise.all([
              api.getAnalyticsDemographics(filters).catch(() => null),
              api.getAnalyticsQuestionnaire(filters).catch(() => null)
            ]);
            setState(prev => ({ ...prev, demographics: demoRes, questionnaire: questRes }));
            break;
          }
          case 'sdq': {
            if (!loadedTabs.current.has('sdq')) {
              loadedTabs.current.add('sdq');
              const questRes = await api.getAnalyticsQuestionnaire(filters).catch(() => null);
              setState(prev => ({ ...prev, questionnaire: questRes }));
            }
            break;
          }
          case 'academic': {
            const acadRes = await api.getAnalyticsAcademic(filters).catch(() => null);
            setState(prev => ({ ...prev, academic: acadRes }));
            break;
          }
          case 'data-quality': {
            const dqRes = await api.getAnalyticsDataQuality({ class: classFilter, gender: genderFilter }).catch(() => null);
            setState(prev => ({ ...prev, dataQuality: dqRes }));
          }
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

  useEffect(() => {
    loadedTabs.current.clear();
  }, [classFilter, genderFilter]);

  return { tabLoading, ...state };
}
