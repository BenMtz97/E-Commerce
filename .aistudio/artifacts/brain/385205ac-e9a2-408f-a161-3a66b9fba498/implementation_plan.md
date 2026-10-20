# Enterprise E-Commerce Platform with FastAPI, HTMX & Concurrency Control

Production-grade, resilient e-commerce application built with a Layered Monolith architecture using FastAPI, Async PostgreSQL with SQLAlchemy 2.0, Pydantic v2, Jinja2, HTMX, Tailwind CSS, and Alpine.js, ready for single-command `docker compose up --build` deployment and automated pytest concurrency verification.

## User Review & Critical Decisions

> [!IMPORTANT]
> Because questions were dismissed with default preferences, the following enterprise defaults are selected:
> - **Product Domain & Theme**: High-performance tech gear & hardware catalog with a sophisticated slate/neutral design aesthetic, strict anti-slop guidelines, and typography with Plus Jakarta Sans and tabular figures.
> - **PostgreSQL Search Strategy**: Native Full-Text Search with `tsvector` and `to_tsquery` over `name` and `description` with weighted ranking (`setweight`), backed by automatic indexing and a graceful fallback to case-insensitive pattern matching (`ILIKE`).
> - **Catalog & CSV Provisioning**: Seed catalog with realistic products across diverse categories (Computing, Audio, Displays, Storage, Peripherals) and include a downloadable sample CSV with date acknowledgment ("CSV File Download Date: October 20, 2026").

- **Concurrency & Row-Locking**: Pessimistic locking (`with_for_update()`) inside an atomic database transaction to guarantee zero overselling during simultaneous checkout attempts.
- **Frontend Architecture**: Server-rendered Jinja2 templates enriched with HTMX for debounced search and live DOM swapping, combined with Alpine.js for client-side modal state, quantity calculations, and mobile hamburger navigation.

---

## 1. Overview & Core Concept

