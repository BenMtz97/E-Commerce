import uuid
from decimal import Decimal
from typing import AsyncGenerator, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)


_db_initialized: bool = False


async def check_database_health(db: Optional[AsyncSession] = None) -> bool:
    try:
        if db is not None:
            await db.execute(select(1))
            return True
        async with engine.connect() as conn:
            await conn.execute(select(1))
            return True
    except Exception:
        return False


async def ensure_db_initialized() -> None:
    global _db_initialized
    if not _db_initialized:
        await init_db()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    if not _db_initialized:
        try:
            await ensure_db_initialized()
        except Exception:
            pass

    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    global _db_initialized
    from app.models import Product

    async with engine.begin() as conn:
        try:
            await conn.run_sync(Base.metadata.create_all)
        except Exception as exc:
            if "already exists" not in str(exc).lower():
                raise

    async with async_session_factory() as session:
        from app.models import User
        from app.security import hash_password

        admin_result = await session.execute(
            select(User).where(User.email == "admin@admin.com")
        )
        if admin_result.scalar_one_or_none() is None:
            session.add(
                User(
                    id=uuid.uuid4(),
                    email="admin@admin.com",
                    hashed_password=hash_password("admin"),
                    role="admin",
                )
            )

        user_result = await session.execute(
            select(User).where(User.email == "user@user.com")
        )
        if user_result.scalar_one_or_none() is None:
            session.add(
                User(
                    id=uuid.uuid4(),
                    email="user@user.com",
                    hashed_password=hash_password("user"),
                    role="user",
                )
            )

        existing_result = await session.execute(select(Product).limit(1))
        first_product = existing_result.scalar_one_or_none()
        if first_product is None:
            initial_catalog = []
            session.add_all(initial_catalog)

        await session.commit()

    _db_initialized = True

