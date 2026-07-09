import json
import os
import sqlite3
import numpy as np
import pandas as pd
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
import io

from datetime import date

from app.database import get_db_connection
from app.auth import require_auth, get_current_user_id

router = APIRouter(prefix="/api/analytics", tags=["analytics"], dependencies=[Depends(require_auth)])

def find_metadata_path():
    path1 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "shared", "metadata", "sdq_metadata.json"))
    if os.path.exists(path1):
        return path1
    path2 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "shared", "metadata", "sdq_metadata.json"))
    if os.path.exists(path2):
        return path2
    return path1

def load_metadata():
    path = find_metadata_path()
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
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

def get_processed_data(class_filter=None, gender_filter=None, date_from=None, date_to=None, statuses=("verified",)) -> pd.DataFrame:
    """Retrieves form data for the given statuses (default: verified only) and parses scores, domains, and demographics."""
    uid = get_current_user_id()
    conn = get_db_connection()
    # Build status placeholders for IN clause
    placeholders = ",".join("?" for _ in statuses)
    query = f"""
        SELECT fd.document_id, fd.roll_number, fd.class, fd.dob, fd.gender, fd.consent, 
               fd.responses, fd.academic_scores, fd.remarks, fd.quality_report, fd.confidence_scores, d.status
        FROM form_data fd
        JOIN documents d ON fd.document_id = d.id
        WHERE d.status IN ({placeholders})
    """
    params = list(statuses)

    if uid:
        query += " AND d.user_id = ?"
        params.append(uid)
    if class_filter:
        query += " AND fd.class = ?"
        params.append(class_filter)
    if gender_filter:
        query += " AND fd.gender = ?"
        params.append(gender_filter)
    if date_from:
        query += " AND d.created_at >= ?"
        params.append(date_from + "T00:00:00")
    if date_to:
        query += " AND d.created_at <= ?"
        params.append(date_to + "T23:59:59")

    df = pd.read_sql_query(query, conn, params=params)
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
        for subject in ["math_pct", "science_pct", "language_pct", "rank"]:
            val = acad.get(subject, "")
            
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
    current_year = date.today().year
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
def get_summary_stats(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Build filter conditions
        uid = get_current_user_id()
        doc_filters = []
        doc_params = []
        fd_join = ""
        
        if uid:
            doc_filters.append("d.user_id = ?")
            doc_params.append(uid)
        
        if class_filter or gender:
            fd_join = " LEFT JOIN form_data fd ON d.id = fd.document_id"
        
        if class_filter:
            doc_filters.append("fd.class = ?")
            doc_params.append(class_filter)
        if gender:
            doc_filters.append("fd.gender = ?")
            doc_params.append(gender)
        if date_from:
            doc_filters.append("d.created_at >= ?")
            doc_params.append(date_from + "T00:00:00")
        if date_to:
            doc_filters.append("d.created_at <= ?")
            doc_params.append(date_to + "T23:59:59")
        
        where_extra = " AND " + " AND ".join(doc_filters) if doc_filters else ""
        
        # 1. KPI Counts
        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE 1=1{where_extra}", doc_params)
        total_forms = cursor.fetchone()[0]
        
        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE d.status = 'verified'{where_extra}", doc_params)
        verified_count = cursor.fetchone()[0]
        
        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE d.status = 'needs_review'{where_extra}", doc_params)
        pending_count = cursor.fetchone()[0]
        
        # 2. Forms Processed Today
        today_str = date.today().isoformat()
        today_filters = [f"d.created_at LIKE ?"] + doc_filters
        today_params = [f"{today_str}%"] + doc_params
        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE 1=1 AND " + " AND ".join(today_filters), today_params)
        processed_today = cursor.fetchone()[0]
        
        # 3. Quality & Processing metrics — verified + needs_review (all reviewed docs)
        quality_filters = ["d.status IN ('verified', 'needs_review')"]
        quality_params = []
        if uid:
            quality_filters.append("d.user_id = ?")
            quality_params.append(uid)
        if class_filter:
            quality_filters.append("fd.class = ?")
            quality_params.append(class_filter)
        if gender:
            quality_filters.append("fd.gender = ?")
            quality_params.append(gender)
        if date_from:
            quality_filters.append("d.created_at >= ?")
            quality_params.append(date_from + "T00:00:00")
        if date_to:
            quality_filters.append("d.created_at <= ?")
            quality_params.append(date_to + "T23:59:59")
        
        cursor.execute(f"""
            SELECT fd.confidence_scores, fd.quality_report
            FROM form_data fd
            JOIN documents d ON fd.document_id = d.id
            WHERE {" AND ".join(quality_filters)}
        """, quality_params)
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
        cursor.execute(f"""
            SELECT substr(d.created_at, 1, 10) as day, COUNT(*) as count 
            FROM documents d{fd_join}
            WHERE 1=1{where_extra}
            GROUP BY day 
            ORDER BY day DESC 
            LIMIT 14
        """, doc_params)
        trend_rows = cursor.fetchall()
        processing_trend = [{"date": r[0], "count": r[1]} for r in trend_rows]
        processing_trend.reverse()

        # Throughput: forms per minute across the trend window (default 14 days)
        trend_window_days = max(1, len(processing_trend))
        trend_total = sum(d["count"] for d in processing_trend) if processing_trend else 0
        throughput_forms_per_min = round(trend_total / (trend_window_days * 24 * 60), 4) if trend_total else 0.0

        conn.close()
        
        # 5. Completeness & Accuracy — computed over required demographics + academic scores only
        # (NOT q1..q25 since some questions may legitimately be unanswered)
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to)
        completeness = 100.0
        if not df.empty:
            required_cols = ["roll_number", "class_clean", "gender", "math_pct", "science_pct", "language_pct", "rank"]
            available_required = [c for c in required_cols if c in df.columns]
            if available_required:
                sub = df[available_required]
                total_cells = sub.shape[0] * sub.shape[1]
                missing_cells = sub.isna().sum().sum()
                completeness = ((total_cells - missing_cells) / total_cells) * 100.0
            else:
                completeness = 0.0
            
        return {
            "total_forms": total_forms,
            "verified_forms": verified_count,
            "needs_review": pending_count,
            "processed_today": processed_today,
            "average_confidence": round(avg_confidence * 100, 1),
            "data_completeness": round(completeness, 1),
            "processing_trend": processing_trend,
            "throughput_forms_per_min": throughput_forms_per_min,
            "throughput_window_days": trend_window_days
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics summary failed: {str(e)}")

@router.get("/demographics")
def get_demographics_analytics(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to)
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
        genders = ["M", "F", "O"]
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demographics analytics failed: {str(e)}")

get_demographics_data = get_demographics_analytics

@router.get("/questionnaire")
def get_questionnaire_analytics(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Questionnaire analytics failed: {str(e)}")

@router.get("/academic")
def get_academic_analytics(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to)
        if df.empty:
            return {
                "averages": {},
                "class_averages": [],
                "top_vs_bottom_difficulties": {}
            }
            
        subjects = ["math_pct", "science_pct", "language_pct"]
        subject_labels = {"math_pct": "Mathematics", "science_pct": "Science", "language_pct": "Language"}
        
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Academic analytics failed: {str(e)}")

@router.get("/insights")
async def get_insights():
    """
    Returns auto-generated text insights about the data.
    """
    try:
        summary = get_summary_stats()
        demo = get_demographics_data()
        acad = get_academic_analytics()
        
        insights = []
        
        # Total forms insight
        insights.append(f"Total of {summary['total_forms']} forms have been processed, with {summary['verified_forms']} verified ({round(summary['verified_forms']/max(summary['total_forms'],1)*100)}%).")
        
        # Confidence insight
        insights.append(f"Average OCR confidence is {summary['average_confidence']:.1f}%.")
        
        # Completeness insight
        if summary['data_completeness'] < 80:
            insights.append(f"Data completeness is {summary['data_completeness']:.1f}%, which needs improvement.")
        else:
            insights.append(f"Data completeness is {summary['data_completeness']:.1f}%, indicating good quality.")
        
        # Gender distribution insight
        if demo and demo.get('gender_distribution'):
            total_gender = sum(g['count'] for g in demo['gender_distribution'])
            for g in demo['gender_distribution']:
                pct = round(g['count'] / max(total_gender, 1) * 100)
                insights.append(f"{g['gender']} students: {g['count']} ({pct}%).")
        
        # Class distribution insight
        if demo and demo.get('class_distribution'):
            max_class = max(demo['class_distribution'], key=lambda x: x['count'])
            insights.append(f"Most students are in Class {max_class['class']} ({max_class['count']} students).")
        
        # Academic insight
        if acad and acad.get('averages'):
            best_subject = max(acad['averages'], key=lambda k: acad['averages'][k] or 0)
            worst_subject = min(acad['averages'], key=lambda k: acad['averages'][k] or float('inf'))
            insights.append(f"Students perform best in {best_subject} ({acad['averages'][best_subject]:.1f}%) and need most improvement in {worst_subject} ({acad['averages'][worst_subject]:.1f}%).")
        
        return {"insights": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")

@router.get("/correlations")
def get_correlations_analytics(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to)
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
        
        subjects = ["math_pct", "science_pct", "language_pct", "rank"]
        subject_labels = {
            "math_pct": "Math %",
            "science_pct": "Science %",
            "language_pct": "Language %",
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Correlations analytics failed: {str(e)}")

@router.get("/outliers")
def get_outliers(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to)
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Outliers analytics failed: {str(e)}")

@router.get("/processing")
def get_processing_analytics(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        uid = get_current_user_id()

        # Processed today — per-hour breakdown
        today_str = date.today().isoformat()
        if uid:
            cursor.execute("""
                SELECT substr(created_at, 12, 2) as hour, COUNT(*) as count
                FROM documents
                WHERE created_at LIKE ? AND user_id = ?
                GROUP BY hour
                ORDER BY hour
            """, (f"{today_str}%", uid))
        else:
            cursor.execute("""
                SELECT substr(created_at, 12, 2) as hour, COUNT(*) as count
                FROM documents
                WHERE created_at LIKE ?
                GROUP BY hour
                ORDER BY hour
            """, (f"{today_str}%",))

        hourly = cursor.fetchall()
        hourly_breakdown = [{"hour": f"{r[0]}:00", "count": r[1]} for r in hourly]

        # Escalation level distribution across ALL documents (escalation_level lives on documents, NOT form_data)
        if uid:
            cursor.execute("""
                SELECT escalation_level, COUNT(*) as count
                FROM documents
                WHERE user_id = ?
                GROUP BY escalation_level
            """, (uid,))
        else:
            cursor.execute("""
                SELECT escalation_level, COUNT(*) as count
                FROM documents
                GROUP BY escalation_level
            """)
        escalation_rows = cursor.fetchall()
        # Ensure all four levels are present even if zero
        level_counts = {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
        for r in escalation_rows:
            lev = r[0] or "level_1"
            if lev in level_counts:
                level_counts[lev] = r[1]
        escalation_dist = [{"level": k, "count": v} for k, v in level_counts.items()]

        # Status distribution for context (so frontend can show scope)
        if uid:
            cursor.execute("""
                SELECT status, COUNT(*) as count
                FROM documents
                WHERE user_id = ?
                GROUP BY status
            """, (uid,))
        else:
            cursor.execute("""
                SELECT status, COUNT(*) as count
                FROM documents
                GROUP BY status
            """)
        status_rows = cursor.fetchall()
        status_counts = {r[0]: r[1] for r in status_rows}

        conn.close()

        return {
            "hourly_breakdown": hourly_breakdown,
            "escalation_distribution": escalation_dist,
            "status_distribution": status_counts,
            "scope": "all_documents"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing analytics failed: {str(e)}")


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
    uid = get_current_user_id()
    conn = get_db_connection()
    cursor = conn.cursor()
    if uid:
        cursor.execute("""
            SELECT d.id, d.filename, d.status, d.escalation_level,
                   f.roll_number, f.class, f.dob, f.gender
            FROM documents d
            LEFT JOIN form_data f ON d.id = f.document_id
            WHERE d.status IN ('needs_review', 'verified') AND d.user_id = ?
            ORDER BY d.created_at DESC
        """, (uid,))
    else:
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
def get_data_quality(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        uid = get_current_user_id()
        garbage = _collect_garbage_docs()
        conn = get_db_connection()
        cursor = conn.cursor()
        if uid:
            cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'needs_review' AND user_id = ?", (uid,))
        else:
            cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'needs_review'")
        needs_review = cursor.fetchone()[0]
        if uid:
            cursor.execute("SELECT COUNT(*) FROM documents WHERE user_id = ?", (uid,))
        else:
            cursor.execute("SELECT COUNT(*) FROM documents")
        total = cursor.fetchone()[0]

        # Count partial forms (verified docs missing any of the 25 SDQ responses)
        partial_forms = 0
        try:
            if uid:
                cursor.execute("""
                    SELECT responses FROM form_data fd
                    JOIN documents d ON fd.document_id = d.id
                    WHERE d.status IN ('verified', 'needs_review') AND d.user_id = ?
                """, (uid,))
            else:
                cursor.execute("""
                    SELECT responses FROM form_data fd
                    JOIN documents d ON fd.document_id = d.id
                    WHERE d.status IN ('verified', 'needs_review')
                """)
            for row in cursor.fetchall():
                try:
                    resp = json.loads(row[0]) if row[0] else {}
                    answered = sum(1 for v in resp.values() if v not in (None, "", "nan"))
                    if answered < 25:
                        partial_forms += 1
                except Exception:
                    pass
        except Exception:
            pass

        conn.close()
        return {
            "total_documents": total,
            "needs_review": needs_review,
            "documents_with_issues": len(garbage),
            "partial_forms": partial_forms,
            "issues": garbage[:50],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data quality analytics failed: {str(e)}")


@router.get("/per-field-confidence")
def get_per_field_confidence(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        uid = get_current_user_id()
        conn = get_db_connection()
        cursor = conn.cursor()

        if uid:
            cursor.execute("""
                SELECT fd.confidence_scores
                FROM form_data fd
                JOIN documents d ON fd.document_id = d.id
                WHERE d.status IN ('verified', 'needs_review') AND d.user_id = ?
            """, (uid,))
        else:
            cursor.execute("""
                SELECT fd.confidence_scores
                FROM form_data fd
                JOIN documents d ON fd.document_id = d.id
                WHERE d.status IN ('verified', 'needs_review')
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Per-field confidence analytics failed: {str(e)}")


@router.get("/export/{format_type}")
def export_research_data(
    format_type: str,
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
    columns: str = Query(None, alias="columns"),
    include_needs_review: bool = Query(False, description="Include needs_review docs alongside verified"),
):
    try:
        statuses = ("verified", "needs_review") if include_needs_review else ("verified",)
        df = get_processed_data(class_filter=class_filter, gender_filter=gender, date_from=date_from, date_to=date_to, statuses=statuses)
        if df.empty:
            raise HTTPException(status_code=400, detail="No form data to export. (Use include_needs_review=true to also export needs_review docs.)")
            
        # Columns to include
        meta = load_metadata()
        q_cols = [item["question_id"] for item in meta] if meta else []
        dom_cols = [f"score_{d.lower()}" for d in ["prosocial", "emotional", "conduct", "hyperactivity", "peer", "total_difficulties"]]
        dom_cols = [c for c in dom_cols if c in df.columns]
        acad_cols = ["math_pct", "science_pct", "language_pct", "rank"]
        acad_cols = [c for c in acad_cols if c in df.columns]
        
        export_cols = ["roll_number", "class_clean", "gender", "age", "consent"] + q_cols + dom_cols + acad_cols
        export_df = df[export_cols].copy()
        
        # Helper to map raw response digits to text labels with scores
        def map_response_to_text(val, is_reverse):
            if pd.isna(val) or val is None:
                return "अनुत्तरित"
            val_str = str(val).strip()
            digits = []
            if val_str.startswith("[") and val_str.endswith("]"):
                try:
                    import ast
                    parsed = ast.literal_eval(val_str)
                    if isinstance(parsed, (list, tuple)):
                        digits = [int(x) for x in parsed]
                except Exception:
                    pass
            elif "," in val_str:
                try:
                    digits = [int(x.strip()) for x in val_str.split(",") if x.strip().isdigit()]
                except Exception:
                    pass
            else:
                try:
                    digits = [int(float(val_str))]
                except Exception:
                    pass
            if not digits:
                return "अनुत्तरित"
            labels = {
                1: "सही नहीं",
                2: "कुछ-कुछ सही",
                3: "बिल्कुल सही"
            }
            result_parts = []
            for d in digits:
                lbl = labels.get(d, f"अज्ञात ({d})")
                if d in (1, 2, 3):
                    score = (3 - d) if is_reverse else (d - 1)
                    result_parts.append(f"{lbl} ({score})")
                else:
                    result_parts.append(lbl)
            return ", ".join(result_parts)

        # Helper to map raw response digits to text labels with scores for Sheet 2 (Scored Data)
        def map_text_to_score(val_str, is_reverse):
            if pd.isna(val_str) or val_str is None:
                return ""
            val_str = str(val_str).strip()
            if not val_str:
                return ""
            mapping = {
                "सच नहीं": 2 if is_reverse else 0,
                "कुछ हद तक सच है": 1,
                "सही में सच है": 0 if is_reverse else 2
            }
            parts = [p.strip() for p in val_str.split(",")]
            scores = []
            for p in parts:
                if p in mapping:
                    scores.append(str(mapping[p]))
                else:
                    try:
                        clean_p = p.split("(")[0].strip()
                        if clean_p in mapping:
                            scores.append(str(mapping[clean_p]))
                        elif clean_p.isdigit():
                            d = int(clean_p)
                            score = (3 - d) if is_reverse else (d - 1)
                            scores.append(str(score))
                    except Exception:
                        pass
            if not scores:
                return ""
            return ", ".join(scores)

        # Apply response mapping to Sheet 1 (Extracted Data)
        for item in meta:
            q_id = item["question_id"]
            if q_id in export_df.columns:
                is_reverse = item.get("reverse_scored", False)
                export_df[q_id] = export_df[q_id].apply(lambda v: map_response_to_text(v, is_reverse))

        # Build Sheet 2 (Scored Data)
        scored_df = export_df.copy()
        for item in meta:
            q_id = item["question_id"]
            if q_id in scored_df.columns:
                is_reverse = item.get("reverse_scored", False)
                scored_df[q_id] = scored_df[q_id].apply(lambda v: map_text_to_score(v, is_reverse))

        # Rename question columns in Sheet 1 to show question text
        rename_map = {}
        for item in meta:
            q_id = item["question_id"]
            text_en = item.get("text_en", "")
            rename_map[q_id] = f"{q_id.upper()}: {text_en}"
        export_df = export_df.rename(columns=rename_map)

        # If columns param is provided, filter to only those columns (comma-separated)
        if columns:
            requested_cols = [c.strip() for c in columns.split(",")]
            # Match columns either by their raw name or renamed name
            valid_cols = []
            for c in requested_cols:
                mapped_name = rename_map.get(c, c)
                if mapped_name in export_df.columns:
                    valid_cols.append(mapped_name)
            if valid_cols:
                export_df = export_df[valid_cols]
        
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
            # Map column names back to original fields for conditional formatting
            header_to_orig_field = {}
            for item in meta:
                q_id = item["question_id"]
                text_en = item.get("text_en", "")
                header_to_orig_field[f"{q_id.upper()}: {text_en}"] = q_id
            header_to_orig_field["class_clean"] = "class"
            
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                # Write Sheet 1 (Extracted Data)
                export_df.to_excel(writer, sheet_name="Extracted Data", index=False)
                # Write Sheet 2 (Scored Data)
                scored_df.to_excel(writer, sheet_name="Scored Data", index=False)
                
                workbook = writer.book
                worksheet1 = writer.sheets["Extracted Data"]
                
                # Add highlighting formats
                orange_format = workbook.add_format({'bg_color': '#FFD580'}) # Light orange for needs review / low confidence
                green_format = workbook.add_format({'bg_color': '#D1E7DD'})  # Light green for verified
                
                # Format Sheet 1 (Extracted Data) with highlighting based on status & low confidence
                for r_idx in range(len(export_df)):
                    excel_row = r_idx + 1
                    row_status = df.iloc[r_idx]["status"]
                    conf_str = df.iloc[r_idx]["confidence_scores"]
                    
                    review_fields = []
                    if conf_str:
                        try:
                            conf_data = json.loads(conf_str) if isinstance(conf_str, str) else conf_str
                            review_fields = conf_data.get("review_fields", [])
                        except Exception:
                            pass
                            
                    for col_idx, col_name in enumerate(export_df.columns):
                        cell_val = export_df.iloc[r_idx, col_idx]
                        if pd.isna(cell_val):
                            cell_val = ""
                            
                        orig_field = header_to_orig_field.get(col_name, col_name)
                        
                        if row_status == "verified":
                            worksheet1.write(excel_row, col_idx, cell_val, green_format)
                        elif row_status == "needs_review" and orig_field in review_fields:
                            worksheet1.write(excel_row, col_idx, cell_val, orange_format)
                        else:
                            worksheet1.write(excel_row, col_idx, cell_val)
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data export failed: {str(e)}")
