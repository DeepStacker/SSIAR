import csv
import io
import os
import json
import pandas as pd
import numpy as np
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import PatternFill
from fastapi.responses import StreamingResponse
from app.database import get_document

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
        try:
            return json.load(f)
        except Exception:
            return []

def map_val_to_hindi(val):
    if val is None or val == "":
        return ""
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
        return ""
    labels = {
        1: "सच नहीं",
        2: "कुछ हद तक सच है",
        3: "सही में सच है"
    }
    return ", ".join(labels.get(d, str(d)) for d in digits)

def map_hindi_to_score(val_str, is_reverse):
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
    return ", ".join(scores)


def build_export(
    filtered_docs: list,
    lang: str,
    columns: str | None,
    format: str,
):
    meta = load_metadata()
    
    if format == "csv":
        # Build CSV using Extracted Data (Sheet 1) logic
        demo_headers = ["Filename", "Roll Number", "Class", "DOB", "Gender", "Consent"]
        acad_headers = ["Math Pct", "Science Pct", "Language Pct", "Rank", "Remarks"]
        
        all_headers = list(demo_headers)
        for q in range(1, 26):
            meta_item = next((item for item in meta if item["question_id"] == f"q{q}"), None)
            if meta_item:
                header = meta_item.get("text_hi", "") or meta_item.get("text_en", "")
            else:
                header = f"q{q}"
            all_headers.append(header)
        all_headers.extend(acad_headers)
        
        rows_data = []
        for d in filtered_docs:
            full_doc = get_document(d["id"])
            if not full_doc:
                continue
            row_map = {
                "Filename": full_doc.get("filename", ""),
                "Roll Number": full_doc.get("roll_number", ""),
                "Class": full_doc.get("class", ""),
                "DOB": full_doc.get("dob", ""),
                "Gender": full_doc.get("gender", ""),
                "Consent": full_doc.get("consent", ""),
            }
            res = full_doc.get("responses") or {}
            for q in range(1, 26):
                raw_v = res.get(f"q{q}", "")
                row_map[f"Q{q}"] = map_val_to_hindi(raw_v)
                
            acad = full_doc.get("academic_scores") or {}
            row_map["Math Pct"] = acad.get("math_pct", "")
            row_map["Science Pct"] = acad.get("science_pct", "")
            row_map["Language Pct"] = acad.get("language_pct", "")
            row_map["Rank"] = acad.get("rank", "")
            row_map["Remarks"] = full_doc.get("remarks", "")
            
            # Map header to values
            row_vals = []
            for h in demo_headers:
                row_vals.append(row_map[h])
            for q in range(1, 26):
                row_vals.append(row_map[f"Q{q}"])
            for h in acad_headers:
                row_vals.append(row_map[h])
            rows_data.append(row_vals)
            
        return _build_csv(all_headers, rows_data)
        
    return _build_excel(meta, filtered_docs, lang)


def _build_csv(headers: list, rows: list) -> StreamingResponse:
    output = BytesIO()
    output.write(b'\xef\xbb\xbf')
    text_output = io.TextIOWrapper(output, encoding='utf-8', newline='')
    writer = csv.writer(text_output)
    writer.writerow(headers)
    writer.writerows(rows)
    text_output.detach()
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=ssiar_sdq_digitized.csv"}
    )


