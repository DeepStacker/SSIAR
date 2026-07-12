import hashlib
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
import jwt

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")
if len(JWT_SECRET) < 32:
    raise RuntimeError(f"JWT_SECRET must be at least 32 characters (got {len(JWT_SECRET)})")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 1

_auth_local = threading.local()


def get_current_user_id() -> str | None:
    return getattr(_auth_local, "user_id", None)


def get_current_email() -> str | None:
    return getattr(_auth_local, "email", None)


PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return salt.hex() + ":" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
        return dk.hex() == dk_hex
    except (ValueError, AttributeError):
        return False


def get_current_role() -> str:
    user_id = get_current_user_id()
    if not user_id:
        return "user"
    from app.database import get_db_connection, put_conn, USE_POSTGRES
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT role FROM users WHERE id = %s" if USE_POSTGRES else
            "SELECT role FROM users WHERE id = ?", (user_id,)
        )
        row = cur.fetchone()
        return row[0] if (row and row[0]) else "user"
    except Exception:
        return getattr(_auth_local, "role", "user")
    finally:
        put_conn(conn)


def create_jwt(user_id: str, email: str, role: str = "user") -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(time.time()),
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def require_auth(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        token = request.query_params.get("token", "")
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    _auth_local.user_id = payload.get("sub")
    _auth_local.email = payload.get("email")
    _auth_local.role = payload.get("role", "user")
    request.state.user_id = payload.get("sub")
    request.state.email = payload.get("email")
    request.state.role = payload.get("role", "user")
    return payload
