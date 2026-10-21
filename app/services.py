import asyncio
import csv
import io
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, Product, User
from app.security import hash_password, verify_password
from app.schemas import (
    SKU_ALLOWED_PATTERN,
    CsvImportSummary,
    CsvRowError,
    ProductCreate,
    ProductPurchaseResponse,
    ProductUpdate,
    validate_no_formula_injection,
    validate_no_script_injection,
    validate_no_sql_injection,
)


class ProductDomainException(Exception):
    pass


class ProductNotFoundException(ProductDomainException):
    def __init__(self, identifier: str) -> None:
        super().__init__(f"Product with identifier '{identifier}' was not found.")
        self.identifier = identifier


class InsufficientStockException(ProductDomainException):
    def __init__(self, requested: int, available: int) -> None:
        super().__init__(
            f"Insufficient stock available: requested {requested}, but only {available} units in stock."
        )
        self.requested = requested
        self.available = available


class PaymentRejectedException(ProductDomainException):
    def __init__(self, card_option: str) -> None:
        super().__init__(
            f"Purchase rejected: Payment with card '{card_option}' was declined by the issuing bank. Stock was not modified."
        )
        self.card_option = card_option


class DuplicateSkuException(ProductDomainException):
    def __init__(self, sku: str) -> None:
        super().__init__(f"Product with SKU '{sku}' already exists.")
        self.sku = sku


class ProductService:
    @staticmethod
    async def get_by_id(db: AsyncSession, product_id: uuid.UUID) -> Product:
        statement = select(Product).where(Product.id == product_id)
        result = await db.execute(statement)
        product = result.scalar_one_or_none()
        if product is None:
            raise ProductNotFoundException(str(product_id))
        return product

    @staticmethod
    async def get_by_sku(db: AsyncSession, sku: str) -> Optional[Product]:
        statement = select(Product).where(Product.sku == sku.strip().upper())
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_products(
        db: AsyncSession,
        query: Optional[str] = None,
        category: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Product], int]:
        statement = select(Product)
        count_statement = select(func.count(Product.id))

        if category and category.strip().lower() != "all":
            clean_category = category.strip()
            validate_no_formula_injection(clean_category, "category")
            validate_no_script_injection(clean_category, "category")
            validate_no_sql_injection(clean_category, "category")
            statement = statement.where(func.lower(Product.category) == func.lower(clean_category))
            count_statement = count_statement.where(
                func.lower(Product.category) == func.lower(clean_category)
            )

        if query and query.strip():
            clean_query = query.strip()
            validate_no_formula_injection(clean_query, "query")
            validate_no_script_injection(clean_query, "query")
            validate_no_sql_injection(clean_query, "query")
            search_pattern = f"%{clean_query}%"
            search_filter = or_(
                Product.name.ilike(search_pattern),
                Product.sku.ilike(search_pattern),
                Product.category.ilike(search_pattern),
                Product.description.ilike(search_pattern),
            )
            statement = statement.where(search_filter)
            count_statement = count_statement.where(search_filter)

        statement = statement.order_by(Product.name.asc()).offset(skip).limit(limit)

        products_result = await db.execute(statement)
        total_count_result = await db.execute(count_statement)

        products = list(products_result.scalars().all())
        total_count = total_count_result.scalar() or 0
        return products, total_count

    @staticmethod
    async def list_categories(db: AsyncSession) -> List[str]:
        statement = select(Product.category).distinct().order_by(Product.category.asc())
        result = await db.execute(statement)
        return list(result.scalars().all())

    @staticmethod
    async def create_product(db: AsyncSession, payload: ProductCreate) -> Product:
        existing = await ProductService.get_by_sku(db, payload.sku)
        if existing is not None:
            raise DuplicateSkuException(payload.sku)

        product = Product(
            id=uuid.uuid4(),
            sku=payload.sku,
            name=payload.name,
            description=payload.description,
            category=payload.category,
            price=payload.price,
            stock=payload.stock,
            weight_kg=payload.weight_kg,
        )
        db.add(product)
        try:
            await db.commit()
            await db.refresh(product)
            return product
        except IntegrityError:
            await db.rollback()
            raise DuplicateSkuException(payload.sku)

    @staticmethod
    async def update_product(
        db: AsyncSession, product_id: uuid.UUID, payload: ProductUpdate
    ) -> Product:
        product = await ProductService.get_by_id(db, product_id)

        if payload.name is not None:
            product.name = payload.name
        if payload.description is not None:
            product.description = payload.description
        if payload.category is not None:
            product.category = payload.category
        if payload.price is not None:
            product.price = payload.price
        if payload.stock is not None:
            product.stock = payload.stock
        if payload.weight_kg is not None:
            product.weight_kg = payload.weight_kg

        await db.commit()
        await db.refresh(product)
        return product

    @staticmethod
    async def delete_product(db: AsyncSession, product_id: uuid.UUID) -> None:
        product = await ProductService.get_by_id(db, product_id)
        await db.delete(product)
        await db.commit()


