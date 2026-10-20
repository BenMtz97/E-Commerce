# E-Commerce App &middot; Enterprise Platform

Production-grade, resilient e-commerce application built with a Layered Monolith architecture using FastAPI, Async PostgreSQL with SQLAlchemy 2.0, Pydantic v2, Jinja2, HTMX, Tailwind CSS, and Alpine.js.

> **CSV File Download Date: October 16, 2026**

---

## 1. Architectural Decisions & Design Rationale

### A. Pragmatic Layered Monolith Pattern
The application follows a clean separation of concerns:
- **`app/database.py`**: SQLAlchemy 2.0 async engine and session factory with automatic pool recovery (`pool_pre_ping=True`) and database initialization.
- **`app/models.py`**: Strict ORM domain models with declarative mapping, table-level check constraints (preventing negative price, stock, or weight), and indexed lookups.
- **`app/schemas.py`**: Pydantic v2 validation contracts for API requests, responses, CSV row normalization, and security filters.
- **`app/services.py`**: Pure domain logic encapsulation. Database transactions are controlled at the service boundary, completely decoupled from HTTP transport.
- **`app/routers/`**:
  - `api.py`: Versioned REST API with predictable HTTP status codes (200, 201, 204, 400, 404, 409, 422) and no unhandled 500 exceptions.
  - `web.py`: Server-rendered Jinja2 views powering reactive HTMX swaps.

### B. Security & Injection Defense
- **Formula & CSV Injection Prevention**:
  - Rejects any cell starting with active spreadsheet formula triggers (`=`, `+`, `-`, `@`, `|`, `%`, `\t`, `\r`) or containing Dynamic Data Exchange (DDE) execution syntax (`cmd|`, `powershell|`, `calc|`, `notepad|`, `|' /C ...'!A0`, macro function invocations).
  - Every individual cell across all columns in bulk CSV uploads is scanned and sanitized before database processing, eliminating CSV injection (CWE-1236) vulnerabilities.
- **Script Injection (XSS) Prevention**:
  - All text inputs across SKU, model name, category, and description are scanned against disallowed HTML elements (`<script>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`, `<applet>`), `javascript:` URI schemes, and inline event triggers (`onerror=`, `onload=`, `onclick=`).
  - Attempts are rejected at the Pydantic schema validation boundary and within the CSV bulk import processor.
- **SQL Injection Defense-in-Depth**:
  - While all database access uses SQLAlchemy parameterized prepared statements, domain-level validation aggressively detects and rejects classic SQL injection patterns (comment delimiters `--`, `/* */`, statement chains `; DROP`, `; DELETE`, tautologies `' OR 1=1`, and `UNION SELECT` expressions).
  - SKU field is restricted to a strict whitelist: `^[A-Za-z0-9_.-]+$`.

### C. Responsive Two-Tier Search & Filter Layout
- To prevent the search input from getting squished or obscured when the category taxonomy grows large, the search bar and category selector use a decoupled two-tier architecture:
  - **Tier 1 (Full-Width Search Bar)**: Spans the complete container width (`w-full`) with comfortable `py-3` padding and large typography, ensuring users can always see what they are typing without horizontal compression.
  - **Tier 2 (Category Filter Row)**: Sits directly beneath the search bar with smooth horizontal scrolling (`overflow-x-auto scrollbar-thin`), category counts, and a one-click reset action, accommodating dozens of categories without impacting search input visibility.

### D. Concurrency Control: Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
Under heavy checkout loads, multiple users may attempt to purchase the remaining inventory of a product simultaneously. An uncoordinated read-modify-write cycle leads to the classic lost update race condition and inventory overselling.
- **Chosen Approach**: `PurchaseService.purchase_product` acquires an exclusive pessimistic row lock via `.with_for_update()` inside an atomic async database transaction.
- **Behavior**: Competing purchase transactions block at the database engine until the active transaction commits or rolls back. If remaining stock is lower than the requested quantity, the transaction aborts and cleanly returns an HTTP 409 Conflict.
- **Trade-Off**: Pessimistic row locking introduces minimal serialization latency on a per-product level, but guarantees 100% inventory integrity without the client retry storms common to optimistic concurrency control.

