import io
import pytest
from httpx import AsyncClient
from app.models import Product


@pytest.mark.asyncio
async def test_csv_import_valid_file(client: AsyncClient) -> None:
    csv_data = (
        "sku,name,description,category,price,stock,weight_kg\n"
        "KNT-CSV-01,Thermal Compound Ultra,High performance silicone compound,Cooling,14.50,100,0.025\n"
        "KNT-CSV-02,Braided SATA Cables,Flexible shielded cables,Cables,8.99,75,0.080\n"
    )
    files = {
        "file": ("products.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")
    }
    response = await client.post("/api/products/import-csv", files=files)
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_rows"] == 2
    assert summary["successful_imports"] == 2
    assert summary["failed_imports"] == 0
    assert len(summary["errors"]) == 0


@pytest.mark.asyncio
async def test_csv_import_handles_duplicate_sku_and_malformed_rows(
    client: AsyncClient, sample_product: Product
) -> None:
    csv_data = (
        "sku,name,description,category,price,stock,weight_kg\n"
        f"{sample_product.sku},Colliding SKU Product,Desc,Testing,49.99,10,0.5\n"
        "KNT-VALID-01,Valid Product A,Good item,Hardware,19.99,20,0.3\n"
        "KNT-VALID-01,Internal Duplicate SKU,Should fail,Hardware,19.99,20,0.3\n"
        "KNT-BAD-PRICE,Bad Price Product,Desc,Hardware,-5.00,10,0.2\n"
        "KNT-BAD-STOCK,Bad Stock Product,Desc,Hardware,10.00,-3,0.2\n"
    )
    files = {
        "file": ("batch.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")
    }
    response = await client.post("/api/products/import-csv", files=files)
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_rows"] == 5
    assert summary["successful_imports"] == 1
    assert summary["failed_imports"] == 4
    assert len(summary["errors"]) == 4


@pytest.mark.asyncio
async def test_csv_import_rejects_script_injection(client: AsyncClient) -> None:
    malicious_script_csv = (
        "sku,name,description,category,price,stock,weight_kg\n"
        "KNT-XSS-01,<script>alert('xss')</script>,Malicious script in name,Computing,99.99,10,0.5\n"
        "KNT-XSS-02,Innocent Name,<iframe src='malicious.com'></iframe>,Displays,199.99,5,2.0\n"
        "KNT-XSS-03,SVG Injection,Description,<svg onload=alert(1)>,49.99,15,0.3\n"
        "KNT-CLEAN-01,Legitimate Product,Clean description,Peripherals,29.99,50,0.2\n"
    )
    files = {
        "file": ("xss_batch.csv", io.BytesIO(malicious_script_csv.encode("utf-8")), "text/csv")
    }
    response = await client.post("/api/products/import-csv", files=files)
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_rows"] == 4
    assert summary["successful_imports"] == 1
    assert summary["failed_imports"] == 3
    assert any("Script injection detected" in err["error"] for err in summary["errors"])


@pytest.mark.asyncio
async def test_csv_import_rejects_sql_injection(client: AsyncClient) -> None:
    malicious_sql_csv = (
        "sku,name,description,category,price,stock,weight_kg\n"
        "KNT-SQL-01,Product'; DROP TABLE products; --,Drop table injection,Computing,99.99,10,0.5\n"
        "KNT-SQL-02,Union Select Product,UNION SELECT * FROM users,Displays,199.99,5,2.0\n"
        "KNT-SQL-03,Always True Name,Description,' OR '1'='1',49.99,15,0.3\n"
        "KNT-CLEAN-02,Safe Graphic Adapter,Clean hardware,Computing,399.99,8,1.2\n"
    )
    files = {
        "file": ("sql_batch.csv", io.BytesIO(malicious_sql_csv.encode("utf-8")), "text/csv")
    }
    response = await client.post("/api/products/import-csv", files=files)
    assert response.status_code == 200
    summary = response.json()
    assert summary["total_rows"] == 4
    assert summary["successful_imports"] == 1
    assert summary["failed_imports"] == 3
    assert any("SQL injection pattern detected" in err["error"] for err in summary["errors"])


@pytest.mark.asyncio
async def test_csv_import_missing_required_headers(client: AsyncClient) -> None:
    bad_csv_data = "sku,name,category\n123,Test,Testing\n"
    files = {
        "file": ("bad_headers.csv", io.BytesIO(bad_csv_data.encode("utf-8")), "text/csv")
    }
    response = await client.post("/api/products/import-csv", files=files)
    assert response.status_code == 200
    summary = response.json()
    assert summary["successful_imports"] == 0
    assert summary["failed_imports"] == 1
    assert "Missing required columns" in summary["errors"][0]["error"]
