import json
import numpy as np
from typing import Dict, List, Optional
from datetime import date

from app.database import get_db_connection, put_conn, USE_POSTGRES
from app.auth import get_current_user_id
from app.services.v1.garbage_detector import collect_garbage_docs


def compute_processing_analytics(
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

        extra_joins = ""
        extra_wheres = []
        extra_params = []
        if class_filter or gender or date_from or date_to:
            extra_joins = " LEFT JOIN form_data fd ON d.id = fd.document_id"
        if class_filter:
            extra_wheres.append("fd.class = %s" if USE_POSTGRES else "fd.class = ?")
            extra_params.append(class_filter)
        if gender:
            extra_wheres.append("fd.gender = %s" if USE_POSTGRES else "fd.gender = ?")
            extra_params.append(gender)
        if date_from:
            extra_wheres.append("d.created_at >= %s" if USE_POSTGRES else "d.created_at >= ?")
            extra_params.append(date_from + "T00:00:00")
        if date_to:
            extra_wheres.append("d.created_at <= %s" if USE_POSTGRES else "d.created_at <= ?")
            extra_params.append(date_to + "T23:59:59")
        extra_where_sql = " AND " + " AND ".join(extra_wheres) if extra_wheres else ""

        today_str = date.today().isoformat()
        base_today_params = [f"{today_str}%"]
        if uid:
            base_today_params.append(uid)

        ph = "%s" if USE_POSTGRES else "?"
        if uid:
            cursor.execute(f"""
                SELECT substr(d.created_at, 12, 2) as hour, COUNT(*) as count
                FROM documents d{extra_joins}
                WHERE d.created_at LIKE {ph} AND d.user_id = {ph}{extra_where_sql}
                GROUP BY hour
                ORDER BY hour
            """, base_today_params + extra_params)
        else:
            cursor.execute(f"""
                SELECT substr(d.created_at, 12, 2) as hour, COUNT(*) as count
                FROM documents d{extra_joins}
                WHERE d.created_at LIKE {ph}{extra_where_sql}
                GROUP BY hour
                ORDER BY hour
            """, [f"{today_str}%"] + extra_params)

        hourly = cursor.fetchall()
        hourly_breakdown = [{"hour": f"{r[0]}:00", "count": r[1]} for r in hourly]

        if uid:
            cursor.execute(f"""
                SELECT d.escalation_level, COUNT(*) as count
                FROM documents d{extra_joins}
                WHERE d.user_id = {ph}{extra_where_sql}
                GROUP BY d.escalation_level
            """, [uid] + extra_params)
        else:
            cursor.execute(f"""
                SELECT d.escalation_level, COUNT(*) as count
                FROM documents d{extra_joins}
                WHERE 1=1{extra_where_sql}
                GROUP BY d.escalation_level
            """, extra_params)
        escalation_rows = cursor.fetchall()
        level_counts = {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
        for r in escalation_rows:
            lev = r[0] or "level_1"
            if lev in level_counts:
                level_counts[lev] = r[1]
        escalation_dist = [{"level": k, "count": v} for k, v in level_counts.items()]

        if uid:
            cursor.execute(f"""
                SELECT d.status, COUNT(*) as count
                FROM documents d{extra_joins}
                WHERE d.user_id = {ph}{extra_where_sql}
                GROUP BY d.status
            """, [uid] + extra_params)
        else:
            cursor.execute(f"""
                SELECT d.status, COUNT(*) as count
                FROM documents d{extra_joins}
                WHERE 1=1{extra_where_sql}
                GROUP BY d.status
            """, extra_params)
        status_rows = cursor.fetchall()
        status_counts = {r[0]: r[1] for r in status_rows}

        return {
            "hourly_breakdown": hourly_breakdown,
            "escalation_distribution": escalation_dist,
            "status_distribution": status_counts,
            "scope": "all_documents"
        }
    except Exception as e:
        raise Exception(f"Processing analytics failed: {str(e)}")
    finally:
        if conn is not None:
            put_conn(conn)


def compute_data_quality(
    class_filter=None,
    gender=None,
    date_from=None,
    date_to=None,
):
    conn = None
    try:
        uid = get_current_user_id()
        garbage = collect_garbage_docs()
        conn = get_db_connection()
        cursor = conn.cursor()
        if uid:
            cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'needs_review' AND user_id = %s" if USE_POSTGRES else "SELECT COUNT(*) FROM documents WHERE status = 'needs_review' AND user_id = ?", (uid,))
        else:
            cursor.execute("SELECT COUNT(*) FROM documents WHERE status = 'needs_review'")
        needs_review = cursor.fetchone()[0]
        if uid:
            cursor.execute("SELECT COUNT(*) FROM documents WHERE user_id = %s" if USE_POSTGRES else "SELECT COUNT(*) FROM documents WHERE user_id = ?", (uid,))
        else:
            cursor.execute("SELECT COUNT(*) FROM documents")
        total = cursor.fetchone()[0]

        partial_forms = 0
        try:
            if uid:
                q = "SELECT responses FROM form_data fd JOIN documents d ON fd.document_id = d.id WHERE d.status IN ('verified', 'needs_review') AND d.user_id = %s" if USE_POSTGRES else "SELECT responses FROM form_data fd JOIN documents d ON fd.document_id = d.id WHERE d.status IN ('verified', 'needs_review') AND d.user_id = ?"
                cursor.execute(q, (uid,))
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

        return {
            "total_documents": total,
            "needs_review": needs_review,
            "documents_with_issues": len(garbage),
            "partial_forms": partial_forms,
            "issues": garbage[:50],
        }
    except Exception as e:
        raise Exception(f"Data quality analytics failed: {str(e)}")
    finally:
        if conn is not None:
            put_conn(conn)


def compute_per_field_confidence(
    class_filter=None,
    gender=None,
    date_from=None,
    date_to=None,
):
    conn = None
    try:
        uid = get_current_user_id()
        conn = get_db_connection()
        cursor = conn.cursor()

        extra_wheres = ["d.status IN ('verified', 'needs_review')"]
        extra_params = []
        if uid:
            extra_wheres.append("d.user_id = %s" if USE_POSTGRES else "d.user_id = ?")
            extra_params.append(uid)
        if class_filter:
            extra_wheres.append("fd.class = %s" if USE_POSTGRES else "fd.class = ?")
            extra_params.append(class_filter)
        if gender:
            extra_wheres.append("fd.gender = %s" if USE_POSTGRES else "fd.gender = ?")
            extra_params.append(gender)
        if date_from:
            extra_wheres.append("d.created_at >= %s" if USE_POSTGRES else "d.created_at >= ?")
            extra_params.append(date_from + "T00:00:00")
        if date_to:
            extra_wheres.append("d.created_at <= %s" if USE_POSTGRES else "d.created_at <= ?")
            extra_params.append(date_to + "T23:59:59")

        cursor.execute(f"""
            SELECT fd.confidence_scores
            FROM form_data fd
            JOIN documents d ON fd.document_id = d.id
            WHERE {" AND ".join(extra_wheres)}
        """, extra_params)
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
        raise Exception(f"Per-field confidence analytics failed: {str(e)}")
    finally:
        if conn is not None:
            put_conn(conn)