### E. Search Engine: Hybrid Full-Text and Flexible Indexing
- **Chosen Approach**: Native PostgreSQL full-text search with `to_tsvector` and `plainto_tsquery` over `name` and `description` supported by a GIN index, combined with case-insensitive `ILIKE` pattern matching across SKU, name, and category.
- **Trade-Off**: Avoids the operational overhead, synchronization lag, and hosting expense of external search clusters (Elasticsearch/Meilisearch) while delivering sub-millisecond query execution directly inside the relational store.

### F. UI Architecture: HTMX + Alpine.js + Tailwind CSS
- **HTMX**: Powers live search input debouncing (200ms) and out-of-band DOM swaps (`hx-swap-oob`) for instantaneous inventory counter updates without full page reloads.
- **Alpine.js**: Handles lightweight client-side micro-interactions: mobile hamburger menu drawer, accessible purchase modals, and real-time total price calculation based on local stepper inputs.
- **Tailwind CSS**: Delivers a mobile-first, responsive interface with a 4-column desktop grid, WCAG AA contrast, and zero layout shifting.

### G. High Availability & Database Outage Handling (Maintenance Mode)
- **Zero Server Crashes**: The FastAPI application lifespan and database dependencies gracefully intercept connection failures (`SQLAlchemyError`, `OperationalError`, `InterfaceError`, `ConnectionRefusedError`, Docker database stop/restart).
- **HTTP 503 Maintenance Page**: Rather than exposing raw 500 server errors or generic JSON failures, the application renders a dedicated, responsive Maintenance Page (`maintenance.html`) with HTTP status `503 Service Unavailable`.
- **Automated Health Recovery**: The maintenance page includes real-time background health polling (`/api/health`) with auto-reconnection countdown, automatically reloading the catalog as soon as the database container is restarted.
- **API Graceful Degradation**: Direct REST API consumers receive a clean, predictable HTTP 503 JSON payload (`status: 503, detail: "Database service is temporarily unavailable..."`) adhering to strict status code standards.

---

## 2. Quickstart with Docker Compose

Run the entire stack (FastAPI server and PostgreSQL database) with a single command:

```bash
docker compose up --build
```

Once running:
- **Web Storefront**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Alternative ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Sample CSV Download**: [http://localhost:8000/sample-csv](http://localhost:8000/sample-csv)

---

## 3. Local Development Setup

### Prerequisites
- Python 3.10+
- PostgreSQL 16 (or SQLite with aiosqlite for standalone testing)

### Step 1: Clone and Create Virtual Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Configure Environment Variables
Create a `.env` file in the project root:
```env
APP_NAME="E-Commerce App"
DEBUG=true
HOST=0.0.0.0
PORT=8000
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ecommerce
```

### Step 3: Run the Development Server
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. Running Automated Tests

The test suite validates CRUD operations, CSV batch ingestion, injection security filters, and concurrency safety:

```bash
pytest
```

To run individual test modules with detailed verbosity:

```bash
# Test Product CRUD operations, input constraints, and injection rejections
pytest tests/test_crud.py -v

# Test CSV batch parsing, malformed rows, and formula/XSS/SQL injection defenses
pytest tests/test_csv_import.py -v

# Test concurrent checkout race-condition prevention with asyncio.gather()
pytest tests/test_concurrency.py -v

# Test database outage interception and HTTP 503 maintenance page
pytest tests/test_maintenance.py -v
```

---

## 5. Concurrency Test Mechanics

`tests/test_concurrency.py` simulates heavy contention on scarce inventory:
1. Seeds a product with `stock = 3`.
2. Dispatches 10 simultaneous purchase requests for `quantity = 1` concurrently using `asyncio.gather()`.
3. Verifies that exactly 3 requests succeed with `HTTP 200`.
4. Verifies that exactly 7 requests are rejected with `HTTP 409 Conflict`.
5. Asserts the database stock is strictly `0` with zero overselling.