_product_locks: Dict[uuid.UUID, asyncio.Lock] = {}
_product_locks_guard = asyncio.Lock()


async def get_product_concurrency_lock(product_id: uuid.UUID) -> asyncio.Lock:
    async with _product_locks_guard:
        if product_id not in _product_locks:
            _product_locks[product_id] = asyncio.Lock()
        return _product_locks[product_id]


class PurchaseService:
    @staticmethod
    async def purchase_product(
        db: AsyncSession,
        product_id: uuid.UUID,
        quantity: int,
        card_option: str = "XXX-1234 SUCCEED",
        user_id: Optional[uuid.UUID] = None,
        user_email: Optional[str] = None,
    ) -> ProductPurchaseResponse:
        if quantity <= 0:
            raise ValueError("Purchase quantity must be greater than zero.")

        normalized_card = card_option.strip() if card_option else "XXX-1234 SUCCEED"
        if "REJECTED" in normalized_card.upper() or "1111" in normalized_card:
            await ProductService.get_by_id(db, product_id)
            raise PaymentRejectedException(normalized_card)

        concurrency_lock = await get_product_concurrency_lock(product_id)
        async with concurrency_lock:
            try:
                statement = (
                    select(Product)
                    .where(Product.id == product_id)
                    .with_for_update()
                )
                result = await db.execute(statement)
                product = result.scalar_one_or_none()

                if product is None:
                    raise ProductNotFoundException(str(product_id))

                available_stock = int(product.stock)
                product_id_val = product.id
                product_sku = product.sku
                product_name = product.name
                unit_price = Decimal(str(product.price))

                if available_stock < quantity:
                    await db.rollback()
                    raise InsufficientStockException(
                        requested=quantity,
                        available=available_stock
                    )

                remaining_stock = available_stock - quantity
                product.stock = remaining_stock
                total_price = unit_price * Decimal(str(quantity))

                order_id_val: Optional[uuid.UUID] = None
                if user_id is not None:
                    new_order = Order(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        user_email=user_email or "user@user.com",
                        product_id=product_id_val,
                        sku=product_sku,
                        product_name=product_name,
                        quantity=quantity,
                        unit_price=unit_price,
                        total_price=total_price,
                        payment_card=normalized_card,
                        status="SUCCEEDED",
                    )
                    db.add(new_order)
                    order_id_val = new_order.id

                await db.commit()

                return ProductPurchaseResponse(
                    order_id=order_id_val,
                    product_id=product_id_val,
                    sku=product_sku,
                    name=product_name,
                    purchased_quantity=quantity,
                    remaining_stock=remaining_stock,
                    unit_price=unit_price,
                    total_price=total_price,
                    payment_card=normalized_card,
                    status="SUCCEEDED",
                    timestamp=datetime.now(timezone.utc),
                )
            except Exception:
                await db.rollback()
                raise


