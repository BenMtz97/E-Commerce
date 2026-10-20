import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    CsvImportSummary,
    ProductCreate,
    ProductPurchaseRequest,
    ProductPurchaseResponse,
    ProductResponse,
    ProductUpdate,
)
from app.services import (
    CsvImportService,
    DuplicateSkuException,
    InsufficientStockException,
    ProductNotFoundException,
    ProductService,
    PurchaseService,
)

router = APIRouter(prefix="/api/products", tags=["Products"])


@router.get("", response_model=List[ProductResponse], status_code=status.HTTP_200_OK)
async def list_products(
    query: Optional[str] = Query(default=None, max_length=100),
    category: Optional[str] = Query(default=None, max_length=100),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[ProductResponse]:
    products, _ = await ProductService.list_products(
        db=db,
        query=query,
        category=category,
        skip=skip,
        limit=limit,
    )
    return [ProductResponse.model_validate(p) for p in products]


@router.get("/categories", response_model=List[str], status_code=status.HTTP_200_OK)
async def list_categories(db: AsyncSession = Depends(get_db)) -> List[str]:
    return await ProductService.list_categories(db)


@router.get("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    try:
        product = await ProductService.get_by_id(db, product_id)
        return ProductResponse.model_validate(product)
    except ProductNotFoundException as exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exception),
        )


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    try:
        product = await ProductService.create_product(db, payload)
        return ProductResponse.model_validate(product)
    except DuplicateSkuException as exception:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exception),
        )


@router.put("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@router.post("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@router.patch("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@router.put("/{product_id}/update", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@router.post("/{product_id}/update", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@router.patch("/{product_id}/update", response_model=ProductResponse, status_code=status.HTTP_200_OK)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
) -> ProductResponse:
    try:
        product = await ProductService.update_product(db, product_id, payload)
        return ProductResponse.model_validate(product)
    except ProductNotFoundException as exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exception),
        )


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.post("/{product_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await ProductService.delete_product(db, product_id)
    except ProductNotFoundException as exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exception),
        )


@router.post(
    "/{product_id}/purchase",
    response_model=ProductPurchaseResponse,
    status_code=status.HTTP_200_OK,
)
async def purchase_product(
    product_id: uuid.UUID,
    payload: ProductPurchaseRequest,
    db: AsyncSession = Depends(get_db),
) -> ProductPurchaseResponse:
    try:
        return await PurchaseService.purchase_product(
            db=db,
            product_id=product_id,
            quantity=payload.quantity,
        )
    except ProductNotFoundException as exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exception),
        )
    except InsufficientStockException as exception:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exception),
        )
    except ValueError as exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exception),
        )


@router.post(
    "/import-csv",
    response_model=CsvImportSummary,
    status_code=status.HTTP_200_OK,
)
async def import_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> CsvImportSummary:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a valid .csv file.",
        )
    try:
        content = await file.read()
        return await CsvImportService.import_csv(db, content)
    except Exception as exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process CSV file: {str(exception)}",
        )
