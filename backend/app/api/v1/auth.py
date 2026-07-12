from fastapi import APIRouter, HTTPException, Depends, Request
from app.database import get_db_connection, put_conn, USE_POSTGRES
from app.auth import hash_password, verify_password, create_jwt, require_auth, get_current_user_id, get_current_email, get_current_role
from app.models import RegisterRequest, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest, UpdateRoleRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

import asyncio
import secrets
from datetime import datetime, timedelta

@router.post("/register")
async def register(payload: RegisterRequest):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    loop = asyncio.get_running_loop()
    def _db_register():
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id FROM users WHERE email = %s" if USE_POSTGRES else
                "SELECT id FROM users WHERE email = ?",
                (email,)
            )
            if cur.fetchone():
                return None, None, "exists"

            cur.execute("SELECT COUNT(*) FROM users")
            count = cur.fetchone()[0]
            role = "admin" if count == 0 else "user"

            user_id = __import__("uuid").uuid4().hex
            pw_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (%s, %s, %s, %s, %s)"
                if USE_POSTGRES else
                "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, pw_hash, role, datetime.now().isoformat())
            )
            conn.commit()
            return user_id, role, None
        finally:
            put_conn(conn)

    user_id, role, err = await loop.run_in_executor(None, _db_register)
    if err == "exists":
        raise HTTPException(status_code=400, detail="Email already registered")
    if not user_id:
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")
    token = create_jwt(user_id, email, role)
    return {"token": token, "user_id": user_id, "email": email, "role": role}


@router.post("/login")
async def login(payload: LoginRequest):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""

    loop = asyncio.get_running_loop()
    def _db_login():
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, email, password_hash, role FROM users WHERE email = %s" if USE_POSTGRES else
                "SELECT id, email, password_hash, role FROM users WHERE email = ?",
                (email,)
            )
            row = cur.fetchone()
            if not row:
                return None, None, "invalid"

            user_id, db_email, pw_hash, role = row[0], row[1], row[2], row[3]
            if not verify_password(password, pw_hash):
                return None, None, "invalid"

            return user_id, db_email, role
        finally:
            put_conn(conn)

    user_id, db_email, role = await loop.run_in_executor(None, _db_login)
    if db_email == "invalid":
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt(user_id, db_email, role)
    return {"token": token, "user_id": user_id, "email": db_email, "role": role}


@router.post("/refresh")
async def refresh_token(request: Request):
    require_auth(request)
    user_id = get_current_user_id()
    email = get_current_email()
    role = get_current_role()
    token = create_jwt(user_id, email, role)
    return {"token": token, "user_id": user_id, "email": email, "role": role}


@router.get("/me")
async def get_profile(request: Request):
    require_auth(request)
    user_id = get_current_user_id()
    email = get_current_email()
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT role FROM users WHERE id = %s" if USE_POSTGRES else
            "SELECT role FROM users WHERE id = ?", (user_id,)
        )
        row = cur.fetchone()
        role = row[0] if row else "user"
        return {"user_id": user_id, "email": email, "role": role}
    finally:
        put_conn(conn)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    email = payload.email.strip().lower()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM users WHERE email = %s" if USE_POSTGRES else
            "SELECT id FROM users WHERE email = ?", (email,)
        )
        if not cur.fetchone():
            return {"message": "If this email is registered, a password reset link has been generated."}
        
        token = secrets.token_urlsafe(32)
        expiry = (datetime.now() + timedelta(hours=1)).isoformat()
        cur.execute(
            "INSERT OR REPLACE INTO password_reset_tokens (email, token, expires_at) VALUES (?, ?, ?)",
            (email, token, expiry)
        )
        conn.commit()
        print(f"[Password Reset] Token for {email}: {token}")
        return {
            "message": "Password reset token successfully generated.",
            "token": token
        }
    finally:
        put_conn(conn)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT email, expires_at FROM password_reset_tokens WHERE token = ?", (payload.token,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
        email, expires_at = row[0], row[1]
        if datetime.fromisoformat(expires_at) < datetime.now():
            cur.execute("DELETE FROM password_reset_tokens WHERE token = ?", (payload.token,))
            conn.commit()
            raise HTTPException(status_code=400, detail="Reset token has expired")
            
        new_pw_hash = hash_password(payload.password)
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE email = %s" if USE_POSTGRES else
            "UPDATE users SET password_hash = ? WHERE email = ?", (new_pw_hash, email)
        )
        cur.execute("DELETE FROM password_reset_tokens WHERE email = ?", (email,))
        conn.commit()
        return {"message": "Password successfully updated."}
    finally:
        put_conn(conn)


@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, request: Request):
    require_auth(request)
    email = get_current_email()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT password_hash FROM users WHERE email = %s" if USE_POSTGRES else
            "SELECT password_hash FROM users WHERE email = ?", (email,)
        )
        row = cur.fetchone()
        if not row or not verify_password(payload.old_password, row[0]):
            raise HTTPException(status_code=400, detail="Incorrect old password")
            
        new_pw_hash = hash_password(payload.new_password)
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE email = %s" if USE_POSTGRES else
            "UPDATE users SET password_hash = ? WHERE email = ?", (new_pw_hash, email)
        )
        conn.commit()
        return {"message": "Password updated successfully"}
    finally:
        put_conn(conn)


@router.get("/users")
async def list_users(request: Request):
    require_auth(request)
    role = get_current_role()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, email, role, created_at FROM users")
        rows = cur.fetchall()
        users_list = []
        for r in rows:
            users_list.append({
                "user_id": r[0],
                "email": r[1],
                "role": r[2],
                "created_at": r[3]
            })
        return {"users": users_list}
    finally:
        put_conn(conn)


@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, payload: UpdateRoleRequest, request: Request):
    require_auth(request)
    current_role = get_current_role()
    if current_role != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
        
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Invalid role type")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET role = %s WHERE id = %s" if USE_POSTGRES else
            "UPDATE users SET role = ? WHERE id = ?", (payload.role, user_id)
        )
        conn.commit()
        return {"message": "User role updated successfully"}
    finally:
        put_conn(conn)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    require_auth(request)
    current_role = get_current_role()
    if current_role != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
        
    if user_id == get_current_user_id():
        raise HTTPException(status_code=400, detail="Self-deletion not allowed")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM users WHERE id = %s" if USE_POSTGRES else
            "DELETE FROM users WHERE id = ?", (user_id,)
        )
        conn.commit()
        return {"message": "User deleted successfully"}
    finally:
        put_conn(conn)
