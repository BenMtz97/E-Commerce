# E-Commerce App &middot; Enterprise Platform

Production-grade, resilient e-commerce application built with a Pragmatic Layered Monolith architecture using FastAPI, Async PostgreSQL with SQLAlchemy 2.0, Pydantic v2, Jinja2, HTMX, Tailwind CSS, Alpine.js, and React/TypeScript.

> **CSV File Download Date: October 16, 2026**

---

## 1. Architectural Decisions & Design Rationale

### A. Pragmatic Layered Monolith Pattern
The application follows a strict separation of concerns across layers:
- **`app/database.py`**: SQLAlchemy 2.0 async engine and session factory with automatic pool recovery (`pool_pre_ping=True`), health verification (`check_database_health`), and automatic schema/user seeding (`init_db`).
- **`app/models.py`**: Declarative ORM domain models (`Product`, `User`, `Order`) with table-level check constraints (preventing negative price, stock, or weight, and enforcing positive order quantities) and indexed lookups.
- **`app/schemas.py`**: Pydantic v2 validation contracts for API requests, responses, authentication payloads, order schemas, CSV row normalization, and multi-layer security filters.
- **`app/security.py`**: Cryptographic password hashing (**PBKDF2-HMAC-SHA256** with 100,000 iterations and 16-byte random salts), HMAC-SHA256 signed session tokens, and FastAPI role dependencies (`get_current_user_optional`, `require_authenticated_user`, `require_admin_user`).
- **`app/services.py`**: Pure domain logic encapsulation (`ProductService`, `PurchaseService`, `CsvImportService`, `UserService`, `OrderService`). Database transactions and locks are controlled at the service boundary, decoupled from HTTP transport.
- **`app/routers/`**:
  - `api.py`: REST API returning predictable HTTP status codes (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `503`) with zero unhandled `500` server errors.
  - `web.py`: Server-rendered Jinja2 views (`index.html`, `admin.html`, `orders.html`, `maintenance.html`) and reactive HTMX partials.

---

## 2. Role-Based Access Control (RBAC), Credentials & Authentication

### A. Default Seeded Accounts
On startup, the application automatically seeds two default accounts with **PBKDF2-HMAC-SHA256** encrypted passwords:

| Role | Email | Password | Environment & Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@admin.com` | `admin` | Full Inventory Management, Products List Multi-Filter, Bulk CSV Upload, Sample CSV Download, Create Admin Users |
| **User** | `user@user.com` | `user` | Storefront Catalog Browsing, Product Details, Cardbank Checkout Modal, Personal Order History (**My Orders**) |

### B. Role Separation & Session Behavior
1. **Admin Role (`admin`)**:
   - **Product CRUD**: Create, Edit, and Delete products in the catalog.
   - **Products List View (`/admin` & `Products List` tab)**: Displays products in a structured management table rather than storefront cards, featuring **Multi-Column Filtering** inputs at the top of every column (`SKU`, `Product Name`, `Category`, `Price`, `Stock`, `Weight`) and a **Clear Filters** action.
   - **Bulk CSV Import & Sample CSV**: Upload CSV batches and download the **Sample CSV** template (`/sample-csv`). The **Sample CSV** button appears strictly in the `admin` environment and is hidden from normal users and unauthenticated visitors.
   - **Create Admin User**: Dedicated **Create Admin User** modal (`/admin/create-admin` and `POST /api/auth/create-admin`) allowing existing administrators to provision additional `admin` accounts.
   - **No Purchase Button**: Administrators manage inventory and do not see customer purchase buttons.
2. **Normal User Role (`user`)**:
   - **Browse, Filter & View Products**: Search by keyword, filter by category, and inspect full product specifications.
   - **Purchase Products**: See the **Buy Now** button on in-stock products (`stock > 0`) and complete checkout via the Cardbank Purchase Modal.
   - **View Personal Orders (`/orders` & `My Orders` tab)**: Inspect all orders associated with their user account (`Order ID`, `SKU`, `Product Name`, `Quantity`, `Total Charged`, `Card Used`, `Status`, and `Timestamp`).
3. **Unauthenticated Visitors (No Active Session)**:
   - Can browse, search, filter products, and open the product details modal.
   - **Purchase buttons** are completely hidden when no session is active in order to create an order ID after the transaction.
   - **Login** and **Register** buttons are displayed in the navigation bar.
   - Public registration (`/register` and `POST /api/auth/register`) creates **normal user accounts only** (`role = "user"`).
   - Logging in or registering immediately updates/reloads the active session and redirects to the appropriate workspace (`X-Redirect-Url` / `HX-Redirect`).

---

## 3. Cardbank Checkout Selector, Double-Purchase Safeguard & User Orders

Inside the Purchase Modal, checkout transactions are tested using the **Cardbank Payment Selector**:
- **Explicit User Selection Required**: The card selector starts unselected (`-- Select a Bank Card --`) and never auto-selects the succeed card. The submit button remains disabled (`Select a Card`) until the user explicitly chooses a card option, and backend routes reject empty card submissions with `HTTP 400`.
- **`XXX-1234 SUCCEED`**:
  - Authorizes the payment and acquires an exclusive row lock (`SELECT ... FOR UPDATE`).
  - Decrements the product stock by the purchased quantity.
  - Creates a persistent `Order` record associated with the authenticated user (`user_id` and `user_email`).
  - Displays a **Purchase Succeeded** confirmation message with the generated Order ID and a direct link to **View My Orders**.
- **`XXX-1111 REJECTED`**:
  - Simulates an issuing bank decline (`PaymentRejectedException`).
  - Leaves product stock completely untouched and creates no order.
  - Displays a **Purchase Rejected** error message explaining that the card was declined and stock was not modified.
- **Double-Purchase Prevention**:
  - Upon clicking **Confirm Purchase**, the submit button is immediately deactivated (`Purchase Deactivated`) so a user cannot accidentally trigger a double purchase.

---

## 4. Security & Injection Defense

- **Formula & CSV Injection Prevention**:
  - Rejects any cell starting with spreadsheet formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) or Dynamic Data Exchange (DDE) payloads across **all** columns (`sku`, `name`, `description`, `category`, `price`, `stock`, `weight_kg`).
- **Script Injection (XSS) Prevention**:
  - Rejects disallowed HTML/script tags (`<script>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`), `javascript:` protocols, and inline event handlers (`onerror=`, `onload=`).
- **SQL Injection Defense-in-Depth**:
  - Combines SQLAlchemy parameterized queries with domain-level regex validation rejecting `--`, `/* */`, `; DROP`, `UNION SELECT`, and `' OR '1'='1'`.
