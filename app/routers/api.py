import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.schemas import (
    AdminCreateRequest,
    AuthResponse,
    CsvImportSummary,
    OrderResponse,
    ProductCreate,
    ProductPurchaseRequest,
    ProductPurchaseResponse,
    ProductResponse,
    ProductUpdate,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.security import (
    create_session_token,
    get_current_user_optional,
    require_admin_user,
    require_authenticated_user,
)
from app.services import (
    CsvImportService,
    DuplicateSkuException,
    InsufficientStockException,
    OrderService,
    PaymentRejectedException,
    ProductNotFoundException,
    ProductService,
    PurchaseService,
    UserAlreadyExistsException,
    UserService,
)

router = APIRouter()
products_router = APIRouter(prefix="/api/products", tags=["Products"])
auth_router = APIRouter(prefix="/api/auth", tags=["Auth"])
orders_router = APIRouter(prefix="/api/orders", tags=["Orders"])


@products_router.get("", response_model=List[ProductResponse], status_code=status.HTTP_200_OK)
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


@products_router.get("/categories", response_model=List[str], status_code=status.HTTP_200_OK)
async def list_categories(db: AsyncSession = Depends(get_db)) -> List[str]:
    return await ProductService.list_categories(db)


@products_router.get("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
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


@products_router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
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


@products_router.put("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@products_router.post("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@products_router.patch("/{product_id}", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@products_router.put("/{product_id}/update", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@products_router.post("/{product_id}/update", response_model=ProductResponse, status_code=status.HTTP_200_OK)
@products_router.patch("/{product_id}/update", response_model=ProductResponse, status_code=status.HTTP_200_OK)
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


@products_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
@products_router.post("/{product_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
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


@products_router.post(
    "/{product_id}/purchase",
    response_model=ProductPurchaseResponse,
    status_code=status.HTTP_200_OK,
)
async def purchase_product(
    product_id: uuid.UUID,
    payload: ProductPurchaseRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> ProductPurchaseResponse:
    try:
        return await PurchaseService.purchase_product(
            db=db,
            product_id=product_id,
            quantity=payload.quantity,
            card_option=payload.card_option,
            user_id=current_user.id if current_user else None,
            user_email=current_user.email if current_user else None,
        )
    except ProductNotFoundException as exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exception),
        )
    except PaymentRejectedException as exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
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


@products_router.post(
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


@auth_router.post("/login", response_model=AuthResponse, status_code=status.HTTP_200_OK)
async def login(
    payload: UserLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    user = await UserService.authenticate(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    token = create_session_token(user.id, user.email, user.role)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )
    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=token,
        message=f"Logged in successfully as {user.role}.",
    )


@auth_router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    try:
        user = await UserService.register_user(db, payload.email, payload.password)
        token = create_session_token(user.id, user.email, user.role)
        response.set_cookie(
            key="session_token",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=60 * 60 * 24 * 7,
        )
        return AuthResponse(
            user=UserResponse.model_validate(user),
            token=token,
            message="User registered successfully.",
        )
    except UserAlreadyExistsException as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@auth_router.post("/create-admin", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def create_admin(
    payload: AdminCreateRequest,
    current_admin: User = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    try:
        new_admin = await UserService.create_admin(db, payload.email, payload.password)
        token = create_session_token(new_admin.id, new_admin.email, new_admin.role)
        return AuthResponse(
            user=UserResponse.model_validate(new_admin),
            token=token,
            message=f"Administrator user '{new_admin.email}' created successfully.",
        )
    except UserAlreadyExistsException as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@auth_router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def get_current_user_profile(
    current_user: User = Depends(require_authenticated_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@auth_router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(response: Response) -> dict:
    response.delete_cookie(key="session_token")
    return {"message": "Logged out successfully."}


@orders_router.get("", response_model=List[OrderResponse], status_code=status.HTTP_200_OK)
async def list_my_orders(
    current_user: User = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> List[OrderResponse]:
    orders = await OrderService.list_user_orders(db, current_user.id)
    return [OrderResponse.model_validate(o) for o in orders]


router.include_router(products_router)
router.include_router(auth_router)
router.include_router(orders_router)

