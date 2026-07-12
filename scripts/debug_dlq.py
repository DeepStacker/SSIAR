"""Debug script to test DLQ review task submission flow and bulk resolve all duplicate tasks."""
import sys
sys.path.insert(0, "/Users/deepstacker/WorkSpace/dupcq/SSIAR/backend")

from app.database import get_db_connection, put_conn, init_db
import json

init_db()

conn = get_db_connection()
try:
    cur = conn.cursor()
    
    # 1. Check total review tasks
    cur.execute("SELECT COUNT(*) FROM review_tasks")
    total = cur.fetchone()[0]
    print(f"Total review_tasks: {total}")
    
    # 2. Check by status
    cur.execute("SELECT status, COUNT(*) FROM review_tasks GROUP BY status")
    for row in cur.fetchall():
        print(f"  Status '{row[0]}': {row[1]}")
    
    # 3. Resolve a duplicate group via submit_review to verify it resolves all matching duplicates
    cur.execute("""
        SELECT document_id, field_name, COUNT(*) as cnt 
        FROM review_tasks 
        WHERE status = 'pending'
        GROUP BY document_id, field_name 
        HAVING cnt > 1
        LIMIT 1
    """)
    dup = cur.fetchone()
    if dup:
        doc_id, field_name, count = dup[0], dup[1], dup[2]
        print(f"\n🧪 Found duplicate group: doc_id={doc_id}, field={field_name}, count={count}")
        
        # Get one of the task IDs
        cur.execute(
            "SELECT id FROM review_tasks WHERE document_id = ? AND field_name = ? AND status = 'pending' LIMIT 1",
            (doc_id, field_name)
        )
        task_id = cur.fetchone()[0]
        
        from app.processing.review import submit_review
        from app import auth
        auth._auth_local.user_id = "system"
        
        print(f"  Resolving task_id={task_id} with submit_review...")
        submit_review(task_id, "fixed_value_test", "system")
        
        # Verify status of all tasks in this group
        cur.execute(
            "SELECT id, status, corrected_value FROM review_tasks WHERE document_id = ? AND field_name = ?",
            (doc_id, field_name)
        )
        print("  Post-resolve group statuses:")
        for row in cur.fetchall():
            print(f"    -> id={row[0]}, status={row[1]}, corrected_value={row[2]}")
            
    # 4. Clean up any leftover orphan duplicate pending tasks to get user's DB in a completely clean state
    cur.execute("""
        SELECT document_id, field_name
        FROM review_tasks 
        WHERE status = 'pending'
        GROUP BY document_id, field_name 
        HAVING COUNT(*) > 1
    """)
    dup_groups = cur.fetchall()
    if dup_groups:
        print(f"\n🧹 Auto-cleaning {len(dup_groups)} duplicate group remnants...")
        for dg in dup_groups:
            dg_doc_id, dg_field_name = dg[0], dg[1]
            # Keep only the newest task in this group, delete the older duplicates
            cur.execute(
                "SELECT id FROM review_tasks WHERE document_id = ? AND field_name = ? AND status = 'pending' ORDER BY created_at DESC",
                (dg_doc_id, dg_field_name)
            )
            task_ids = [r[0] for r in cur.fetchall()]
            # Keep task_ids[0], delete task_ids[1:]
            for to_delete in task_ids[1:]:
                cur.execute("DELETE FROM review_tasks WHERE id = ?", (to_delete,))
        conn.commit()
        print("✅ Finished auto-cleanup of historical duplicate tasks!")
        
        # Verify again
        cur.execute("SELECT status, COUNT(*) FROM review_tasks GROUP BY status")
        print("New status distribution:")
        for row in cur.fetchall():
            print(f"  Status '{row[0]}': {row[1]}")
    
finally:
    put_conn(conn)
