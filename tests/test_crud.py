import uuid
import pytest
from httpx import AsyncClient
from app.models import Product


@pytest.mark.asyncio
async def test_create_product_success(client: AsyncClient) -> None:
    payload = {
        "sku": "KNT-TEST-100",
        "name": "High Speed Controller",
        "description": "Embedded microcontroller with dual core architecture.",
        "category": "Computing",
        "price": "149.99",
        "stock": 50,
        "weight_kg": "0.125",
    }
    response = await client.post("/api/products", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["sku"] == "KNT-TEST-100"
    assert data["name"] == "High Speed Controller"
    assert float(data["price"]) == 149.99
    assert data["stock"] == 50
    assert "id" in data


@pytest.mark.asyncio
async def test_create_product_duplicate_sku_returns_409(
    client: AsyncClient, sample_product: Product
) -> None:
    payload = {
        "sku": sample_product.sku,
        "name": "Duplicate SKU Item",
        "description": "Should fail due to SKU collision.",
        "category": "Testing",
        "price": "29.99",
        "stock": 10,
        "weight_kg": "0.200",
    }
    response = await client.post("/api/products", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_product_invalid_data_returns_422(client: AsyncClient) -> None:
    invalid_payload = {
        "sku": "",
        "name": "Invalid Item",
        "category": "Testing",
        "price": "-10.00",
        "stock": -5,
        "weight_kg": "-1.000",
    }
    response = await client.post("/api/products", json=invalid_payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_product_script_injection_returns_422(client: AsyncClient) -> None:
    payload = {
        "sku": "KNT-SAFE-SKU",
        "name": "<script>alert('XSS')</script>",
        "category": "Computing",
        "price": "100.00",
        "stock": 5,
        "weight_kg": "1.000",
    }
    response = await client.post("/api/products", json=payload)
    assert response.status_code == 422
    assert "Script injection detected" in response.text


@pytest.mark.asyncio
async def test_create_product_sql_injection_returns_422(client: AsyncClient) -> None:
    payload = {
        "sku": "KNT-SAFE-SKU-2",
        "name": "Harmless Name",
        "description": "'; DROP TABLE products; --",
        "category": "Computing",
        "price": "100.00",
        "stock": 5,
        "weight_kg": "1.000",
    }
    response = await client.post("/api/products", json=payload)
    assert response.status_code == 422
    assert "SQL injection pattern detected" in response.text


@pytest.mark.asyncio
async def test_get_product_by_id_success(
    client: AsyncClient, sample_product: Product
) -> None:
    response = await client.get(f"/api/products/{sample_product.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["sku"] == sample_product.sku
    assert data["name"] == sample_product.name


@pytest.mark.asyncio
async def test_get_product_nonexistent_returns_404(client: AsyncClient) -> None:
    random_id = uuid.uuid4()
    response = await client.get(f"/api/products/{random_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_products_and_search_filter(
    client: AsyncClient, sample_product: Product
) -> None:
    list_response = await client.get("/api/products")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) >= 1

    search_hit = await client.get("/api/products?query=Precision")
    assert search_hit.status_code == 200
    assert len(search_hit.json()) == 1

    search_miss = await client.get("/api/products?query=NonExistentKeyword999")
    assert search_miss.status_code == 200
    assert len(search_miss.json()) == 0

    category_hit = await client.get("/api/products?category=Testing")
    assert category_hit.status_code == 200
    assert len(category_hit.json()) == 1


@pytest.mark.asyncio
async def test_update_product_success(
    client: AsyncClient, sample_product: Product
) -> None:
    update_payload = {
        "name": "Updated Precision Component",
        "price": "129.00",
        "stock": 25,
    }
    response = await client.put(f"/api/products/{sample_product.id}", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Precision Component"
    assert float(data["price"]) == 129.00
    assert data["stock"] == 25

    post_payload = {
        "name": "Updated via POST Method",
        "price": "139.50",
    }
    post_response = await client.post(f"/api/products/{sample_product.id}", json=post_payload)
    assert post_response.status_code == 200
    assert post_response.json()["name"] == "Updated via POST Method"

    partial_form_data = {
        "name": "Updated via Partial Route",
        "category": "Testing",
        "price": "145.00",
        "stock": "30",
        "weight_kg": "0.500",
    }
    partial_response = await client.post(
        f"/partials/products/{sample_product.id}/update",
        data=partial_form_data,
    )
    assert partial_response.status_code == 200
    assert "Updated via Partial Route" in partial_response.text


@pytest.mark.asyncio
async def test_delete_product_success(
    client: AsyncClient, sample_product: Product
) -> None:
    delete_response = await client.delete(f"/api/products/{sample_product.id}")
    assert delete_response.status_code == 204

    get_response = await client.get(f"/api/products/{sample_product.id}")
    assert get_response.status_code == 404
