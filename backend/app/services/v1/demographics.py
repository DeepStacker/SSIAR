import pandas as pd
from typing import Dict, List, Any

from app.services.v1.heatmap import compute_age_gender_heatmap


def compute_demographics(df: pd.DataFrame) -> dict:
    class_counts = df["class_clean"].value_counts()
    class_dist = [{"class": k, "count": int(v)} for k, v in class_counts.items()]
    class_dist.sort(key=lambda x: x["class"])

    gender_counts = df["gender"].fillna("Unknown").value_counts()
    gender_dist = [{"gender": k if k else "Unknown", "count": int(v)} for k, v in gender_counts.items()]

    age_counts = df["age"].dropna().astype(int).value_counts()
    age_dist = [{"age": f"{k} Years", "count": int(v)} for k, v in age_counts.items()]
    age_dist.sort(key=lambda x: int(x["age"].split()[0]))

    heatmap = compute_age_gender_heatmap(df)

    return {
        "class_distribution": class_dist,
        "gender_distribution": gender_dist,
        "age_distribution": age_dist,
        "age_gender_heatmap": heatmap
    }
