import type { SummaryData, DemographicsData, QuestionnaireData, AcademicData, ProcessingData, FieldConfData, DataQualityData, QueueStatus } from '@/api';

export type SubTab = 'executive' | 'demographics' | 'sdq' | 'academic' | 'data-quality' | 'export';

export interface AnalyticsViewProps {
  onBack: () => void;
  classFilter: string;
  genderFilter: string;
}

export interface AnalyticsState {
  summary: SummaryData | null;
  demographics: DemographicsData | null;
  questionnaire: QuestionnaireData | null;
  academic: AcademicData | null;
  processing: ProcessingData | null;
  fieldConf: FieldConfData | null;
  queueStatus: QueueStatus | null;
  dataQuality: DataQualityData | null;
}
