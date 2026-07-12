from fastapi import APIRouter, HTTPException, Depends, Request
from app.database import get_db_connection, put_conn, USE_POSTGRES
from app.auth import hash_password, verify_password, create_jwt, require_auth, get_current_user_id, get_current_email
from app.models import RegisterRequest, LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


import asyncio

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
                return None, "exists"

            user_id = __import__("uuid").uuid4().hex
            pw_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (%s, %s, %s, %s)"
                if USE_POSTGRES else
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email, pw_hash, __import__("datetime").datetime.now().isoformat())
            )
            conn.commit()
            return user_id, None
        finally:
            put_conn(conn)

    user_id, err = await loop.run_in_executor(None, _db_register)
    if err == "exists":
        raise HTTPException(status_code=400, detail="Email already registered")
    if not user_id:
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")
    token = create_jwt(user_id, email)
    return {"token": token, "user_id": user_id, "email": email}


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
                "SELECT id, email, password_hash FROM users WHERE email = %s" if USE_POSTGRES else
                "SELECT id, email, password_hash FROM users WHERE email = ?",
                (email,)
            )
            row = cur.fetchone()
            if not row:
                return None, "invalid"

            user_id, db_email, pw_hash = row[0], row[1], row[2]
            if not verify_password(password, pw_hash):
                return None, "invalid"

            return user_id, db_email
        finally:
            put_conn(conn)

    user_id, db_email = await loop.run_in_executor(None, _db_login)
    if db_email == "invalid":
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt(user_id, db_email)
    return {"token": token, "user_id": user_id, "email": db_email}


@router.post("/refresh")
async def refresh_token(request: Request):
    require_auth(request)
    user_id = get_current_user_id()
    email = get_current_email()
    token = create_jwt(user_id, email)
    return {"token": token, "user_id": user_id, "email": email}
