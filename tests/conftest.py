import uuid
from decimal import Decimal
from typing import AsyncGenerator
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.models import Product
from main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=StaticPool,
    echo=False,
    future=True,
)

test_session_factory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session = test_session_factory()
    try:
        yield session
    finally:
        try:
            await session.rollback()
        except Exception:
            pass
        await session.close()
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with test_session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def sample_product(db_session: AsyncSession) -> Product:
    product = Product(
        id=uuid.uuid4(),
        sku="TEST-SKU-001",
        name="Precision Test Component",
        description="High endurance testing component with strict tolerance.",
        category="Testing",
        price=Decimal("99.50"),
        stock=10,
        weight_kg=Decimal("0.500"),
    )
    db_session.add(product)
    await db_session.commit()
    await db_session.refresh(product)
    return product
