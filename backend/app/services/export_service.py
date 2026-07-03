import csv
import io
from io import BytesIO
from openpyxl import Workbook
from fastapi.responses import StreamingResponse
from app.database import get_document

HINDI_HEADERS = {
    "Filename": "फ़ाइल नाम",
    "Roll Number": "अनुक्रमांक",
    "Class": "कक्षा",
    "DOB": "जन्म तिथि",
    "Gender": "लिंग",
    "Consent": "सहमति",
    "Math Pct": "गणित %",
    "Science Pct": "विज्ञान %",
    "Language Pct": "भाषा %",
    "Rank": "श्रेणी",
    "Remarks": "टिप्पणी"
}


def build_export(
    filtered_docs: list,
    lang: str,
    columns: str | None,
    format: str,
):
    all_headers = ["Filename", "Roll Number", "Class", "DOB", "Gender", "Consent"]
    for q in range(1, 26):
        all_headers.append(f"Q{q}")
    all_headers.extend(["Math Pct", "Science Pct", "Language Pct", "Rank", "Remarks"])

    if columns:
        selected = [c.strip() for c in columns.split(",")]
        all_headers = [h for h in all_headers if h in selected]

    display_headers = []
    for h in all_headers:
        if lang == "hi" and h in HINDI_HEADERS:
            display_headers.append(HINDI_HEADERS[h])
        elif lang == "hi" and h.startswith("Q"):
            display_headers.append(f"प्रश्न {h[1:]}")
        else:
            display_headers.append(h)

    rows_data = []
    for d in filtered_docs:
        full_doc = get_document(d["id"])
        if not full_doc:
            continue
        row_map = {
            "Filename": full_doc["filename"],
            "Roll Number": full_doc["roll_number"],
            "Class": full_doc["class"],
            "DOB": full_doc["dob"],
            "Gender": full_doc["gender"],
            "Consent": full_doc.get("consent", ""),
        }
        res = full_doc.get("responses") or {}
        for q in range(1, 26):
            row_map[f"Q{q}"] = res.get(f"q{q}", "")
        acad = full_doc.get("academic_scores") or {}
        row_map["Math Pct"] = acad.get("math_pct", "")
        row_map["Science Pct"] = acad.get("science_pct", "")
        row_map["Language Pct"] = acad.get("language_pct", "")
        row_map["Rank"] = acad.get("rank", "")
        row_map["Remarks"] = full_doc.get("remarks", "")
        row = [row_map.get(h, "") for h in all_headers]
        rows_data.append(row)

    if format == "csv":
        return _build_csv(display_headers, rows_data)
    return _build_excel(display_headers, rows_data)


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


def _build_excel(headers: list, rows: list) -> StreamingResponse:
    wb = Workbook()
    ws = wb.active
    ws.title = "Digitized SDQ Forms"
    ws.append(headers)
    for r in rows:
        ws.append(r)
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ssiar_sdq_digitized.xlsx"}
    )
