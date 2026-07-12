import sys
sys.path.insert(0, '/Users/deepstacker/WorkSpace/dupcq/SSIAR/backend')

from app.database import get_db_connection, put_conn, get_pdf, get_document
from app.processing.templates import init_templates_v2
from app.processing.jobs.document_jobs import process_document_background

DOC_ID = '882956ff-20dc-4680-b745-56405a3879d2'

# 1. Delete cached Azure raw response to force fresh Azure call with enhanced image
print("Deleting cached raw response...")
conn = get_db_connection()
cur = conn.cursor()
cur.execute("DELETE FROM azure_responses WHERE document_id = ?", (DOC_ID,))
conn.commit()
put_conn(conn)

init_templates_v2()
doc = get_document(DOC_ID)
pdf_bytes = get_pdf(DOC_ID)

# 2. Run reprocessing (forces fresh Azure call and regenerates everything with enhanced page images!)
print("Reprocessing fresh document synchronously (with image enhancement)...")
process_document_background(DOC_ID, pdf_bytes, doc['filename'], False)
print("Done!")