class CsvImportService:
    REQUIRED_COLUMNS = {"sku", "name", "category", "price", "stock", "weight_kg"}

    @staticmethod
    async def import_csv(db: AsyncSession, file_content: bytes) -> CsvImportSummary:
        try:
            decoded_content = file_content.decode("utf-8-sig")
        except UnicodeDecodeError:
            decoded_content = file_content.decode("latin-1")

        stream = io.StringIO(decoded_content)
        reader = csv.DictReader(stream)

        if not reader.fieldnames:
            return CsvImportSummary(
                total_rows=0,
                successful_imports=0,
                failed_imports=1,
                errors=[CsvRowError(row_number=1, error="CSV file is empty or missing headers.")],
            )

        normalized_headers = {col.strip().lower(): col for col in reader.fieldnames if col}
        missing_columns = CsvImportService.REQUIRED_COLUMNS - set(normalized_headers.keys())
        if missing_columns:
            return CsvImportSummary(
                total_rows=0,
                successful_imports=0,
                failed_imports=1,
                errors=[
                    CsvRowError(
                        row_number=1,
                        error=f"Missing required columns: {', '.join(sorted(missing_columns))}",
                    )
                ],
            )

        total_rows = 0
        successful_imports = 0
        errors: List[CsvRowError] = []
        batch_skus_seen: set[str] = set()
        products_to_insert: List[Product] = []

        existing_skus_result = await db.execute(select(Product.sku))
        existing_database_skus = set(existing_skus_result.scalars().all())

        for row_index, raw_row in enumerate(reader, start=2):
            total_rows += 1
            row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items() if k}

            sku = row.get("sku", "").upper()
            name = row.get("name", "")
            description = row.get("description", "")
            category = row.get("category", "")
            raw_price = row.get("price", "")
            raw_stock = row.get("stock", "")
            raw_weight = row.get("weight_kg", "")

            cell_security_error: Optional[str] = None
            for raw_col, raw_cell_val in raw_row.items():
                if not raw_cell_val:
                    continue
                col_name = raw_col.strip() if raw_col else "cell"
                try:
                    validate_no_formula_injection(raw_cell_val, col_name)
                    validate_no_script_injection(raw_cell_val, col_name)
                    validate_no_sql_injection(raw_cell_val, col_name)
                except ValueError as security_err:
                    cell_security_error = str(security_err)
                    break

            if cell_security_error:
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku if sku else None,
                        error=cell_security_error,
                    )
                )
                continue

            if not sku:
                errors.append(CsvRowError(row_number=row_index, error="SKU is required."))
                continue

            try:
                validate_no_formula_injection(sku, "sku")
                validate_no_script_injection(sku, "sku")
                validate_no_sql_injection(sku, "sku")
            except ValueError as val_err:
                errors.append(CsvRowError(row_number=row_index, sku=sku, error=str(val_err)))
                continue

            if not SKU_ALLOWED_PATTERN.match(sku):
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku,
                        error="SKU contains invalid characters. Only alphanumeric, hyphen, underscore, and dot are permitted.",
                    )
                )
                continue

            if sku in batch_skus_seen:
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku,
                        error=f"Duplicate SKU '{sku}' found within the uploaded CSV file.",
                    )
                )
                continue

            if sku in existing_database_skus:
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku,
                        error=f"SKU '{sku}' already exists in the catalog database.",
                    )
                )
                continue

            if not name:
                errors.append(
                    CsvRowError(row_number=row_index, sku=sku, error="Product name is required.")
                )
                continue

            try:
                validate_no_formula_injection(name, "name")
                validate_no_script_injection(name, "name")
                validate_no_sql_injection(name, "name")
            except ValueError as val_err:
                errors.append(CsvRowError(row_number=row_index, sku=sku, error=str(val_err)))
                continue

            if not category:
                errors.append(
                    CsvRowError(row_number=row_index, sku=sku, error="Category is required.")
                )
                continue

            try:
                validate_no_formula_injection(category, "category")
                validate_no_script_injection(category, "category")
                validate_no_sql_injection(category, "category")
            except ValueError as val_err:
                errors.append(CsvRowError(row_number=row_index, sku=sku, error=str(val_err)))
                continue

            if description:
                try:
                    validate_no_formula_injection(description, "description")
                    validate_no_script_injection(description, "description")
                    validate_no_sql_injection(description, "description")
                except ValueError as val_err:
                    errors.append(CsvRowError(row_number=row_index, sku=sku, error=str(val_err)))
                    continue

            try:
                price = Decimal(raw_price)
                if price < 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku,
                        error=f"Invalid price value '{raw_price}'. Must be a non-negative number.",
                    )
                )
                continue

            try:
                stock = int(raw_stock)
                if stock < 0:
                    raise ValueError
            except ValueError:
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku,
                        error=f"Invalid stock value '{raw_stock}'. Must be a non-negative integer.",
                    )
                )
                continue

            try:
                weight_kg = Decimal(raw_weight)
                if weight_kg < 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                errors.append(
                    CsvRowError(
                        row_number=row_index,
                        sku=sku,
                        error=f"Invalid weight_kg value '{raw_weight}'. Must be a non-negative number.",
                    )
                )
                continue

            batch_skus_seen.add(sku)
            products_to_insert.append(
                Product(
                    id=uuid.uuid4(),
                    sku=sku,
                    name=name,
                    description=description if description else None,
                    category=category,
                    price=price,
                    stock=stock,
                    weight_kg=weight_kg,
                )
            )
            successful_imports += 1

        if products_to_insert:
            db.add_all(products_to_insert)
            await db.commit()

        return CsvImportSummary(
            total_rows=total_rows,
            successful_imports=successful_imports,
            failed_imports=len(errors),
            errors=errors,
        )