- **What It Does**: A complete e-commerce inventory and purchasing platform featuring real-time catalog search, transactional stock deduction with race condition prevention, multi-column CSV batch ingestion with row-level validation reports, and interactive mobile-responsive purchasing modals.
- **Target Audience / Persona**: Store operators, warehouse administrators, and e-commerce shoppers requiring instantaneous search, real-time stock feedback, and zero duplicate or race-condition transaction errors.
- **Key Value**: Delivers the simplicity and speed of a modern server-driven UI (HTML over the wire via HTMX) paired with enterprise database durability, strict concurrency guards, and full test automation.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Catalog Exploration*: Shopper lands on an adaptive grid (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`). Typing in the search input triggers an instant 250ms debounced HTMX request that updates only `#product-grid` without full page refresh.
  2. *Live Purchase Flow*: Clicking "Buy Now" on any product opens an Alpine.js-powered modal (`w-full max-w-md mx-4`). The user adjusts the quantity stepper, validating against current in-memory stock limits while computing total price dynamically.
  3. *Transactional Checkout*: Submitting the purchase invokes `/api/products/{id}/purchase` via HTMX. The backend locks the row (`SELECT ... FOR UPDATE`), validates stock, commits the purchase, and returns an updated product card partial alongside a success toast.
  4. *CSV Ingestion*: Admins click "Import CSV" to upload batch inventory. The system validates schema, uniqueness, and constraints, returning a summary card showing created count, updated count, and row-by-row error details.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Refined tech hardware aesthetic—deep dark slate backgrounds (`bg-slate-950`), subtle surface contrast (`bg-slate-900/80` with `border-slate-800`), crisp white typography, and vibrant electric blue accents (`blue-500` / `blue-600`).
  - *Typography*: Plus Jakarta Sans for interface headings and body, paired with `font-mono tabular-nums` for prices, weights, SKUs, and inventory counters.
  - *Anti-Slop Discipline*: Zero pills for static metadata (clean unboxed text with `·` separators), clean editorial headings without code comment syntax, no fake telemetry badges, and full 44px mobile touch targets.
  - *Top Bar Contract*: 3-zone layout: Brand wordmark ("KINETIC HARDWARE") — Single-line nav links (Catalog, Import CSV, API Docs) — Quick Action (New Product / Cart summary) + Alpine.js mobile menu drawer.

---

## 3. Key Product Decisions & Trade-Offs

- **Concurrency Control: Pessimistic Row Locking (`SELECT ... FOR UPDATE`)**:
  - *Chosen Approach*: Enforce row-level lock on the target product row within an `async with session.begin():` block before comparing `product.stock >= quantity`.
  - *Why*: Eliminates the "lost update" race condition under high concurrency. Prevents overselling when multiple shoppers checkout the final unit simultaneously.
  - *Alternatives Considered*: Optimistic locking with version numbers was rejected because retrying under high contention causes excessive 409 client-side retry churn.

- **Search Engine: Hybrid PostgreSQL Full-Text Search with Trigram / ILIKE Fallback**:
  - *Chosen Approach*: Leverage PostgreSQL's native `to_tsvector` and `plainto_tsquery` on a composite column/expression across `name` and `description` with a GIN index, falling back seamlessly to `ILIKE` for single-character or non-alphanumeric queries.
  - *Why*: Provides sub-millisecond full-text queries in pure SQL without introducing external search cluster dependencies (Elasticsearch/Meilisearch).

- **UI Stack: Jinja2 + HTMX + Alpine.js + Tailwind CSS**:
  - *Chosen Approach*: HTML-over-the-wire for state synchronization (HTMX swaps partial templates) combined with lightweight Alpine.js for local client micro-interactions (modal visibility, quantity stepper, mobile drawer).
  - *Why*: Eliminates massive frontend build bundles and hydration waterfalls while keeping the application responsive, accessible, and fast.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Web Browser / Client                            │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Alpine.js State Store │  │ HTMX Controller  │  │ Tailwind Mobile │  │
│  │ (Modals, Hamburger)   │  │ (Debounced FTS)  │  │ First Layout    │  │
│  └───────────┬───────────┘  └────────┬─────────┘  └─────────────────┘  │
└──────────────┼───────────────────────┼─────────────────────────────────┘
               │ HTTP / JSON           │ HTTP / HTML Partials
               ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Application Server                        │
│  ┌───────────────────────────────────┐  ┌───────────────────────────┐  │
│  │         Web Router (web.py)       │  │     API Router (api.py)   │  │
│  │   - GET / (Catalog + SSR Shell)   │  │   - GET /products (JSON)  │  │
│  │   - GET /partials/products (HTMX) │  │   - POST /products/create │  │
│  │   - POST /partials/purchase (HTMX)│  │   - POST /products/import │  │
│  │   - POST /partials/import (HTMX)  │  │   - POST /products/buy    │  │
│  └─────────────────┬─────────────────┘  └─────────────┬─────────────┘  │
│                    │                                  │                │
│                    ▼                                  ▼                │
│       ┌────────────────────────────────────────────────────────┐       │
│       │               Services Layer (services.py)             │       │
│       │   - ProductService: CRUD, FTS Query Builder            │       │
│       │   - PurchaseService: with_for_update() Row Locking    │       │
│       │   - CsvImportService: Streaming parse & error summary  │       │
│       └───────────────────────────┬────────────────────────────┘       │
│                                   │                                    │
│                                   ▼                                    │
│       ┌────────────────────────────────────────────────────────┐       │
│       │             Data Access Layer (SQLAlchemy 2.0)         │       │
│       │   - AsyncSession / AsyncEngine                         │       │
│       │   - Product ORM Model with UUID & PG FullText GIN      │       │
│       └───────────────────────────┬────────────────────────────┘       │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ Asyncpg Pool
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL 16 Database                          │
│   - `products` Table: UUID PK, SKU (Unique Index), Price (Numeric)     │
│   - Stock (Integer with CHECK stock >= 0), Weight_kg (Numeric)         │
│   - TsVector generated column with GIN Index for sub-millisecond FTS   │
└────────────────────────────────────────────────────────────────────────┘
```

### Database Schema (SQLAlchemy 2.0 Async)

| Column Name | Type | Constraints / Attributes |
| :--- | :--- | :--- |
| `id` | `UUID(as_uuid=True)` | Primary Key, default `uuid4` |
| `sku` | `VARCHAR(64)` | Unique, Indexed, Not Null |
| `name` | `VARCHAR(255)` | Indexed, Not Null |
| `description` | `TEXT` | Nullable |
| `category` | `VARCHAR(100)` | Indexed, Not Null |
| `price` | `NUMERIC(10, 2)` | Not Null, Check `price >= 0` |
| `stock` | `INTEGER` | Not Null, Check `stock >= 0` |
| `weight_kg` | `NUMERIC(8, 3)` | Not Null, Check `weight_kg >= 0` |
| `created_at` | `TIMESTAMPTZ` | Server default `now()`, Not Null |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, OnUpdate `now()` |

### Interactive Flow & State Transition

```
[User clicks Buy Button]
        │
        ▼
[Alpine.js opens Modal] ───► [Sets active product, quantity=1, max=stock]
        │
        ▼ (User clicks Confirm Purchase)
[HTMX POST /partials/purchase]
        │
        ├──► FastAPI opens Async Transaction (`session.begin()`)
        ├──► Executes: `SELECT * FROM products WHERE id = :id FOR UPDATE`
        ├──► Checks: `if product.stock < requested_qty` ──► Rollback & Return 409 HTML Alert
        ├──► Updates: `product.stock -= requested_qty`
        ├──► Commits transaction
        └──► Returns updated `product_card.html` + dynamic toast event
```

---

## 5. Verification Plan

### Automated Pytest Suite
- **`tests/test_crud.py`**:
  - Verify Product creation, validation constraints, retrieval, pagination, and deletion.
  - Verify FTS search queries matching single terms, multi-word queries, and non-existent keywords.
- **`tests/test_csv_import.py`**:
  - Test valid CSV batch upload with accurate insert counts.
  - Test malformed CSV rows (missing required columns, negative prices, invalid numeric values).
  - Test duplicate SKU collision handling and error summary report.
- **`tests/test_concurrency.py`**:
  - Seed product with `stock = 5`.
  - Dispatch 10 simultaneous asynchronous purchase requests of `quantity = 1` using `asyncio.gather()`.
  - Assert exactly 5 requests succeed (HTTP 200) and exactly 5 requests fail with stock exhaustion (HTTP 409).
  - Verify final database stock is strictly `0` with zero overselling.

### Docker Compose & Local Execution
- Execute `docker compose up --build` verifying:
  - PostgreSQL healthcheck passes before FastAPI launches.
  - Automatic database schema migration/creation on startup.
  - Initial catalog seeding executes cleanly.
  - Web UI available on `http://localhost:8000`.