def _build_excel(meta: list, filtered_docs: list, lang: str) -> StreamingResponse:
    wb = Workbook()
    
    # Sheet 1: Extracted Data
    ws1 = wb.active
    ws1.title = "Extracted Data"
    
    # Sheet 2: Scored Data
    ws2 = wb.create_sheet(title="Scored Data")
    
    demo_headers = ["Filename", "Roll Number", "Class", "DOB", "Gender", "Consent"]
    acad_headers = ["Math Pct", "Science Pct", "Language Pct", "Rank", "Remarks"]
    
    # Build Sheet 1 Headers
    all_headers_ws1 = list(demo_headers)
    for q in range(1, 26):
        meta_item = next((item for item in meta if item["question_id"] == f"q{q}"), None)
        if meta_item:
            header = meta_item.get("text_hi", "") or meta_item.get("text_en", "")
        else:
            header = f"q{q}"
        all_headers_ws1.append(header)
    all_headers_ws1.extend(acad_headers)
    
    # Build Sheet 2 Headers
    all_headers_ws2 = list(demo_headers)
    for q in range(1, 26):
        meta_item = next((item for item in meta if item["question_id"] == f"q{q}"), None)
        if meta_item:
            header = meta_item.get("text_hi", "") or meta_item.get("text_en", "")
        else:
            header = f"q{q}"
        all_headers_ws2.append(header)
    all_headers_ws2.extend(["score_prosocial", "score_emotional", "score_conduct", "score_hyperactivity", "score_peer", "score_total_difficulties"])
    all_headers_ws2.extend(acad_headers)
    
    ws1.append(all_headers_ws1)
    ws2.append(all_headers_ws2)
    
    orange_fill = PatternFill(start_color="FFD580", end_color="FFD580", fill_type="solid")
    green_fill = PatternFill(start_color="D1E7DD", end_color="D1E7DD", fill_type="solid")
    
    for d in filtered_docs:
        full_doc = get_document(d["id"])
        if not full_doc:
            continue
            
        row_status = full_doc.get("status", "")
        conf_scores = full_doc.get("confidence_scores")
        
        review_fields = []
        if conf_scores:
            try:
                conf_data = json.loads(conf_scores) if isinstance(conf_scores, str) else conf_scores
                review_fields = conf_data.get("review_fields", [])
            except Exception:
                pass
                
        row_map = {
            "Filename": full_doc.get("filename", ""),
            "Roll Number": full_doc.get("roll_number", ""),
            "Class": full_doc.get("class", ""),
            "DOB": full_doc.get("dob", ""),
            "Gender": full_doc.get("gender", ""),
            "Consent": full_doc.get("consent", ""),
        }
        
        # Populate Sheet 1 (Hindi Extracted Values)
        res = full_doc.get("responses") or {}
        for q in range(1, 26):
            raw_v = res.get(f"q{q}", "")
            row_map[f"Q{q}"] = map_val_to_hindi(raw_v)
            
        acad = full_doc.get("academic_scores") or {}
        row_map["Math Pct"] = acad.get("math_pct", "")
        row_map["Science Pct"] = acad.get("science_pct", "")
        row_map["Language Pct"] = acad.get("language_pct", "")
        row_map["Rank"] = acad.get("rank", "")
        row_map["Remarks"] = full_doc.get("remarks", "")
        
        # Populate Sheet 2 (Scored Values)
        scored_row_map = dict(row_map)
        for q in range(1, 26):
            meta_item = next((item for item in meta if item["question_id"] == f"q{q}"), None)
            is_reverse = meta_item.get("reverse_scored", False) if meta_item else False
            scored_row_map[f"Q{q}"] = map_hindi_to_score(row_map[f"Q{q}"], is_reverse)
            
        # Calculate Domain scores
        domain_scores = {}
        if meta:
            domains = set(item["domain"] for item in meta)
            for dom in domains:
                dom_items = [item["question_id"] for item in meta if item["domain"] == dom]
                row_scores = []
                for q_id in dom_items:
                    q_num = q_id[1:]
                    q_score_str = scored_row_map.get(f"Q{q_num}", "")
                    if q_score_str != "":
                        try:
                            val_int = int(q_score_str.split(",")[0])
                            row_scores.append(val_int)
                        except Exception:
                            pass
                if len(row_scores) >= 3:
                    raw_sum = sum(row_scores)
                    scaled_sum = round((raw_sum / len(row_scores)) * 5)
                    domain_scores[f"score_{dom.lower()}"] = scaled_sum
                    
            diff_domains = ["emotional", "conduct", "hyperactivity", "peer"]
            if all(f"score_{x}" in domain_scores for x in diff_domains):
                domain_scores["score_total_difficulties"] = sum(domain_scores[f"score_{x}"] for x in diff_domains)
                
        for dom in ["prosocial", "emotional", "conduct", "hyperactivity", "peer", "total_difficulties"]:
            scored_row_map[f"score_{dom}"] = domain_scores.get(f"score_{dom}", "")
            
        # Write Sheet 1
        ws1_row_vals = []
        for h in demo_headers:
            ws1_row_vals.append(row_map[h])
        for q in range(1, 26):
            ws1_row_vals.append(row_map[f"Q{q}"])
        for h in acad_headers:
            ws1_row_vals.append(row_map[h])
            
        ws1.append(ws1_row_vals)
        excel_row_num = ws1.max_row
        
        # Apply formatting to Sheet 1 cells
        for col_idx in range(1, len(ws1_row_vals) + 1):
            cell = ws1.cell(row=excel_row_num, column=col_idx)
            if col_idx <= len(demo_headers):
                field_name = demo_headers[col_idx - 1].lower().replace(" ", "_")
                if field_name == "class":
                    field_name = "class"
            elif col_idx <= len(demo_headers) + 25:
                field_name = f"q{col_idx - len(demo_headers)}"
            else:
                field_name = acad_headers[col_idx - len(demo_headers) - 26].lower().replace(" ", "_")
                
            if row_status == "verified":
                cell.fill = green_fill
            elif row_status == "needs_review" and field_name in review_fields:
                cell.fill = orange_fill
                
        # Write Sheet 2
        ws2_row_vals = []
        for h in demo_headers:
            ws2_row_vals.append(scored_row_map[h])
        for q in range(1, 26):
            ws2_row_vals.append(scored_row_map[f"Q{q}"])
        for dom in ["prosocial", "emotional", "conduct", "hyperactivity", "peer", "total_difficulties"]:
            ws2_row_vals.append(scored_row_map[f"score_{dom}"])
        for h in acad_headers:
            ws2_row_vals.append(scored_row_map[h])
            
        ws2.append(ws2_row_vals)
        
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ssiar_sdq_digitized.xlsx"}
    )
