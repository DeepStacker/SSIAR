import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Clipboard, Download } from 'lucide-react';
import { api } from '@/api';

interface Props {
  classFilter: string;
  genderFilter: string;
}

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

const spssSyntax = `* SSIAR SPSS Import and Labeling Syntax.
GET DATA  /TYPE=TXT
  /FILE="ssiar_spss_import.csv"
  /DELCASE=LINE
  /DELIMITERS=","
  /ARRANGEMENT=DELIMITED
  /FIRSTCASE=2
  /IMPORTCASE=ALL.

VARIABLE LABELS
  roll_number "Student Roll Number"
  class_clean "Normalized Class Grade"
  score_prosocial "Prosocial Scale Score"
  score_emotional "Emotional Scale Score"
  score_conduct "Conduct Problems Score"
  score_hyperactivity "Hyperactivity/Inattention Score"
  score_peer "Peer Difficulties Score"
  score_total_difficulties "Total Difficulties Score (SDQ)"
  math_pct "Mathematics Score (%)"
  science_pct "Science Score (%)"
  language_pct "Language Score (%)".`;

export function ExportSection({ classFilter, genderFilter }: Props) {
  const [rCopied, setRCopied] = useState(false);
  const [spssCopied, setSpssCopied] = useState(false);

  return (
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
          className="glass-card rounded-xl flex flex-col items-center gap-3 p-6 text-center no-underline transition-all hover:-translate-y-0.5 hover:shadow-md animate-chart-enter"
          style={{ animationDelay: '0ms' }}
        >
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-violet)]/10 flex items-center justify-center">
            <Download className="w-6 h-6" style={{ color: 'var(--accent-violet)' }} />
          </div>
          <span className="text-sm font-bold text-[var(--text-primary)]">Standard CSV Format</span>
          <span className="text-xs text-[var(--text-secondary)] leading-relaxed">Flat variable list suitable for generic spreadsheets.</span>
        </a>

        <a
          href={api.getResearchExportUrl("excel", { class: classFilter, gender: genderFilter })}
          className="glass-card rounded-xl flex flex-col items-center gap-3 p-6 text-center no-underline transition-all hover:-translate-y-0.5 hover:shadow-md animate-chart-enter"
          style={{ animationDelay: '80ms' }}
        >
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-emerald)]/10 flex items-center justify-center">
            <Download className="w-6 h-6" style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <span className="text-sm font-bold text-[var(--text-primary)]">Excel Spreadsheet</span>
          <span className="text-xs text-[var(--text-secondary)] leading-relaxed">Formatted workbook with domain averages.</span>
        </a>

        <a
          href={api.getResearchExportUrl("spss", { class: classFilter, gender: genderFilter })}
          className="glass-card rounded-xl flex flex-col items-center gap-3 p-6 text-center no-underline transition-all hover:-translate-y-0.5 hover:shadow-md animate-chart-enter"
          style={{ animationDelay: '160ms' }}
        >
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-violet)]/10 flex items-center justify-center">
            <Download className="w-6 h-6" style={{ color: 'var(--accent-violet)' }} />
          </div>
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
  );
}
