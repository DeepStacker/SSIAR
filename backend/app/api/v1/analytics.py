import io
import json
import logging
import pandas as pd
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from datetime import date

from app.auth import require_auth, get_current_user_id
from app.database import get_db_connection, put_conn

logger = logging.getLogger("analytics")

from app.services.v1.summary import get_processed_data, compute_summary_stats
from app.services.v1.demographics import compute_demographics
from app.services.v1.questionnaire import load_metadata, compute_questionnaire_analytics, compute_academic_analytics, compute_correlations, compute_outliers
from app.services.v1.export_data import prepare_export_dataframe
from app.services.v1.processing import compute_processing_analytics, compute_data_quality, compute_per_field_confidence

router = APIRouter(prefix="/api/analytics", tags=["analytics"], dependencies=[Depends(require_auth)])


@router.get("/summary")
def get_summary_stats(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        return compute_summary_stats(class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    except Exception:
        logger.exception("Analytics summary failed")
        raise HTTPException(status_code=500, detail="Analytics summary failed")


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
        return compute_demographics(df)
    except Exception:
        logger.exception("Demographics analytics failed")
        raise HTTPException(status_code=500, detail="Demographics analytics failed")


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
        return compute_questionnaire_analytics(df, meta)
    except Exception:
        logger.exception("Questionnaire analytics failed")
        raise HTTPException(status_code=500, detail="Questionnaire analytics failed")


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
        return compute_academic_analytics(df)
    except Exception:
        logger.exception("Academic analytics failed")
        raise HTTPException(status_code=500, detail="Academic analytics failed")


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
        return compute_correlations(df)
    except Exception:
        logger.exception("Correlations analytics failed")
        raise HTTPException(status_code=500, detail="Correlations analytics failed")


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
        return compute_outliers(df)
    except Exception:
        logger.exception("Outliers analytics failed")
        raise HTTPException(status_code=500, detail="Outliers analytics failed")


@router.get("/processing")
def get_processing_analytics(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        return compute_processing_analytics(class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    except Exception:
        logger.exception("Processing analytics failed")
        raise HTTPException(status_code=500, detail="Processing analytics failed")


@router.get("/data-quality")
def get_data_quality(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        return compute_data_quality(class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    except Exception:
        logger.exception("Data quality analytics failed")
        raise HTTPException(status_code=500, detail="Data quality analytics failed")


@router.get("/per-field-confidence")
def get_per_field_confidence(
    class_filter: str = Query(None, alias="class"),
    gender: str = None,
    date_from: str = None,
    date_to: str = None,
):
    try:
        return compute_per_field_confidence(class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    except Exception:
        logger.exception("Per-field confidence analytics failed")
        raise HTTPException(status_code=500, detail="Per-field confidence analytics failed")


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

        meta = load_metadata()
        export_df, scored_df, header_to_orig_field = prepare_export_dataframe(df, meta, columns)

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
                export_df.to_excel(writer, sheet_name="Extracted Data", index=False)
                scored_df.to_excel(writer, sheet_name="Scored Data", index=False)

                workbook = writer.book
                worksheet1 = writer.sheets["Extracted Data"]

                orange_format = workbook.add_format({'bg_color': '#FFD580'})
                green_format = workbook.add_format({'bg_color': '#D1E7DD'})

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
    except Exception:
        logger.exception("Data export failed")
        raise HTTPException(status_code=500, detail="Data export failed")
