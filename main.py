import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers.api import router as api_router
from app.routers.web import router as web_router
from app.services import ProductDomainException


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await init_db()
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


@app.exception_handler(Exception)
async def global_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please contact system administrator."},
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