class UserAlreadyExistsException(ProductDomainException):
    def __init__(self, email: str) -> None:
        super().__init__(f"User with email '{email}' already exists.")
        self.email = email


class InvalidCredentialsException(ProductDomainException):
    def __init__(self) -> None:
        super().__init__("Invalid email or password.")


class UserService:
    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        clean_email = email.strip().lower()
        result = await db.execute(select(User).where(User.email == clean_email))
        return result.scalar_one_or_none()

    @staticmethod
    async def authenticate(
        db: AsyncSession, email: str, password: str
    ) -> Optional[User]:
        user = await UserService.get_by_email(db, email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    @staticmethod
    async def register_user(
        db: AsyncSession, email: str, password: str
    ) -> User:
        clean_email = email.strip().lower()
        existing = await UserService.get_by_email(db, clean_email)
        if existing:
            raise UserAlreadyExistsException(clean_email)
        user = User(
            id=uuid.uuid4(),
            email=clean_email,
            hashed_password=hash_password(password),
            role="user",
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
            return user
        except IntegrityError:
            await db.rollback()
            raise UserAlreadyExistsException(clean_email)

    @staticmethod
    async def create_admin(
        db: AsyncSession, email: str, password: str
    ) -> User:
        clean_email = email.strip().lower()
        existing = await UserService.get_by_email(db, clean_email)
        if existing:
            raise UserAlreadyExistsException(clean_email)
        user = User(
            id=uuid.uuid4(),
            email=clean_email,
            hashed_password=hash_password(password),
            role="admin",
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
            return user
        except IntegrityError:
            await db.rollback()
            raise UserAlreadyExistsException(clean_email)

    @staticmethod
    async def list_admins(db: AsyncSession) -> List[User]:
        result = await db.execute(
            select(User).where(User.role == "admin").order_by(User.email.asc())
        )
        return list(result.scalars().all())


class OrderService:
    @staticmethod
    async def list_user_orders(db: AsyncSession, user_id: uuid.UUID) -> List[Order]:
        result = await db.execute(
            select(Order)
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
        )
        return list(result.scalars().all())


