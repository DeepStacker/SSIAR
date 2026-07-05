import json
import os
import sqlite3
import numpy as np
import pandas as pd
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import io

from app.database import get_db_connection

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

METADATA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "shared", "metadata", "sdq_metadata.json")

def load_metadata():
    if not os.path.exists(METADATA_PATH):
        return []
    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def calculate_cronbach_alpha(df: pd.DataFrame, items: List[str]) -> float:
    """Calculates Cronbach's Alpha for a list of questionnaire items."""
    item_df = df[items].dropna()
    if item_df.empty or len(items) < 2:
        return 0.0
    k = len(items)
    item_variances = item_df.var(ddof=1).sum()
    total_variance = item_df.sum(axis=1).var(ddof=1)
    if total_variance == 0:
        return 0.0
    alpha = (k / (k - 1)) * (1.0 - (item_variances / total_variance))
    return float(max(0.0, min(1.0, alpha)))

def get_processed_data() -> pd.DataFrame:
    """Retrieves verified form data and parses scores, domains, and demographics."""
    conn = get_db_connection()
    # Fetch verified documents with their form data
    query = """
        SELECT fd.document_id, fd.roll_number, fd.class, fd.dob, fd.gender, fd.consent, 
               fd.responses, fd.academic_scores, fd.remarks, fd.quality_report, d.status
        FROM form_data fd
        JOIN documents d ON fd.document_id = d.id
        WHERE d.status = 'verified'
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    if df.empty:
        return pd.DataFrame()

    # Parse JSON fields
    responses_list = []
    academic_list = []
    
    for idx, row in df.iterrows():
        # Responses parsing
        try:
            resp = json.loads(row["responses"]) if row["responses"] else {}
        except Exception:
            resp = {}
        # Fill missing Q1-Q25 with NaN/None
        for i in range(1, 26):
            q_key = f"q{i}"
            if q_key not in resp:
                resp[q_key] = np.nan
            else:
                try:
                    resp[q_key] = int(resp[q_key])
                except (ValueError, TypeError):
                    resp[q_key] = np.nan
        responses_list.append(resp)
        
        # Academic scores parsing
        try:
            acad = json.loads(row["academic_scores"]) if row["academic_scores"] else {}
        except Exception:
            acad = {}
            
        cleaned_acad = {}
        for subject in ["math_pct", "science_pct", "language_pct", "hindi_pct", "rank"]:
            val = acad.get(subject, "")
            # Hindi percentage fallback if not present
            if subject == "hindi_pct" and not val:
                val = acad.get("hindi", "")
            
            if val is not None and str(val).strip():
                # Strip '%' if present
                clean_str = str(val).replace("%", "").strip()
                try:
                    cleaned_acad[subject] = float(clean_str)
                except ValueError:
                    cleaned_acad[subject] = np.nan
            else:
                cleaned_acad[subject] = np.nan
        academic_list.append(cleaned_acad)

    # Combine dataframes
    resp_df = pd.DataFrame(responses_list)
    acad_df = pd.DataFrame(academic_list)
    
    final_df = pd.concat([df.drop(columns=["responses", "academic_scores"]), resp_df, acad_df], axis=1)
    
    # Calculate Age
    current_year = 2026
    def extract_age(dob_str):
        if not dob_str or not isinstance(dob_str, str):
            return np.nan
        parts = dob_str.split('/')
        if len(parts) == 3:
            try:
                birth_year = int(parts[2])
                if 1900 < birth_year < current_year:
                    return current_year - birth_year
            except ValueError:
                pass
        return np.nan
    
    final_df["age"] = final_df["dob"].apply(extract_age)
    
    # Standardize Class
    def clean_class(class_str):
        if not class_str:
            return "Unknown"
        c = str(class_str).strip()
        # standardizing common variants like '06' or 'Class 6' -> '6'
        c = c.lower().replace("class", "").replace("th", "").strip()
        if c.isdigit():
            return str(int(c))
        return c.capitalize()
        
    final_df["class_clean"] = final_df["class"].apply(clean_class)
    
    # Calculate SDQ Domain Scores dynamically from metadata
    meta = load_metadata()
    if meta:
        domains = set(item["domain"] for item in meta)
        for d in domains:
            d_items = [item["question_id"] for item in meta if item["domain"] == d]
            
            # Compute score for each row
            scores = []
            for _, row in final_df.iterrows():
                row_scores = []
                for q_id in d_items:
                    val = row.get(q_id)
                    if pd.isna(val):
                        continue
                    # Metadata rules: 1 = Not True, 2 = Somewhat, 3 = Certainly
                    meta_item = next(item for item in meta if item["question_id"] == q_id)
                    if meta_item["reverse_scored"]:
                        # 3 -> 0, 2 -> 1, 1 -> 2
                        row_scores.append(3 - val)
                    else:
                        # 1 -> 0, 2 -> 1, 3 -> 2
                        row_scores.append(val - 1)
                        
                if len(row_scores) >= 3: # allow max 2 missing items per domain
                    # Scale to 5 items if some are missing
                    scaled_score = (sum(row_scores) / len(row_scores)) * 5
                    scores.append(round(scaled_score, 1))
                else:
                    scores.append(np.nan)
                    
            final_df[f"score_{d.lower()}"] = scores
            
        # Calculate Total Difficulties (Emotional + Conduct + Hyperactivity + Peer)
        diff_domains = ["score_emotional", "score_conduct", "score_hyperactivity", "score_peer"]
        if all(f"score_{d}" in final_df.columns for d in ["emotional", "conduct", "hyperactivity", "peer"]):
            final_df["score_total_difficulties"] = final_df[diff_domains].sum(axis=1, min_count=4)
            
    return final_df

@router.get("/summary")
def get_summary_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. KPI Counts
    cursor.execute("SELECT COUNT(*) FROM documents")
    total_forms = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'verified'")
    verified_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'needs_review'")
    pending_count = cursor.fetchone()[0]
    
    # 2. Forms Processed Today
    today_str = datetime_now = datetime_str = "2026-07-04" # matching current date context
    cursor.execute("SELECT COUNT(*) FROM documents WHERE created_at LIKE ?", (f"{today_str}%",))
    processed_today = cursor.fetchone()[0]
    
    # 3. Quality & Processing metrics — only verified documents
    cursor.execute("""
        SELECT fd.confidence_scores, fd.quality_report
        FROM form_data fd
        JOIN documents d ON fd.document_id = d.id
        WHERE d.status = 'verified'
    """)
    rows = cursor.fetchall()
    
    confidences = []
    for r in rows:
        try:
            scores = json.loads(r[0]) if r[0] else {}
            ocr = scores.get("ocr", {})
            for val in ocr.values():
                if val is not None:
                    confidences.append(float(val))
        except Exception:
            pass
            
    avg_confidence = float(np.mean(confidences)) if confidences else 0.0
    
    # 4. Processing trends (Daily logs)
    cursor.execute("""
        SELECT substr(created_at, 1, 10) as day, COUNT(*) as count 
        FROM documents 
        GROUP BY day 
        ORDER BY day DESC 
        LIMIT 14
    """)
    trend_rows = cursor.fetchall()
    processing_trend = [{"date": r[0], "count": r[1]} for r in trend_rows]
    processing_trend.reverse()
    
    conn.close()
    
    # 5. Completeness & Accuracy
    df = get_processed_data()
    completeness = 100.0
    if not df.empty:
        total_cells = df.shape[0] * df.shape[1]
        missing_cells = df.isna().sum().sum()
        completeness = ((total_cells - missing_cells) / total_cells) * 100.0
        
    return {
        "total_forms": total_forms,
        "verified_forms": verified_count,
        "pending_review": pending_count,
        "processed_today": processed_today,
        "average_confidence": round(avg_confidence * 100, 1),
        "data_completeness": round(completeness, 1),
        "processing_trend": processing_trend
    }

@router.get("/demographics")
def get_demographics_analytics():
    df = get_processed_data()
    if df.empty:
        return {
            "class_distribution": [],
            "gender_distribution": [],
            "age_distribution": [],
            "age_gender_heatmap": []
        }
        
    # Class Distribution
    class_counts = df["class_clean"].value_counts()
    class_dist = [{"class": k, "count": int(v)} for k, v in class_counts.items()]
    class_dist.sort(key=lambda x: x["class"])
    
    # Gender Distribution
    gender_counts = df["gender"].fillna("Unknown").value_counts()
    gender_dist = [{"gender": k if k else "Unknown", "count": int(v)} for k, v in gender_counts.items()]
    
    # Age Distribution
    age_counts = df["age"].dropna().astype(int).value_counts()
    age_dist = [{"age": f"{k} Years", "count": int(v)} for k, v in age_counts.items()]
    age_dist.sort(key=lambda x: int(x["age"].split()[0]))
    
    # Age x Gender Heatmap
    heatmap = []
    genders = ["Male", "Female", "Other"]
    ages = sorted(df["age"].dropna().unique())
    for age in ages:
        age_str = f"{int(age)} Years"
        row_data = {"age": age_str}
        for g in genders:
            count = len(df[(df["age"] == age) & (df["gender"] == g)])
            row_data[g] = count
        heatmap.append(row_data)
        
    return {
        "class_distribution": class_dist,
        "gender_distribution": gender_dist,
        "age_distribution": age_dist,
        "age_gender_heatmap": heatmap
    }

@router.get("/questionnaire")
def get_questionnaire_analytics():
    df = get_processed_data()
    meta = load_metadata()
    if df.empty or not meta:
        return {
            "questions": [],
            "domain_scores": {},
            "reliability": []
        }
        
    # 1. Option distributions per question
    questions_dist = []
    option_labels = {1: "Not True", 2: "Somewhat True", 3: "Certainly True"}
    
    for item in meta:
        q_id = item["question_id"]
        counts = df[q_id].value_counts()
        dist = {
            "question_id": q_id,
            "text": item["text_en"],
            "text_hi": item["text_hi"],
            "domain": item["domain"],
            "not_true": int(counts.get(1, 0)),
            "somewhat_true": int(counts.get(2, 0)),
            "certainly_true": int(counts.get(3, 0))
        }
        total = sum([dist["not_true"], dist["somewhat_true"], dist["certainly_true"]])
        dist["total"] = total
        questions_dist.append(dist)
        
    # 2. Domain statistics
    domains = set(item["domain"] for item in meta)
    domain_stats = {}
    reliability = []
    
    for d in domains:
        col_name = f"score_{d.lower()}"
        if col_name in df.columns:
            sub_df = df[col_name].dropna()
            
            # Descriptive stats
            domain_stats[d] = {
                "mean": round(float(sub_df.mean()), 2) if not sub_df.empty else 0.0,
                "median": round(float(sub_df.median()), 2) if not sub_df.empty else 0.0,
                "sd": round(float(sub_df.std()), 2) if len(sub_df) > 1 else 0.0,
                "min": float(sub_df.min()) if not sub_df.empty else 0.0,
                "max": float(sub_df.max()) if not sub_df.empty else 0.0,
            }
            
            # Splits (Gender & Class averages)
            g_avgs = df.groupby("gender")[col_name].mean().round(2).to_dict()
            c_avgs = df.groupby("class_clean")[col_name].mean().round(2).to_dict()
            domain_stats[d]["gender_split"] = [{"gender": k, "score": v} for k, v in g_avgs.items()]
            domain_stats[d]["class_split"] = [{"class": k, "score": v} for k, v in c_avgs.items()]
            
            # Cronbach's Alpha
            d_items = [item["question_id"] for item in meta if item["domain"] == d]
            alpha = calculate_cronbach_alpha(df, d_items)
            reliability.append({
                "domain": d,
                "items_count": len(d_items),
                "cronbach_alpha": round(alpha, 3),
                "consistency": "Good" if alpha >= 0.7 else ("Acceptable" if alpha >= 0.6 else "Poor")
            })

    return {
        "questions": questions_dist,
        "domain_scores": domain_stats,
        "reliability": reliability
    }

@router.get("/academic")
def get_academic_analytics():
    df = get_processed_data()
    if df.empty:
        return {
            "averages": {},
            "class_averages": [],
            "top_vs_bottom_difficulties": {}
        }
        
    subjects = ["math_pct", "science_pct", "language_pct", "hindi_pct"]
    subject_labels = {"math_pct": "Mathematics", "science_pct": "Science", "language_pct": "Language", "hindi_pct": "Hindi"}
    
    averages = {}
    for sub in subjects:
        if sub in df.columns:
            sub_df = df[sub].dropna()
            averages[subject_labels[sub]] = round(float(sub_df.mean()), 1) if not sub_df.empty else 0.0
            
    # Class splits
    class_averages = []
    classes = sorted(df["class_clean"].unique())
    for c in classes:
        c_df = df[df["class_clean"] == c]
        row = {"class": c}
        for sub in subjects:
            if sub in c_df.columns:
                sub_df = c_df[sub].dropna()
                row[subject_labels[sub]] = round(float(sub_df.mean()), 1) if not sub_df.empty else 0.0
        class_averages.append(row)
        
    # Top 10% vs Bottom 10% averages
    top_bottom = {}
    if "score_total_difficulties" in df.columns:
        valid_df = df.dropna(subset=["score_total_difficulties"])
        if len(valid_df) >= 5:
            q_low = valid_df["score_total_difficulties"].quantile(0.10)
            q_high = valid_df["score_total_difficulties"].quantile(0.90)
            
            low_diff_df = valid_df[valid_df["score_total_difficulties"] <= q_low]
            high_diff_df = valid_df[valid_df["score_total_difficulties"] >= q_high]
            
            top_bottom = {
                "low_difficulty_group_academic": round(float(low_diff_df[subjects].mean(axis=1).mean()), 1),
                "high_difficulty_group_academic": round(float(high_diff_df[subjects].mean(axis=1).mean()), 1)
            }
            
    return {
        "averages": averages,
        "class_averages": class_averages,
        "top_vs_bottom_difficulties": top_bottom
    }

@router.get("/correlations")
def get_correlations_analytics():
    df = get_processed_data()
    if df.empty:
        return {"correlation_matrix": []}
        
    domains = ["score_prosocial", "score_emotional", "score_conduct", "score_hyperactivity", "score_peer"]
    domain_labels = {
        "score_prosocial": "Prosocial",
        "score_emotional": "Emotional",
        "score_conduct": "Conduct",
        "score_hyperactivity": "Hyperactivity",
        "score_peer": "Peer Difficulty"
    }
    
    subjects = ["math_pct", "science_pct", "language_pct", "hindi_pct", "rank"]
    subject_labels = {
        "math_pct": "Math %",
        "science_pct": "Science %",
        "language_pct": "Language %",
        "hindi_pct": "Hindi %",
        "rank": "Rank"
    }
    
    matrix = []
    
    # Calculate Pearson correlations
    for dom in domains:
        if dom not in df.columns:
            continue
        row_data = {"domain": domain_labels[dom]}
        for sub in subjects:
            if sub not in df.columns:
                row_data[subject_labels[sub]] = 0.0
                continue
            
            # Align values and drop NaNs
            aligned = df[[dom, sub]].dropna()
            if len(aligned) >= 3:
                r_val = float(aligned[dom].corr(aligned[sub], method="pearson"))
                row_data[subject_labels[sub]] = round(r_val, 3) if not np.isnan(r_val) else 0.0
            else:
                row_data[subject_labels[sub]] = 0.0
        matrix.append(row_data)
        
    return {
        "correlation_matrix": matrix
    }

@router.get("/outliers")
def get_outliers():
    df = get_processed_data()
    if df.empty:
        return {"outliers": []}
        
    outliers = []
    
    # Outlier 1: High Hyperactivity but High Academic Performance
    if "score_hyperactivity" in df.columns and "math_pct" in df.columns:
        high_hyp_high_math = df[(df["score_hyperactivity"] >= 7.0) & (df["math_pct"] >= 85.0)]
        for _, r in high_hyp_high_math.iterrows():
            outliers.append({
                "roll_number": r["roll_number"],
                "class": r["class_clean"],
                "gender": r["gender"],
                "metric_type": "High Hyperactivity & High Math Marks",
                "value": f"Hyperactivity: {r['score_hyperactivity']}/10, Math: {r['math_pct']}%"
            })
            
    # Outlier 2: High Emotional Symptoms but High Rank
    if "score_emotional" in df.columns and "rank" in df.columns:
        high_emot_high_rank = df[(df["score_emotional"] >= 7.0) & (df["rank"] <= 5.0)]
        for _, r in high_emot_high_rank.iterrows():
            outliers.append({
                "roll_number": r["roll_number"],
                "class": r["class_clean"],
                "gender": r["gender"],
                "metric_type": "High Emotional Distress & Top Rank",
                "value": f"Emotional: {r['score_emotional']}/10, Rank: #{int(r['rank'])}"
            })
            
    # Outlier 3: Very Low Prosocial Behavior but High Class Averages
    if "score_prosocial" in df.columns and "science_pct" in df.columns:
        low_pro_high_sci = df[(df["score_prosocial"] <= 3.0) & (df["science_pct"] >= 85.0)]
        for _, r in low_pro_high_sci.iterrows():
            outliers.append({
                "roll_number": r["roll_number"],
                "class": r["class_clean"],
                "gender": r["gender"],
                "metric_type": "Low Prosociality & High Science Marks",
                "value": f"Prosocial: {r['score_prosocial']}/10, Science: {r['science_pct']}%"
            })

    return {"outliers": outliers[:10]} # Limit to top 10 Outliers for presentation

@router.get("/processing")
def get_processing_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Processed today — per-hour breakdown
    today_str = "2026-07-04"
    cursor.execute("""
        SELECT substr(created_at, 12, 2) as hour, COUNT(*) as count
        FROM documents
        WHERE created_at LIKE ?
        GROUP BY hour
        ORDER BY hour
    """, (f"{today_str}%",))
    hourly = cursor.fetchall()
    hourly_breakdown = [{"hour": f"{r[0]}:00", "count": r[1]} for r in hourly]

    # Escalation level (quality) distribution
    cursor.execute("""
        SELECT fd.escalation_level, COUNT(*) as count
        FROM form_data fd
        JOIN documents d ON fd.document_id = d.id
        WHERE d.status = 'verified'
        GROUP BY fd.escalation_level
    """)
    escalation_rows = cursor.fetchall()
    escalation_dist = [{"level": r[0] or "unknown", "count": r[1]} for r in escalation_rows]

    conn.close()

    return {
        "hourly_breakdown": hourly_breakdown,
        "escalation_distribution": escalation_dist
    }


def _is_garbage_value(field: str, value: str) -> str | None:
    """Returns a reason string if the value is clearly garbage OCR, else None."""
    if not value or not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None

    length = len(stripped)
    digit_count = sum(c.isdigit() for c in stripped)

    # Fields with known reasonable max lengths
    max_lens = {"roll_number": 15, "class": 3, "dob": 12, "gender": 2}
    # Class should be 1-12 (or similar small integer)
    if field == "class" and stripped.isdigit() and len(stripped) <= 3:
        val = int(stripped)
        if val < 1 or val > 12:
            return f"Class value {val} outside valid range 1-12"
    if field in max_lens and length > max_lens[field]:
        return f"Length {length} exceeds max {max_lens[field]} for {field}"

    # Fields that should be mostly non-digit
    text_fields = {"gender"}
    if field in text_fields and digit_count > length * 0.7:
        return f"Value is ~{digit_count / length * 100:.0f}% digits for {field}"
    # DOB should match DD/MM/YYYY pattern; flag if it's a solid digit block without separators
    if field == "dob" and "/" not in stripped and length >= 6 and digit_count == length:
        return f"DOB is a solid digit block (no date separators)"

    # Repeated character pattern (e.g. "8888888888")
    if length >= 6:
        unique = len(set(stripped))
        if unique <= 2:
            return f"Highly repetitive value ({unique} unique chars)"

    return None


def _collect_garbage_docs() -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.id, d.filename, d.status, d.escalation_level,
               f.roll_number, f.class, f.dob, f.gender
        FROM documents d
        LEFT JOIN form_data f ON d.id = f.document_id
        WHERE d.status IN ('needs_review', 'verified')
        ORDER BY d.created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        doc_id, filename, status, escalation = row[:4]
        fields = {"roll_number": row[4], "class": row[5], "dob": row[6], "gender": row[7]}
        issues = []
        for fname, fval in fields.items():
            reason = _is_garbage_value(fname, fval)
            if reason:
                issues.append({"field": fname, "value": str(fval)[:60], "reason": reason})
        if issues:
            results.append({
                "doc_id": doc_id,
                "filename": filename,
                "status": status,
                "escalation_level": escalation,
                "issues": issues,
            })
    return results


@router.get("/data-quality")
def get_data_quality():
    garbage = _collect_garbage_docs()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'needs_review'")
    needs_review = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM documents")
    total = cursor.fetchone()[0]
    conn.close()
    return {
        "total_documents": total,
        "needs_review": needs_review,
        "documents_with_issues": len(garbage),
        "issues": garbage[:50],
    }


@router.get("/per-field-confidence")
def get_per_field_confidence():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT fd.confidence_scores
        FROM form_data fd
        JOIN documents d ON fd.document_id = d.id
        WHERE d.status = 'verified'
    """)
    rows = cursor.fetchall()

    field_confs: Dict[str, list] = {}
    for r in rows:
        try:
            scores = json.loads(r[0]) if r[0] else {}
            ocr = scores.get("ocr", {})
            for field, conf in ocr.items():
                if conf is not None:
                    field_confs.setdefault(field, []).append(float(conf))
        except Exception:
            pass

    conn.close()

    field_stats = []
    for field, vals in field_confs.items():
        if not vals:
            continue
        field_stats.append({
            "field": field,
            "average": round(float(np.mean(vals)) * 100, 1),
            "min": round(float(np.min(vals)) * 100, 1),
            "max": round(float(np.max(vals)) * 100, 1),
            "count": len(vals),
        })
    field_stats.sort(key=lambda x: x["average"])

    return {"field_confidence": field_stats}


