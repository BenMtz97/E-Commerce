import uuid
from decimal import Decimal
from typing import AsyncGenerator
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


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    from app.models import Product

    async with engine.begin() as conn:
        try:
            await conn.run_sync(Base.metadata.create_all)
        except Exception as exc:
            if "already exists" not in str(exc).lower():
                raise

    async with async_session_factory() as session:
        existing_result = await session.execute(select(Product).limit(1))
        first_product = existing_result.scalar_one_or_none()
        if first_product is None:
            initial_catalog = [
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-CPU-9950X",
                    name="Ryzen 9 9950X Performance Processor",
                    description="16-core, 32-thread flagship processor with 5.7 GHz boost frequency and 80MB cache.",
                    category="Computing",
                    price=Decimal("649.99"),
                    stock=25,
                    weight_kg=Decimal("0.280")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-GPU-4090FE",
                    name="GeForce RTX 4090 Founders Edition",
                    description="24GB G6X memory, DLSS 3.5, and extreme ray tracing performance for 4K workstation pipelines.",
                    category="Computing",
                    price=Decimal("1599.00"),
                    stock=12,
                    weight_kg=Decimal("2.150")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-SSD-990PRO4",
                    name="990 PRO NVMe M.2 SSD 4TB",
                    description="PCIe 4.0 interface reaching sequential reads up to 7,450 MB/s with nickel-coated thermal spreader.",
                    category="Storage",
                    price=Decimal("349.50"),
                    stock=40,
                    weight_kg=Decimal("0.045")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-DIS-PROART32",
                    name="ProArt Display 32-inch 4K OLED",
                    description="Professional 3840x2160 true 10-bit monitor with 99% DCI-P3 coverage and hardware calibration.",
                    category="Displays",
                    price=Decimal("1299.00"),
                    stock=8,
                    weight_kg=Decimal("8.400")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-AUD-DAC-HD",
                    name="High-Res Precision DAC Amp",
                    description="Balanced dual ESS Sabre chips with ultra-low distortion THD+N under 0.0001% and XLR outputs.",
                    category="Audio",
                    price=Decimal("479.00"),
                    stock=18,
                    weight_kg=Decimal("1.350")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-PER-MECH80",
                    name="Machined Aluminum TKL Mechanical Keyboard",
                    description="Gasket-mounted hot-swap mechanical keyboard with pre-lubricated linear switches and PBT keycaps.",
                    category="Peripherals",
                    price=Decimal("189.95"),
                    stock=30,
                    weight_kg=Decimal("1.420")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-NET-10GSFP",
                    name="Dual-Port 10G SFP+ PCIe Network Card",
                    description="Enterprise Intel 82599ES controller supporting jumbo frames, SR-IOV, and optical transceivers.",
                    category="Networking",
                    price=Decimal("149.00"),
                    stock=15,
                    weight_kg=Decimal("0.310")
                ),
                Product(
                    id=uuid.uuid4(),
                    sku="KNT-RAM-DDR5-64G",
                    name="DDR5-6000 Low Latency 64GB Kit",
                    description="Dual 32GB sticks engineered with anodized aluminum heat spreaders and AMD EXPO / Intel XMP 3.0.",
                    category="Computing",
                    price=Decimal("219.99"),
                    stock=50,
                    weight_kg=Decimal("0.160")
                )
            ]
            session.add_all(initial_catalog)
            await session.commit()
