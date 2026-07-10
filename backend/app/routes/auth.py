from fastapi import APIRouter, HTTPException, Depends, Request
from app.database import get_db_connection, put_conn, USE_POSTGRES
from app.auth import hash_password, verify_password, create_jwt, require_auth, get_current_user_id, get_current_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


import asyncio

@router.post("/register")
async def register(payload: dict):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

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
                raise HTTPException(status_code=409, detail="Email already registered")

            user_id = __import__("uuid").uuid4().hex
            pw_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (%s, %s, %s, %s)"
                if USE_POSTGRES else
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email, pw_hash, __import__("datetime").datetime.now().isoformat())
            )
            conn.commit()
            return user_id
        finally:
            put_conn(conn)

    try:
        user_id = await loop.run_in_executor(None, _db_register)
        token = create_jwt(user_id, email)
        return {"token": token, "user_id": user_id, "email": email}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login")
async def login(payload: dict):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

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
                raise HTTPException(status_code=401, detail="Invalid email or password")

            user_id, db_email, pw_hash = row[0], row[1], row[2]
            if not verify_password(password, pw_hash):
                raise HTTPException(status_code=401, detail="Invalid email or password")

            return user_id, db_email
        finally:
            put_conn(conn)

    try:
        user_id, db_email = await loop.run_in_executor(None, _db_login)
        token = create_jwt(user_id, db_email)
        return {"token": token, "user_id": user_id, "email": db_email}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me")
async def me(request: Request):
    require_auth(request)
    return {"user_id": get_current_user_id(), "email": get_current_email()}


@router.post("/refresh")
async def refresh_token(request: Request):
    require_auth(request)
    user_id = get_current_user_id()
    email = get_current_email()
    token = create_jwt(user_id, email)
    return {"token": token, "user_id": user_id, "email": email}
