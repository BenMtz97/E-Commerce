from unittest.mock import patch
import pytest
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError


@pytest.mark.asyncio
async def test_maintenance_view_returns_503(client: AsyncClient) -> None:
    response = await client.get("/maintenance")
    assert response.status_code == 503
    assert "System Temporarily in Maintenance" in response.text
    assert "Database Service Offline" in response.text


@pytest.mark.asyncio
async def test_health_check_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


@pytest.mark.asyncio
async def test_database_offline_renders_maintenance_page_for_web(
    client: AsyncClient,
) -> None:
    with patch(
        "app.services.ProductService.list_products",
        side_effect=OperationalError("could not connect to server", params=None, orig=Exception("Connection refused")),
    ):
        response = await client.get("/")
        assert response.status_code == 503
        assert "System Temporarily in Maintenance" in response.text
        assert "Kinetic Catalog" in response.text


@pytest.mark.asyncio
async def test_database_offline_returns_503_json_for_api(
    client: AsyncClient,
) -> None:
    with patch(
        "app.services.ProductService.list_products",
        side_effect=OperationalError("could not connect to server", params=None, orig=Exception("Connection refused")),
    ):
        response = await client.get("/api/products")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == 503
        assert "maintenance" in data["detail"].lower()
