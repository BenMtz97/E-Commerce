import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from app.security import hash_password, verify_password


@pytest.mark.asyncio
async def test_admin_and_user_credentials_and_hashing(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_pw = "admin"
    admin_hashed = hash_password(admin_pw)
    assert verify_password(admin_pw, admin_hashed) is True
    assert verify_password("wrong_password", admin_hashed) is False
    assert admin_hashed.startswith("pbkdf2:sha256:100000$")

    user_pw = "user"
    user_hashed = hash_password(user_pw)
    assert verify_password(user_pw, user_hashed) is True
    assert verify_password("wrong_user", user_hashed) is False


@pytest.mark.asyncio
async def test_login_success_admin_and_user(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_user = User(
        id=uuid.uuid4(),
        email="admin@admin.com",
        hashed_password=hash_password("admin"),
        role="admin",
    )
    normal_user = User(
        id=uuid.uuid4(),
        email="user@user.com",
        hashed_password=hash_password("user"),
        role="user",
    )
    db_session.add_all([admin_user, normal_user])
    await db_session.commit()

    admin_login_res = await client.post(
        "/api/auth/login",
        json={"email": "admin@admin.com", "password": "admin"},
    )
    assert admin_login_res.status_code == 200
    admin_data = admin_login_res.json()
    assert admin_data["user"]["role"] == "admin"
    assert "token" in admin_data

    user_login_res = await client.post(
        "/api/auth/login",
        json={"email": "user@user.com", "password": "user"},
    )
    assert user_login_res.status_code == 200
    user_data = user_login_res.json()
    assert user_data["user"]["role"] == "user"
    assert "token" in user_data


@pytest.mark.asyncio
async def test_login_invalid_credentials_returns_401(client: AsyncClient, db_session: AsyncSession) -> None:
    response = await client.post(
        "/api/auth/login",
        json={"email": "admin@admin.com", "password": "invalid_password"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_register_creates_normal_user_only(client: AsyncClient, db_session: AsyncSession) -> None:
    payload = {
        "email": "newshopper@enterprise.com",
        "password": "shopperpassword123",
    }
    response = await client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == "newshopper@enterprise.com"
    assert data["user"]["role"] == "user"


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_409(client: AsyncClient, db_session: AsyncSession) -> None:
    existing_user = User(
        id=uuid.uuid4(),
        email="existing@enterprise.com",
        hashed_password=hash_password("securepassword"),
        role="user",
    )
    db_session.add(existing_user)
    await db_session.commit()

    response = await client.post(
        "/api/auth/register",
        json={"email": "existing@enterprise.com", "password": "otherpassword"},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_admin_can_create_other_admin_users(client: AsyncClient, db_session: AsyncSession) -> None:
    super_admin = User(
        id=uuid.uuid4(),
        email="admin@admin.com",
        hashed_password=hash_password("admin"),
        role="admin",
    )
    db_session.add(super_admin)
    await db_session.commit()

    login_res = await client.post(
        "/api/auth/login",
        json={"email": "admin@admin.com", "password": "admin"},
    )
    token = login_res.json()["token"]

    create_admin_res = await client.post(
        "/api/auth/create-admin",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "secondadmin@enterprise.com", "password": "secondadminpass"},
    )
    assert create_admin_res.status_code == 201
    new_admin_data = create_admin_res.json()
    assert new_admin_data["user"]["email"] == "secondadmin@enterprise.com"
    assert new_admin_data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_normal_user_blocked_from_creating_admin(client: AsyncClient, db_session: AsyncSession) -> None:
    normal_user = User(
        id=uuid.uuid4(),
        email="user@user.com",
        hashed_password=hash_password("user"),
        role="user",
    )
    db_session.add(normal_user)
    await db_session.commit()

    login_res = await client.post(
        "/api/auth/login",
        json={"email": "user@user.com", "password": "user"},
    )
    token = login_res.json()["token"]

    attempt_res = await client.post(
        "/api/auth/create-admin",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "hackedadmin@enterprise.com", "password": "password123"},
    )
    assert attempt_res.status_code in (401, 403)
