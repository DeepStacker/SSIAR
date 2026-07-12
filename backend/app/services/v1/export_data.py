import pandas as pd


def prepare_export_dataframe(df: pd.DataFrame, meta: list, columns: str = None):
    q_cols = [item["question_id"] for item in meta] if meta else []
    dom_cols = [f"score_{d.lower()}" for d in ["prosocial", "emotional", "conduct", "hyperactivity", "peer", "total_difficulties"]]
    dom_cols = [c for c in dom_cols if c in df.columns]
    acad_cols = ["math_pct", "science_pct", "language_pct", "rank"]
    acad_cols = [c for c in acad_cols if c in df.columns]

    export_cols = ["roll_number", "class_clean", "gender", "age", "consent"] + q_cols + dom_cols + acad_cols
    export_df = df[export_cols].copy()

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

    for item in meta:
        q_id = item["question_id"]
        if q_id in export_df.columns:
            is_reverse = item.get("reverse_scored", False)
            export_df[q_id] = export_df[q_id].apply(lambda v: map_response_to_text(v, is_reverse))

    scored_df = export_df.copy()
    for item in meta:
        q_id = item["question_id"]
        if q_id in scored_df.columns:
            is_reverse = item.get("reverse_scored", False)
            scored_df[q_id] = scored_df[q_id].apply(lambda v: map_text_to_score(v, is_reverse))

    rename_map = {}
    for item in meta:
        q_id = item["question_id"]
        text_en = item.get("text_en", "")
        rename_map[q_id] = f"{q_id.upper()}: {text_en}"
    export_df = export_df.rename(columns=rename_map)

    if columns:
        requested_cols = [c.strip() for c in columns.split(",")]
        valid_cols = []
        for c in requested_cols:
            mapped_name = rename_map.get(c, c)
            if mapped_name in export_df.columns:
                valid_cols.append(mapped_name)
        if valid_cols:
            export_df = export_df[valid_cols]

    header_to_orig_field = {}
    for item in meta:
        q_id = item["question_id"]
        text_en = item.get("text_en", "")
        header_to_orig_field[f"{q_id.upper()}: {text_en}"] = q_id
    header_to_orig_field["class_clean"] = "class"

    return export_df, scored_df, header_to_orig_field
