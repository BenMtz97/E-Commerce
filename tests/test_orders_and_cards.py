import pytest
from httpx import AsyncClient
from app.models import Product


@pytest.mark.asyncio
async def test_purchase_requires_card_selection(
    client: AsyncClient, sample_product: Product
) -> None:
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "user@user.com", "password": "user"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    initial_stock = sample_product.stock

    empty_card_resp = await client.post(
        f"/api/products/{sample_product.id}/purchase",
        json={"quantity": 1, "card_option": ""},
        headers=headers,
    )
    assert empty_card_resp.status_code == 400
    assert "select a payment card" in empty_card_resp.json()["detail"].lower()

    product_check = await client.get(f"/api/products/{sample_product.id}")
    assert product_check.json()["stock"] == initial_stock


@pytest.mark.asyncio
async def test_card_rejected_preserves_stock_and_creates_no_order(
    client: AsyncClient, sample_product: Product
) -> None:
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "user@user.com", "password": "user"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    initial_stock = sample_product.stock

    reject_resp = await client.post(
        f"/api/products/{sample_product.id}/purchase",
        json={"quantity": 3, "card_option": "XXX-1111 REJECTED"},
        headers=headers,
    )
    assert reject_resp.status_code == 400
    assert "XXX-1111 REJECTED" in reject_resp.json()["detail"]

    product_check = await client.get(f"/api/products/{sample_product.id}")
    assert product_check.json()["stock"] == initial_stock

    orders_resp = await client.get("/api/orders", headers=headers)
    assert orders_resp.status_code == 200
    assert len(orders_resp.json()) == 0


@pytest.mark.asyncio
async def test_card_succeed_decrements_stock_and_creates_user_order(
    client: AsyncClient, sample_product: Product
) -> None:
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "user@user.com", "password": "user"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    initial_stock = sample_product.stock

    succeed_resp = await client.post(
        f"/api/products/{sample_product.id}/purchase",
        json={"quantity": 4, "card_option": "XXX-1234 SUCCEED"},
        headers=headers,
    )
    assert succeed_resp.status_code == 200
    payload = succeed_resp.json()
    assert payload["remaining_stock"] == initial_stock - 4
    assert payload["purchased_quantity"] == 4
    assert payload["card_option"] == "XXX-1234 SUCCEED"
    assert payload["order_id"] is not None

    orders_resp = await client.get("/api/orders", headers=headers)
    assert orders_resp.status_code == 200
    orders = orders_resp.json()
    assert len(orders) == 1
    assert orders[0]["id"] == payload["order_id"]
    assert orders[0]["sku"] == sample_product.sku
    assert orders[0]["quantity"] == 4
    assert orders[0]["card_option"] == "XXX-1234 SUCCEED"
    assert orders[0]["status"] == "SUCCEEDED"


@pytest.mark.asyncio
async def test_web_purchase_partial_and_orders_view(
    client: AsyncClient, sample_product: Product
) -> None:
    login_form = await client.post(
        "/login",
        data={"email": "user@user.com", "password": "user"},
    )
    assert login_form.status_code == 200
    assert login_form.headers.get("X-Redirect-Url") == "/"

    unselected_partial = await client.post(
        "/partials/purchase",
        data={
            "product_id": str(sample_product.id),
            "quantity": "1",
            "card_option": "",
        },
    )
    assert unselected_partial.status_code == 200
    assert "Please select a payment card option" in unselected_partial.text

    rejected_partial = await client.post(
        "/partials/purchase",
        data={
            "product_id": str(sample_product.id),
            "quantity": "2",
            "card_option": "XXX-1111 REJECTED",
        },
    )
    assert rejected_partial.status_code == 200
    assert rejected_partial.headers.get("HX-Trigger") == "transactionProcessed"
    assert "XXX-1111 REJECTED" in rejected_partial.text

    succeed_partial = await client.post(
        "/partials/purchase",
        data={
            "product_id": str(sample_product.id),
            "quantity": "2",
            "card_option": "XXX-1234 SUCCEED",
        },
    )
    assert succeed_partial.status_code == 200
    assert succeed_partial.headers.get("HX-Trigger") == "transactionConfirmed"
    assert "Purchase Succeeded" in succeed_partial.text

    orders_page = await client.get("/orders")
    assert orders_page.status_code == 200
    assert sample_product.sku in orders_page.text
    assert "XXX-1234 SUCCEED" in orders_page.text


@pytest.mark.asyncio
async def test_sample_csv_only_in_admin_and_multicolumn_filters(
    client: AsyncClient, sample_product: Product
) -> None:
    anon_home = await client.get("/")
    assert anon_home.status_code == 200
    assert "Sample CSV" not in anon_home.text

    await client.post(
        "/login",
        data={"email": "user@user.com", "password": "user"},
    )
    user_home = await client.get("/")
    assert user_home.status_code == 200
    assert "Sample CSV" not in user_home.text

    await client.post(
        "/login",
        data={"email": "admin@admin.com", "password": "admin"},
    )
    admin_home = await client.get("/")
    assert admin_home.status_code == 200
    assert "Sample CSV" in admin_home.text

    admin_dashboard = await client.get("/admin")
    assert admin_dashboard.status_code == 200
    assert "Sample CSV" in admin_dashboard.text
    assert "filterSku" in admin_dashboard.text
    assert "filterName" in admin_dashboard.text
    assert "filterCategory" in admin_dashboard.text
    assert "filterPrice" in admin_dashboard.text
    assert "filterStock" in admin_dashboard.text
    assert "filterWeight" in admin_dashboard.text
