import json
import os
import numpy as np
import pandas as pd
from typing import Dict, List, Any
from datetime import date

from app.database import get_db_connection, put_conn, USE_POSTGRES
from app.auth import get_current_user_id
from app.services.v1.questionnaire import load_metadata


def get_processed_data(class_filter=None, gender_filter=None, date_from=None, date_to=None, statuses=("verified",)) -> pd.DataFrame:
    uid = get_current_user_id()
    conn = get_db_connection()
    try:
        ph = "%s" if USE_POSTGRES else "?"
        placeholders = ",".join(ph for _ in statuses)
        query = f"""
            SELECT fd.document_id, fd.roll_number, fd.class, fd.dob, fd.gender, fd.consent, 
                   fd.responses, fd.academic_scores, fd.remarks, fd.quality_report, fd.confidence_scores, d.status
            FROM form_data fd
            JOIN documents d ON fd.document_id = d.id
            WHERE d.status IN ({placeholders})
        """
        params = list(statuses)

        if uid:
            query += " AND d.user_id = " + ph
            params.append(uid)
        if class_filter:
            query += " AND fd.class = " + ph
            params.append(class_filter)
        if gender_filter:
            query += " AND fd.gender = " + ph
            params.append(gender_filter)
        if date_from:
            query += " AND d.created_at >= " + ph
            params.append(date_from + "T00:00:00")
        if date_to:
            query += " AND d.created_at <= " + ph
            params.append(date_to + "T23:59:59")

        df = pd.read_sql_query(query, conn, params=params)
    finally:
        put_conn(conn)

    if df.empty:
        return pd.DataFrame()

    responses_list = []
    academic_list = []

    for idx, row in df.iterrows():
        try:
            resp = json.loads(row["responses"]) if row["responses"] else {}
        except Exception:
            resp = {}
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

        try:
            acad = json.loads(row["academic_scores"]) if row["academic_scores"] else {}
        except Exception:
            acad = {}

        cleaned_acad = {}
        for subject in ["math_pct", "science_pct", "language_pct", "rank"]:
            val = acad.get(subject, "")

            if val is not None and str(val).strip():
                clean_str = str(val).replace("%", "").strip()
                try:
                    cleaned_acad[subject] = float(clean_str)
                except ValueError:
                    cleaned_acad[subject] = np.nan
            else:
                cleaned_acad[subject] = np.nan
        academic_list.append(cleaned_acad)

    resp_df = pd.DataFrame(responses_list)
    acad_df = pd.DataFrame(academic_list)

    final_df = pd.concat([df.drop(columns=["responses", "academic_scores"]), resp_df, acad_df], axis=1)

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

    def clean_class(class_str):
        if not class_str:
            return "Unknown"
        c = str(class_str).strip()
        c = c.lower().replace("class", "").replace("th", "").strip()
        if c.isdigit():
            return str(int(c))
        return c.capitalize()

    final_df["class_clean"] = final_df["class"].apply(clean_class)

    meta = load_metadata()
    if meta:
        domains = set(item["domain"] for item in meta)
        for d in domains:
            d_items = [item["question_id"] for item in meta if item["domain"] == d]

            scores = []
            for _, row in final_df.iterrows():
                row_scores = []
                for q_id in d_items:
                    val = row.get(q_id)
                    if pd.isna(val):
                        continue
                    meta_item = next(item for item in meta if item["question_id"] == q_id)
                    if meta_item["reverse_scored"]:
                        row_scores.append(3 - val)
                    else:
                        row_scores.append(val - 1)

                if len(row_scores) >= 3:
                    scaled_score = (sum(row_scores) / len(row_scores)) * 5
                    scores.append(round(scaled_score, 1))
                else:
                    scores.append(np.nan)

            final_df[f"score_{d.lower()}"] = scores

        diff_domains = ["score_emotional", "score_conduct", "score_hyperactivity", "score_peer"]
        if all(f"score_{d}" in final_df.columns for d in ["emotional", "conduct", "hyperactivity", "peer"]):
            final_df["score_total_difficulties"] = final_df[diff_domains].sum(axis=1, min_count=4)

    return final_df


def compute_summary_stats(
    class_filter=None,
    gender=None,
    date_from=None,
    date_to=None,
):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        uid = get_current_user_id()
        doc_filters = []
        doc_params = []
        fd_join = ""
        ph = "%s" if USE_POSTGRES else "?"

        if uid:
            doc_filters.append("d.user_id = " + ph)
            doc_params.append(uid)

        if class_filter or gender:
            fd_join = " LEFT JOIN form_data fd ON d.id = fd.document_id"

        if class_filter:
            doc_filters.append("fd.class = " + ph)
            doc_params.append(class_filter)
        if gender:
            doc_filters.append("fd.gender = " + ph)
            doc_params.append(gender)
        if date_from:
            doc_filters.append("d.created_at >= " + ph)
            doc_params.append(date_from + "T00:00:00")
        if date_to:
            doc_filters.append("d.created_at <= " + ph)
            doc_params.append(date_to + "T23:59:59")

        where_extra = " AND " + " AND ".join(doc_filters) if doc_filters else ""

        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE 1=1{where_extra}", doc_params)
        total_forms = cursor.fetchone()[0]

        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE d.status = 'verified'{where_extra}", doc_params)
        verified_count = cursor.fetchone()[0]

        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE d.status = 'needs_review'{where_extra}", doc_params)
        pending_count = cursor.fetchone()[0]

        today_str = date.today().isoformat()
        today_filters = [f"d.created_at LIKE {ph}"] + doc_filters
        today_params = [f"{today_str}%"] + doc_params
        cursor.execute(f"SELECT COUNT(*) FROM documents d{fd_join} WHERE 1=1 AND " + " AND ".join(today_filters), today_params)
        processed_today = cursor.fetchone()[0]

        quality_filters = ["d.status IN ('verified', 'needs_review')"]
        quality_params = []
        if uid:
            quality_filters.append("d.user_id = " + ph)
            quality_params.append(uid)
        if class_filter:
            quality_filters.append("fd.class = " + ph)
            quality_params.append(class_filter)
        if gender:
            quality_filters.append("fd.gender = " + ph)
            quality_params.append(gender)
        if date_from:
            quality_filters.append("d.created_at >= " + ph)
            quality_params.append(date_from + "T00:00:00")
        if date_to:
            quality_filters.append("d.created_at <= " + ph)
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

        trend_window_days = max(1, len(processing_trend))
        trend_total = sum(d["count"] for d in processing_trend) if processing_trend else 0
        throughput_forms_per_min = round(trend_total / (trend_window_days * 24 * 60), 4) if trend_total else 0.0

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
            "pending_review": pending_count,
            "processed_today": processed_today,
            "average_confidence": round(avg_confidence * 100, 1),
            "data_completeness": round(completeness, 1),
            "processing_trend": processing_trend,
            "throughput_forms_per_min": throughput_forms_per_min,
            "throughput_window_days": trend_window_days
        }
    except Exception as e:
        raise Exception(f"Analytics summary failed: {str(e)}")
    finally:
        if conn is not None:
            put_conn(conn)
