import hashlib
import hmac
import secrets
import time
import uuid
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.models import User


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    )
    return f"pbkdf2:sha256:100000${salt}${hash_bytes.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        parts = hashed_password.split("$")
        if len(parts) != 3:
            return False
        meta, salt, expected_hash = parts
        algorithm, iterations_str = meta.split(":")[-2:]
        iterations = int(iterations_str)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations
        )
        return hmac.compare_digest(derived.hex(), expected_hash)
    except Exception:
        return False


def create_session_token(user_id: uuid.UUID, email: str, role: str) -> str:
    timestamp = int(time.time())
    payload = f"{user_id}|{email}|{role}|{timestamp}"
    signature = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return f"{payload}|{signature}"


def parse_session_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        parts = token.split("|")
        if len(parts) != 5:
            return None
        user_id_str, email, role, timestamp_str, received_signature = parts
        payload = f"{user_id_str}|{email}|{role}|{timestamp_str}"
        expected_signature = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(received_signature, expected_signature):
            return None
        created_time = int(timestamp_str)
        if time.time() - created_time > 60 * 60 * 24 * 7:
            return None
        return {
            "user_id": uuid.UUID(user_id_str),
            "email": email,
            "role": role,
        }
    except Exception:
        return None


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    session_data = parse_session_token(token)
    if not session_data:
        return None
    user_id = session_data["user_id"]
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def require_authenticated_user(
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
        )
    return current_user


async def require_admin_user(
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in as administrator.",
        )
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required.",
        )
    return current_user
