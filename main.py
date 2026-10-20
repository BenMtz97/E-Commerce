import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.database import init_db
from app.routers.api import router as api_router
from app.routers.web import router as web_router
from app.services import ProductDomainException

templates = Jinja2Templates(directory="app/templates")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        await init_db()
    except Exception:
        pass
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise E-Commerce Monolith with PostgreSQL Async, HTMX, and Concurrency Controls",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

if os.path.isdir("app/static"):
    app.mount("/static", StaticFiles(directory="app/static"), name="static")


def is_database_offline_exception(exc: Exception) -> bool:
    if isinstance(exc, (SQLAlchemyError, ConnectionError, OSError, TimeoutError)):
        return True
    error_message = str(exc).lower()
    offline_keywords = [
        "connection refused",
        "cannot connect",
        "could not connect",
        "connection closed",
        "terminating connection",
        "closed unexpectedly",
        "is the server running",
        "database down",
        "asyncpg",
        "psycopg",
        "operationalerror",
        "interfaceerror",
        "server closed the connection",
        "broken pipe",
        "connection reset",
    ]
    return any(keyword in error_message for keyword in offline_keywords)


async def render_maintenance_response(
    request: Request,
    exc: Optional[Exception] = None,
) -> Response:
    is_api_route = request.url.path.startswith("/api/") and not bool(
        request.headers.get("hx-request")
    )
    if is_api_route:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": "Database service is temporarily unavailable. System is in maintenance mode.",
                "status": 503,
            },
        )

    headers = {}
    if request.headers.get("hx-request"):
        headers["HX-Retarget"] = "body"
        headers["HX-Reswap"] = "innerHTML"

    return templates.TemplateResponse(
        request,
        "maintenance.html",
        {
            "status_code": status.HTTP_503_SERVICE_UNAVAILABLE,
            "detail": "Database service is temporarily offline or undergoing maintenance.",
        },
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        headers=headers,
    )


@app.get("/src/{path:path}", include_in_schema=False)
async def fallback_src_handler(path: str) -> Response:
    return Response(content="", media_type="application/javascript")


@app.get("/favicon.ico", include_in_schema=False)
async def fallback_favicon_handler() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.exception_handler(ProductDomainException)
async def domain_exception_handler(
    request: Request, exc: ProductDomainException
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request, exc: SQLAlchemyError
) -> Response:
    return await render_maintenance_response(request, exc)


@app.exception_handler(ConnectionError)
async def connection_exception_handler(
    request: Request, exc: ConnectionError
) -> Response:
    return await render_maintenance_response(request, exc)


@app.exception_handler(Exception)
async def global_exception_handler(
    request: Request, exc: Exception
) -> Response:
    if is_database_offline_exception(exc):
        return await render_maintenance_response(request, exc)

    is_api_route = request.url.path.startswith("/api/") and not bool(
        request.headers.get("hx-request")
    )
    if is_api_route:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An unexpected error occurred. Please contact system administrator."},
        )

    headers = {}
    if request.headers.get("hx-request"):
        headers["HX-Retarget"] = "body"
        headers["HX-Reswap"] = "innerHTML"

    return templates.TemplateResponse(
        request,
        "maintenance.html",
        {
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "detail": "An unexpected server error occurred. System is operating in fallback mode.",
        },
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers=headers,
    )


app.include_router(web_router)
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main.py:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
