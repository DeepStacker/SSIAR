import pandas as pd
from typing import Dict, List, Any


def compute_age_gender_heatmap(df: pd.DataFrame) -> list:
    gender_map = {"M": "Male", "F": "Female", "O": "Other"}
    ages = sorted(df["age"].dropna().unique())
    heatmap = []
    for age in ages:
        age_str = f"{int(age)} Years"
        row_data: dict = {"age": age_str}
        for g, label in gender_map.items():
            count = len(df[(df["age"] == age) & (df["gender"] == g)])
            row_data[label] = count
        heatmap.append(row_data)
    return heatmap
