import json
import os
import numpy as np
import pandas as pd
from typing import List, Dict, Any


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


def compute_questionnaire_analytics(df: pd.DataFrame, meta: list) -> dict:
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

    domains = set(item["domain"] for item in meta)
    domain_stats = {}
    reliability = []

    for d in domains:
        col_name = f"score_{d.lower()}"
        if col_name in df.columns:
            sub_df = df[col_name].dropna()

            domain_stats[d] = {
                "mean": round(float(sub_df.mean()), 2) if not sub_df.empty else 0.0,
                "median": round(float(sub_df.median()), 2) if not sub_df.empty else 0.0,
                "sd": round(float(sub_df.std()), 2) if len(sub_df) > 1 else 0.0,
                "min": float(sub_df.min()) if not sub_df.empty else 0.0,
                "max": float(sub_df.max()) if not sub_df.empty else 0.0,
            }

            g_avgs = df.groupby("gender")[col_name].mean().round(2).to_dict()
            c_avgs = df.groupby("class_clean")[col_name].mean().round(2).to_dict()
            domain_stats[d]["gender_split"] = {k: v for k, v in g_avgs.items()}
            domain_stats[d]["class_split"] = [{"class": k, "score": v} for k, v in c_avgs.items()]

            d_items = [item["question_id"] for item in meta if item["domain"] == d]
            alpha = calculate_cronbach_alpha(df, d_items)
            reliability.append({
                "domain": d,
                "items_count": len(d_items),
                "cronbach_alpha": round(alpha, 3),
                "consistency": "Good" if alpha >= 0.7 else ("Acceptable" if alpha >= 0.6 else "Poor")
            })

    clinical_distribution = []
    if "score_total_difficulties" in df.columns:
        tot_diffs = df["score_total_difficulties"].dropna()
        total_scored = len(tot_diffs)
        if total_scored > 0:
            normal_cnt = int((tot_diffs <= 15).sum())
            borderline_cnt = int(((tot_diffs >= 16) & (tot_diffs <= 19)).sum())
            abnormal_cnt = int((tot_diffs >= 20).sum())

            clinical_distribution = [
                {"category": "Normal (0-15)", "count": normal_cnt, "percentage": round((normal_cnt / total_scored) * 100, 1)},
                {"category": "Borderline (16-19)", "count": borderline_cnt, "percentage": round((borderline_cnt / total_scored) * 100, 1)},
                {"category": "Abnormal (20-40)", "count": abnormal_cnt, "percentage": round((abnormal_cnt / total_scored) * 100, 1)}
            ]

    academic_impact = {}
    if "score_total_difficulties" in df.columns:
        def get_cat(val):
            if pd.isna(val):
                return None
            if val <= 15:
                return "Normal"
            if val <= 19:
                return "Borderline"
            return "Abnormal"

        df["clinical_category"] = df["score_total_difficulties"].apply(get_cat)
        for cat in ["Normal", "Borderline", "Abnormal"]:
            cat_df = df[df["clinical_category"] == cat]
            academic_impact[cat] = {
                "math": round(float(cat_df["math_pct"].mean()), 1) if not cat_df["math_pct"].dropna().empty else 0.0,
                "science": round(float(cat_df["science_pct"].mean()), 1) if not cat_df["science_pct"].dropna().empty else 0.0,
                "language": round(float(cat_df["language_pct"].mean()), 1) if not cat_df["language_pct"].dropna().empty else 0.0,
                "student_count": len(cat_df)
            }

    cohort_summary = []
    if "class_clean" in df.columns:
        classes = df["class_clean"].unique()
        for c in classes:
            c_df = df[df["class_clean"] == c]
            total_c = len(c_df)

            consent_yes = c_df["consent"].astype(str).str.lower().str.contains("yes|agree|हां|है").sum()
            consent_rate = round((consent_yes / total_c) * 100, 1) if total_c > 0 else 0.0

            mean_sdq = round(float(c_df["score_total_difficulties"].mean()), 1) if "score_total_difficulties" in c_df.columns and not c_df["score_total_difficulties"].dropna().empty else 0.0
            mean_prosocial = round(float(c_df["score_prosocial"].mean()), 1) if "score_prosocial" in c_df.columns and not c_df["score_prosocial"].dropna().empty else 0.0

            mean_math = round(float(c_df["math_pct"].mean()), 1) if not c_df["math_pct"].dropna().empty else 0.0
            mean_science = round(float(c_df["science_pct"].mean()), 1) if not c_df["science_pct"].dropna().empty else 0.0
            mean_lang = round(float(c_df["language_pct"].mean()), 1) if not c_df["language_pct"].dropna().empty else 0.0

            cohort_summary.append({
                "class": c,
                "cohort_size": total_c,
                "consent_rate": consent_rate,
                "mean_sdq_difficulties": mean_sdq,
                "mean_prosocial": mean_prosocial,
                "mean_math": mean_math,
                "mean_science": mean_science,
                "mean_language": mean_lang
            })

    return {
        "questions": questions_dist,
        "domain_scores": domain_stats,
        "reliability": reliability,
        "clinical_distribution": clinical_distribution,
        "academic_impact": academic_impact,
        "cohort_summary": cohort_summary
    }


def compute_academic_analytics(df: pd.DataFrame) -> dict:
    subjects = ["math_pct", "science_pct", "language_pct"]
    subject_labels = {"math_pct": "Mathematics", "science_pct": "Science", "language_pct": "Language"}

    averages = {}
    for sub in subjects:
        if sub in df.columns:
            sub_df = df[sub].dropna()
            averages[subject_labels[sub]] = round(float(sub_df.mean()), 1) if not sub_df.empty else 0.0

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


def compute_correlations(df: pd.DataFrame) -> dict:
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

    for dom in domains:
        if dom not in df.columns:
            continue
        row_data = {"domain": domain_labels[dom]}
        for sub in subjects:
            if sub not in df.columns:
                row_data[subject_labels[sub]] = 0.0
                continue

            aligned = df[[dom, sub]].dropna()
            if len(aligned) >= 3:
                r_val = float(aligned[dom].corr(aligned[sub], method="pearson"))
                row_data[subject_labels[sub]] = round(r_val, 3) if not np.isnan(r_val) else 0.0
            else:
                row_data[subject_labels[sub]] = 0.0
        matrix.append(row_data)

    return {"correlation_matrix": matrix}


def compute_outliers(df: pd.DataFrame) -> dict:
    outliers = []

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

    return {"outliers": outliers[:10]}



