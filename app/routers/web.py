import io
import uuid
from decimal import Decimal, InvalidOperation
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import check_database_health, get_db
from app.schemas import ProductCreate, ProductUpdate
from app.services import (
    CsvImportService,
    DuplicateSkuException,
    InsufficientStockException,
    ProductNotFoundException,
    ProductService,
    PurchaseService,
)

router = APIRouter(include_in_schema=False)
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def index_view(
    request: Request,
    query: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 24,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    safe_page = max(1, page)
    safe_limit = max(1, min(100, limit))
    skip = (safe_page - 1) * safe_limit
    products, total_count = await ProductService.list_products(
        db=db,
        query=query,
        category=category,
        skip=skip,
        limit=safe_limit,
    )
    categories = await ProductService.list_categories(db)
    total_pages = max(1, (total_count + safe_limit - 1) // safe_limit)
    response = templates.TemplateResponse(
        request,
        "index.html",
        {
            "products": products,
            "categories": categories,
            "total_count": total_count,
            "active_category": category or "all",
            "active_query": query or "",
            "current_page": safe_page,
            "total_pages": total_pages,
            "page_size": safe_limit,
        },
    )
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@router.get("/index.html", response_class=HTMLResponse)
async def index_html_view(
    request: Request,
    query: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 24,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    return await index_view(request, query, category, page, limit, db)


@router.get("/src/{path:path}")
async def handle_src_asset(path: str) -> Response:
    return Response(content="", media_type="application/javascript")


@router.get("/favicon.ico")
async def favicon_handler() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/partials/products", response_class=HTMLResponse)
async def product_grid_partial(
    request: Request,
    query: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    limit: int = 24,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    safe_page = max(1, page)
    safe_limit = max(1, min(100, limit))
    skip = (safe_page - 1) * safe_limit
    products, total_count = await ProductService.list_products(
        db=db,
        query=query,
        category=category,
        skip=skip,
        limit=safe_limit,
    )
    total_pages = max(1, (total_count + safe_limit - 1) // safe_limit)
    return templates.TemplateResponse(
        request,
        "partials/product_grid.html",
        {
            "products": products,
            "total_count": total_count,
            "current_page": safe_page,
            "total_pages": total_pages,
            "page_size": safe_limit,
            "active_category": category or "all",
            "active_query": query or "",
        },
    )


@router.post("/partials/purchase", response_class=HTMLResponse)
async def purchase_partial(
    request: Request,
    product_id: uuid.UUID = Form(...),
    quantity: int = Form(...),
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    try:
        purchase_result = await PurchaseService.purchase_product(
            db=db,
            product_id=product_id,
            quantity=quantity,
        )
        product = await ProductService.get_by_id(db, product_id)
        return templates.TemplateResponse(
            request,
            "partials/purchase_result.html",
            {
                "success": True,
                "purchase": purchase_result,
                "product": product,
                "message": f"Successfully purchased {quantity} unit(s) of {product.name}.",
            },
            headers={"HX-Trigger": "transactionConfirmed"},
        )
    except InsufficientStockException as exception:
        product = await ProductService.get_by_id(db, product_id)
        return templates.TemplateResponse(
            request,
            "partials/purchase_result.html",
            {
                "success": False,
                "product": product,
                "message": str(exception),
            },
            status_code=status.HTTP_409_CONFLICT,
        )
    except ProductNotFoundException as exception:
        return templates.TemplateResponse(
            request,
            "partials/purchase_result.html",
            {
                "success": False,
                "product": None,
                "message": str(exception),
            },
            status_code=status.HTTP_404_NOT_FOUND,
        )
    except ValueError as exception:
        product = await ProductService.get_by_id(db, product_id)
        return templates.TemplateResponse(
            request,
            "partials/purchase_result.html",
            {
                "success": False,
                "product": product,
                "message": str(exception),
            },
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


@router.post("/partials/products/create", response_class=HTMLResponse)
async def create_product_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    try:
        form = await request.form()
        raw_sku = str(form.get("sku", "")).strip().upper()
        raw_name = str(form.get("name", "")).strip()
        raw_category = str(form.get("category", "")).strip()
        raw_price = str(form.get("price", "")).strip()
        raw_stock = str(form.get("stock", "")).strip()
        raw_weight = str(form.get("weight_kg", "")).strip()
        raw_description = str(form.get("description", "")).strip() or None

        if not raw_sku:
            return HTMLResponse(
                content="""
                <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                    <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>SKU is required.</span>
                </div>
                """,
                status_code=status.HTTP_200_OK,
            )

        existing = await ProductService.get_by_sku(db, raw_sku)
        if existing is not None:
            return HTMLResponse(
                content=f"""
                <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                    <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Product with SKU "{raw_sku}" already exists. Please choose a different SKU.</span>
                </div>
                """,
                status_code=status.HTTP_200_OK,
            )

        try:
            price_val = Decimal(raw_price)
        except (InvalidOperation, TypeError):
            return HTMLResponse(
                content="""
                <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                    <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Price must be a valid numeric value.</span>
                </div>
                """,
                status_code=status.HTTP_200_OK,
            )

        try:
            stock_val = int(raw_stock)
        except (ValueError, TypeError):
            return HTMLResponse(
                content="""
                <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                    <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Stock must be a valid integer.</span>
                </div>
                """,
                status_code=status.HTTP_200_OK,
            )

        try:
            weight_val = Decimal(raw_weight)
        except (InvalidOperation, TypeError):
            return HTMLResponse(
                content="""
                <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                    <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Weight must be a valid numeric value.</span>
                </div>
                """,
                status_code=status.HTTP_200_OK,
            )

        payload = ProductCreate(
            sku=raw_sku,
            name=raw_name,
            category=raw_category,
            price=price_val,
            stock=stock_val,
            weight_kg=weight_val,
            description=raw_description,
        )
        await ProductService.create_product(db, payload)

        return HTMLResponse(
            content=f"""
            <div class="space-y-4">
                <div class="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-200 flex items-start gap-3">
                    <svg class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <div class="space-y-1">
                        <p class="font-semibold text-emerald-300">Product "{payload.name}" created successfully!</p>
                        <p class="text-emerald-300/80">SKU <span class="font-mono font-bold text-white">{payload.sku}</span> has been stored and added to the store catalog.</p>
                    </div>
                </div>
                <div class="pt-2 flex items-center justify-end">
                    <button type="button"
                            onclick="window.location.reload();"
                            class="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20">
                        Continue
                    </button>
                </div>
            </div>
            <script>
                const formEl = document.getElementById('create-product-form');
                if (formEl) formEl.style.display = 'none';
            </script>
            """,
            status_code=status.HTTP_200_OK,
        )
    except DuplicateSkuException as exception:
        return HTMLResponse(
            content=f"""
            <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Product with SKU already exists: {exception}</span>
            </div>
            """,
            status_code=status.HTTP_200_OK,
        )
    except ValueError as exception:
        return HTMLResponse(
            content=f"""
            <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Validation error: {exception}</span>
            </div>
            """,
            status_code=status.HTTP_200_OK,
        )
    except Exception as exception:
        return HTMLResponse(
            content=f"""
            <div class="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Error creating product: {exception}</span>
            </div>
            """,
            status_code=status.HTTP_200_OK,
        )


@router.post("/partials/products/{product_id}/update", response_class=HTMLResponse)
async def update_product_partial(
    request: Request,
    product_id: uuid.UUID,
    name: str = Form(...),
    category: str = Form(...),
    price: Decimal = Form(...),
    stock: int = Form(...),
    weight_kg: Decimal = Form(...),
    description: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    try:
        payload = ProductUpdate(
            name=name,
            category=category,
            price=price,
            stock=stock,
            weight_kg=weight_kg,
            description=description,
        )
        product = await ProductService.update_product(db, product_id, payload)
        return templates.TemplateResponse(
            request,
            "partials/product_card.html",
            {
                "product": product,
            },
        )
    except Exception:
        product = await ProductService.get_by_id(db, product_id)
        return templates.TemplateResponse(
            request,
            "partials/product_card.html",
            {
                "product": product,
            },
        )


@router.delete("/partials/products/{product_id}")
@router.post("/partials/products/{product_id}/delete")
@router.post("/partials/products/{product_id}")
async def delete_product_partial(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await ProductService.delete_product(db, product_id)
        return Response(content="", status_code=status.HTTP_200_OK)
    except ProductNotFoundException:
        return Response(content="", status_code=status.HTTP_404_NOT_FOUND)


@router.post("/partials/import-csv", response_class=HTMLResponse)
async def import_csv_partial(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return templates.TemplateResponse(
            request,
            "partials/csv_result.html",
            {
                "success": False,
                "summary": None,
                "error_message": "Invalid file format. Please upload a .csv file.",
            },
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    content = await file.read()
    summary = await CsvImportService.import_csv(db, content)
    return templates.TemplateResponse(
        request,
        "partials/csv_result.html",
        {
            "success": summary.successful_imports > 0 or summary.failed_imports == 0,
            "summary": summary,
            "error_message": None,
        },
    )


@router.get("/sample-csv")
async def download_sample_csv() -> StreamingResponse:
    csv_content = (
        "sku,name,description,category,price,stock,weight_kg\n"
        "KNT-MON-4K144,4K 144Hz Gaming Monitor,IPS 1ms HDR600 FreeSync Premium Pro,Displays,699.99,15,6.800\n"
        "KNT-KEY-WIRELESS,Low-Profile Wireless Mechanical Keyboard,Bluetooth 5.2 and 2.4GHz with red linear switches,Peripherals,129.50,45,0.720\n"
        "KNT-MIC-STUDIO,Broadcast USB-C Condenser Microphone,Cardioid pickup with internal pop filter and shockmount,Audio,159.00,20,0.880\n"
        "KNT-SSD-2TB-GEN5,PCIe Gen5 NVMe SSD 2TB,Up to 12000 MB/s sequential transfer with heatsink,Storage,279.99,30,0.085\n"
        "KNT-CASE-ITX,Sandblasted Mini-ITX SFF Case,CNC-milled anodized aluminum chassis with PCIe 4.0 riser cable,Computing,199.00,10,4.250\n"
    )
    stream = io.BytesIO(csv_content.encode("utf-8"))
    headers = {
        "Content-Disposition": "attachment; filename=sample_products.csv"
    }
    return StreamingResponse(stream, media_type="text/csv", headers=headers)


@router.get("/maintenance", response_class=HTMLResponse)
async def maintenance_view(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "maintenance.html",
        {
            "status_code": status.HTTP_503_SERVICE_UNAVAILABLE,
            "detail": "Database service is temporarily offline or undergoing maintenance.",
        },
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@router.get("/health")
async def health_view() -> JSONResponse:
    is_connected = await check_database_health()
    if is_connected:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "healthy", "database": "connected"},
        )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "maintenance", "database": "disconnected"},
    )


@router.get("/api/health")
async def api_health_view() -> JSONResponse:
    is_connected = await check_database_health()
    if is_connected:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "healthy", "database": "connected"},
        )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "maintenance", "database": "disconnected"},
    )