@router.get("/export/{format_type}")
def export_research_data(format_type: str):
    df = get_processed_data()
    if df.empty:
        raise HTTPException(status_code=400, detail="No verified form data to export.")
        
    # Columns to include
    meta = load_metadata()
    q_cols = [item["question_id"] for item in meta] if meta else []
    dom_cols = [f"score_{d.lower()}" for d in ["prosocial", "emotional", "conduct", "hyperactivity", "peer", "total_difficulties"]]
    dom_cols = [c for c in dom_cols if c in df.columns]
    acad_cols = ["math_pct", "science_pct", "language_pct", "hindi_pct", "rank"]
    acad_cols = [c for c in acad_cols if c in df.columns]
    
    export_cols = ["roll_number", "class_clean", "gender", "age", "consent"] + q_cols + dom_cols + acad_cols
    export_df = df[export_cols].copy()
    
    # Generate files depending on format
    output = io.BytesIO()
    
    if format_type == "csv":
        export_df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=ssiar_research_export.csv"}
        )
    elif format_type == "excel":
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            export_df.to_excel(writer, sheet_name="SDQ Data", index=False)
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=ssiar_research_export.xlsx"}
        )
    elif format_type == "spss":
        # SPSS compliant CSV (with specific headers)
        export_df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=ssiar_spss_import.csv"}
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format_type}")
