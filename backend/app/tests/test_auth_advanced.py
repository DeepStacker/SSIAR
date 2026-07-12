import unittest
import sys
import os
from fastapi.testclient import TestClient

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database.connection import init_db, get_db_connection, put_conn

class TestAuthAdvanced(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "shared", "database", "test_auth_advanced.db"))
        os.makedirs(os.path.dirname(cls.test_db_path), exist_ok=True)
        if os.path.exists(cls.test_db_path):
            try:
                os.remove(cls.test_db_path)
            except Exception:
                pass
        os.environ["SQLITE_PATH"] = cls.test_db_path
        init_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "test_db_path") and os.path.exists(cls.test_db_path):
            try:
                os.remove(cls.test_db_path)
            except Exception:
                pass

    def test_auth_and_user_management_flow(self):
        # 1. Register first user (automatically becomes admin)
        reg1_resp = self.client.post("/api/auth/register", json={
            "email": "admin@example.com",
            "password": "Password123"
        })
        self.assertEqual(reg1_resp.status_code, 200)
        admin_data = reg1_resp.json()
        self.assertEqual(admin_data["role"], "admin")
        admin_token = admin_data["token"]

        # 2. Register second user (becomes normal user)
        reg2_resp = self.client.post("/api/auth/register", json={
            "email": "user@example.com",
            "password": "Password123"
        })
        self.assertEqual(reg2_resp.status_code, 200)
        user_data = reg2_resp.json()
        self.assertEqual(user_data["role"], "user")
        user_token = user_data["token"]
        user_id = user_data["user_id"]

        # 3. Get profile (/api/auth/me) for user
        me_resp = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {user_token}"})
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["email"], "user@example.com")
        self.assertEqual(me_resp.json()["role"], "user")

        # 4. Forgot password request
        forgot_resp = self.client.post("/api/auth/forgot-password", json={"email": "user@example.com"})
        self.assertEqual(forgot_resp.status_code, 200)
        self.assertIn("token", forgot_resp.json())
        reset_token = forgot_resp.json()["token"]

        # 5. Reset password using token
        reset_resp = self.client.post("/api/auth/reset-password", json={
            "token": reset_token,
            "password": "NewPassword123"
        })
        self.assertEqual(reset_resp.status_code, 200)

        # 6. Verify login with new password
        login_resp = self.client.post("/api/auth/login", json={
            "email": "user@example.com",
            "password": "NewPassword123"
        })
        self.assertEqual(login_resp.status_code, 200)
        self.assertEqual(login_resp.json()["email"], "user@example.com")

        # 7. Change password (authenticated)
        change_resp = self.client.post("/api/auth/change-password", headers={"Authorization": f"Bearer {user_token}"}, json={
            "old_password": "NewPassword123",
            "new_password": "AnotherPassword123"
        })
        self.assertEqual(change_resp.status_code, 200)

        # 8. List users (Admin only)
        users_resp = self.client.get("/api/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(users_resp.status_code, 200)
        users = users_resp.json()["users"]
        self.assertEqual(len(users), 2)

        # Non-admin try to list users (expect 403)
        users_fail_resp = self.client.get("/api/auth/users", headers={"Authorization": f"Bearer {user_token}"})
        self.assertEqual(users_fail_resp.status_code, 403)

        # 9. Update user role (Admin promotes user to admin)
        role_resp = self.client.put(f"/api/auth/users/{user_id}/role", headers={"Authorization": f"Bearer {admin_token}"}, json={
            "role": "admin"
        })
        self.assertEqual(role_resp.status_code, 200)

        # Get profile again (should be admin now)
        me_updated_resp = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {user_token}"})
        self.assertEqual(me_updated_resp.json()["role"], "admin")

        # 10. Delete user (Admin deletes the newly promoted user)
        # Create a third user to delete
        reg3_resp = self.client.post("/api/auth/register", json={
            "email": "delete-me@example.com",
            "password": "Password123"
        })
        to_delete_id = reg3_resp.json()["user_id"]

        del_resp = self.client.delete(f"/api/auth/users/{to_delete_id}", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(del_resp.status_code, 200)

if __name__ == "__main__":
    unittest.main()
