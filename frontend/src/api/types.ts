import type { LucideIcon } from 'lucide-react'

export interface Document {
  id: string;
  filename: string;
  status: string;
  created_at: string;
  roll_number?: string;
  class?: string;
  dob?: string;
  gender?: string;
  consent?: string;
  verified_by_human?: number;
  error_message?: string;
  classification?: {
    type: "mobile_photo" | "scanned" | "photocopy" | "fax_like";
    dpi: number;
    pages: number;
    is_color: boolean;
  };
  escalation_level?: "level_1" | "level_2" | "level_3" | "level_4";
}

export interface DocumentDetails extends Document {
  responses: Record<string, number | number[]>;
  academic_scores: {
    math_pct: string;
    science_pct: string;
    language_pct: string;
    rank: string;
  };
  remarks?: string;
  confidence_scores: {
    ocr: Record<string, number>;
    checkbox: Record<string, string>;
    multi_ticks?: Record<string, number[]>;
    review_fields?: string[];
    v2_trust?: Record<string, { trust_confidence?: number; page?: number; polygon?: number[] }>;
  };
  quality_report?: {
    blur: number;
    rotation: number;
    contrast: number;
    shadow: boolean;
    fold: boolean;
    crop: boolean;
    noise: number;
    quality: number;
  };
}

export interface EditHistoryEntry {
  field_name: string;
  old_value: string | null;
  new_value: string;
  edited_at: string;
}

export interface ExportFilters {
  format?: "excel" | "csv";
  lang?: string;
  status?: string;
  class?: string;
  date_from?: string;
  date_to?: string;
  roll_prefix?: string;
  columns?: string;
  doc_ids?: string;
}

export interface QueueStatus {
  total: number;
  processing: number;
  needs_review: number;
  verified: number;
  failed: number;
  by_escalation: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
  };
  workers: number;
}

export interface BatchFolderResponse {
  message: string;
  document_ids: string[];
}

export interface VerifyTask {
  id: number;
  document_id: string;
  filename: string;
  field_name: string;
  original_value: string;
  corrected_value: string | null;
  priority: 'critical' | 'low_trust';
  status: 'pending' | 'completed';
  page_number: number;
  confidence_score: number;
  error_details: string;
  polygon?: number[];
}

export interface ZoomImage {
  src: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface EscBreakdown {
  level_1: number;
  level_2: number;
  level_3: number;
  level_4: number;
}

export interface StatCardItem {
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
  pulse?: boolean;
}

export interface SummaryData {
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

export interface DemographicsData {
  class_distribution: Array<{ class: string; count: number }>;
  gender_distribution: Array<{ gender: string; count: number }>;
  age_gender_heatmap: Array<{ age: string; Male: number; Female: number; Other: number }>;
  age_distribution: Array<{ age: string; count: number }>;
}

export interface QuestionnaireData {
  reliability: Array<{ domain: string; cronbach_alpha: number; consistency: string }>;
  questions: Array<{ question_id: string; domain: string; text: string; text_hi: string; not_true: number; somewhat_true: number; certainly_true: number; total: number }>;
  domain_scores: Record<string, { mean: number; sd: number; min: number; max: number; gender_split?: Record<string, number> }>;
  clinical_distribution?: Array<{ category: string; count: number; percentage: number }>;
  academic_impact?: Record<string, { math: number; science: number; language: number; student_count: number }>;
  cohort_summary?: Array<{ class: string; cohort_size: number; consent_rate: number; mean_sdq_difficulties: number; mean_prosocial: number; mean_math: number; mean_science: number; mean_language: number }>;
}

export interface AcademicData {
  averages: Record<string, number>;
  top_vs_bottom_difficulties: { low_difficulty_group_academic: number; high_difficulty_group_academic: number } | null;
  class_averages: Array<{ class: string; Mathematics: number; Science: number; Language: number }>;
}

export interface ProcessingData {
  hourly_breakdown: Array<{ hour: string; count: number }>;
  escalation_distribution: Array<{ level: string; count: number }>;
}

export interface FieldConfData {
  field_confidence: Array<{ field: string; average: number }>;
}

export interface DataQualityData {
  documents_with_issues: number;
  needs_review: number;
  issues: Array<{ escalation_level: string; filename: string; issues: Array<{ field: string; value: string; reason: string }> }>;
  total_documents?: number;
}

export interface FeedbackItem {
  id: number;
  user_id: string;
  subject: string;
  message: string;
  attachment_path: string | null;
  attachment_type: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  user_email?: string;
}

export interface FeedbackMessage {
  id: number;
  feedback_id: number;
  user_id: string;
  message: string;
  attachment_path: string | null;
  attachment_type: string | null;
  created_at: string;
  user_email: string;
}

export type ViewMode = 'dashboard' | 'reporting' | 'analytics' | 'verify' | 'users' | 'feedback' | 'tracking';

export interface TrackingIssue {
  id: number;
  document_id: string;
  field_name: string | null;
  issue_type: string;
  severity: string;
  description: string;
  details: Record<string, any> | null;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  filename?: string;
  roll_number?: string;
}

export interface TrackingFix {
  id: number;
  document_id: string;
  field_name: string | null;
  fix_type: string;
  previous_value: string | null;
  new_value: string | null;
  triggered_by: string | null;
  created_at: string;
  filename?: string;
  roll_number?: string;
}

export interface DocumentStats {
  document_id: string;
  status: string;
  retry_count: number;
  error_message: string | null;
  escalation_level: string | null;
  filename: string | null;
  roll_number: string | null;
  created_at: string;
  issues: TrackingIssue[];
  fixes: TrackingFix[];
  metrics: Record<string, any>[] | null;
}

export interface TrackingSummary {
  total_documents: number;
  by_status: Record<string, number>;
  by_escalation: Record<string, number>;
  total_issues: number;
  resolved_issues: number;
  resolution_rate: number;
  issues_by_type: { issue_type: string; cnt: number }[];
  issues_by_severity?: { severity: string; cnt: number }[];
  total_fixes: number;
  fixes_by_type: { fix_type: string; cnt: number }[];
  documents_with_retries: number;
  total_retries: number;
}

export interface DlqEntry {
  document_id: string;
  status: string;
  retry_count: number;
  error_message: string | null;
  filename: string | null;
  roll_number: string | null;
  issue_count: number;
  fix_count: number;
  last_error_at: string | null;
}
export type TabType = 'all' | 'needs_review' | 'verified' | 'processing' | 'failed';
export type SortKey = 'filename' | 'roll_number' | 'status' | 'created_at';
export type ReportFormat = 'excel' | 'csv';

export const STATUS_REVIEW = new Set(['needs_review', 'review_required']);
export const STATUS_VERIFIED = new Set(['verified', 'approved']);
export const STATUS_PROCESSING = new Set(['processing', 'uploaded', 'queued', 'azure_completed', 'validation_completed']);
export const STATUS_FAILED = new Set(['failed']);