- **Concurrency Control (`SELECT ... FOR UPDATE`)**:
  - `PurchaseService.purchase_product` uses pessimistic row-level locking alongside per-product async locks so concurrent checkouts on scarce stock never oversell.
- **High Availability & HTTP 503 Maintenance Mode**:
  - Database connection errors (`OperationalError`, `InterfaceError`, `ConnectionRefusedError`) are intercepted globally, returning a responsive `503 Service Unavailable` Maintenance Page (`maintenance.html`) with live `/api/health` auto-recovery polling.

---

## 5. Quickstart with Docker Compose

The multi-stage `Dockerfile` includes both the **Frontend Builder stage** (`node:22-slim` running `npm install --legacy-peer-deps` and `npm run build`) and the **Python Runtime stage** (`python:3.11-slim` running FastAPI/Uvicorn on port `8000` with Async PostgreSQL 16):

```bash
docker compose up --build
```

Once running:
- **Web Storefront**: [http://localhost:8000](http://localhost:8000)
- **Admin Products List (requires Admin login)**: [http://localhost:8000/admin](http://localhost:8000/admin)
- **User Orders History (requires User login)**: [http://localhost:8000/orders](http://localhost:8000/orders)
- **Interactive Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check Endpoint**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## 6. Local Development Setup

### Backend (Python FastAPI + Async SQLAlchemy)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (React 19 + TypeScript + Vite + Tailwind CSS)
> Note: `.npmrc` is preconfigured with `legacy-peer-deps=true` and `package.json` supports `esbuild` `^0.25.0 || ^0.27.0 || ^0.28.0` to prevent `ERESOLVE` peer conflicts with Vite 8.

```bash
npm install --legacy-peer-deps
npm run lint
npm run build
npm test
```

---

## 7. GitHub Actions 6-Stage CI Workflow & Automated Tests

The repository includes a 6-stage sequential GitHub Actions workflow in `.github/workflows/ci.yml` that validates every requirement from compilation to final order creation:

1. **Stage 1 (`stage-1-build-and-compile`)**: Installs frontend dependencies (`npm install --legacy-peer-deps`), runs TypeScript type checking (`npm run lint`), builds the production bundle (`npm run build`), compiles all Python files (`py_compile`), and executes `tests/test_standalone_suite.py`.
2. **Stage 2 (`stage-2-auth-and-rbac`)**: Runs `pytest tests/test_auth.py -v` verifying PBKDF2-HMAC-SHA256 password hashing, login session creation, user registration role constraints, and admin user creation RBAC.
3. **Stage 3 (`stage-3-catalog-and-multifilter`)**: Runs `pytest tests/test_crud.py -v` verifying product CRUD, SKU uniqueness, and XSS/SQLi input rejection.
4. **Stage 4 (`stage-4-csv-security-and-admin-env`)**: Runs `pytest tests/test_csv_import.py -v` verifying batch CSV upload and rejection of formula (`=`, `+`, `-`, `@`), XSS, and SQL injection payloads across all columns.
5. **Stage 5 (`stage-5-concurrency-and-resilience`)**: Runs `pytest tests/test_concurrency.py tests/test_maintenance.py -v` verifying `asyncio.gather()` concurrent checkout row locking and HTTP 503 Maintenance Mode recovery.
6. **Stage 6 (`stage-6-cardbank-and-order-creation`)**: Runs `pytest tests/test_orders_and_cards.py -v` and `node --test tests/app_behavior.test.mjs` verifying unselected card rejection, `XXX-1111 REJECTED` stock preservation, `XXX-1234 SUCCEED` stock deduction, double-purchase button deactivation, Admin-only Sample CSV visibility, Multi-Column filtering, and end-to-end User Order creation and order history listing.

### Running All Tests Locally
```bash
# Run full Python Pytest suite
pytest -v

# Run Node behavioral suite + Python standalone contract & AST verification suite
npm test
```
