import asyncio
import uuid
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Product


@pytest.mark.asyncio
async def test_concurrent_purchases_prevent_overselling(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    product = Product(
        id=uuid.uuid4(),
        sku="KNT-RACE-TEST",
        name="Limited Edition Component",
        description="Rare high speed module under high contention.",
        category="Computing",
        price=Decimal("499.00"),
        stock=3,
        weight_kg=Decimal("0.450"),
    )
    db_session.add(product)
    await db_session.commit()
    await db_session.refresh(product)

    product_id = str(product.id)
    purchase_payload = {"quantity": 1}

    async def attempt_purchase() -> int:
        response = await client.post(
            f"/api/products/{product_id}/purchase",
            json=purchase_payload,
        )
        return response.status_code

    tasks = [attempt_purchase() for _ in range(10)]
    status_codes = await asyncio.gather(*tasks)

    successful_purchases = status_codes.count(200)
    failed_purchases = status_codes.count(409)

    assert successful_purchases == 3
    assert failed_purchases == 7
    assert len(status_codes) == 10

    refreshed_response = await client.get(f"/api/products/{product_id}")
    assert refreshed_response.status_code == 200
    refreshed_data = refreshed_response.json()
    assert refreshed_data["stock"] == 0
    await asyncio.sleep(0.01)
