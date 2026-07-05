import hashlib
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

_auth_local = threading.local()


def get_current_user_id() -> str | None:
    return getattr(_auth_local, "user_id", None)


def get_current_email() -> str | None:
    return getattr(_auth_local, "email", None)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return salt.hex() + ":" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
        return dk.hex() == dk_hex
    except (ValueError, AttributeError):
        return False


def create_jwt(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
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
    request.state.user_id = payload.get("sub")
    request.state.email = payload.get("email")
    return payload
