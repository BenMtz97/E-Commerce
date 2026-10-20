import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

SCRIPT_INJECTION_PATTERN = re.compile(
    r"(<\s*/?\s*(?:script|iframe|object|embed|svg|applet|meta|link|style)[^>]*>|javascript\s*:|on\w+\s*=|data\s*:\s*text/html|<\s*script)",
    re.IGNORECASE,
)

SQL_INJECTION_PATTERN = re.compile(
    r"(--|/\*|\*/|;\s*(?:drop|delete|update|insert|alter|truncate|create|select)\b|\bunion\s+(?:all\s+)?select\b|(?:'|\")\s*(?:or|and)\s+(?:'|\")?\w+(?:'|\")?\s*=\s*(?:'|\")?\w+|\bbenchmark\s*\(|\bpg_sleep\s*\()",
    re.IGNORECASE,
)

FORMULA_INJECTION_START_PATTERN = re.compile(
    r"^[\s\'\"`]*[=\+\-@\t\r%|]",
    re.IGNORECASE,
)

FORMULA_INJECTION_CONTENT_PATTERN = re.compile(
    r"(\b(?:cmd|powershell|cscript|wscript|calc|notepad|mshta|rundll32|regsvr32)\s*\|"
    r"|\|\s*[\'\"`]?\s*(?:/[CcKk]|\-[CcKk]|\-enc|\-command)\b"
    r"|\|\s*[\'\"`][^\n\'\"`]+[\'\"`]!"
    r"|(?:\b|[\s\'\"`=+\-@])(?:SUM|AVERAGE|COUNT|MIN|MAX|HYPERLINK|IMPORTXML|WEBSERVICE|DDE|DDEAUTO|EXEC)\s*\("
    r"|\b(?:cmd|powershell|calc|notepad|mshta|cscript|wscript)\.exe\b)",
    re.IGNORECASE,
)

SKU_ALLOWED_PATTERN = re.compile(r"^[A-Za-z0-9_.\-]+$")


def validate_no_formula_injection(value: Optional[str], field_name: str) -> None:
    if not value:
        return
    trimmed = value.strip()
    if FORMULA_INJECTION_START_PATTERN.search(trimmed):
        raise ValueError(
            f"Formula injection detected in {field_name}: cell value starts with a disallowed formula character (=, +, -, @, |, %, tab, newline)."
        )
    if FORMULA_INJECTION_CONTENT_PATTERN.search(trimmed):
        raise ValueError(
            f"Formula injection detected in {field_name}: cell value contains executable formula or command injection syntax."
        )


def validate_no_script_injection(value: Optional[str], field_name: str) -> None:
    if value and SCRIPT_INJECTION_PATTERN.search(value):
        raise ValueError(
            f"Script injection detected in {field_name}: input contains disallowed HTML or script syntax."
        )


def validate_no_sql_injection(value: Optional[str], field_name: str) -> None:
    if value and SQL_INJECTION_PATTERN.search(value):
        raise ValueError(
            f"SQL injection pattern detected in {field_name}: input contains disallowed SQL syntax."
        )


class ProductBase(BaseModel):
    sku: str = Field(..., min_length=3, max_length=64)
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: str = Field(..., min_length=2, max_length=100)
    price: Decimal = Field(..., ge=0, decimal_places=2)
    stock: int = Field(..., ge=0)
    weight_kg: Decimal = Field(..., ge=0, decimal_places=3)

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, value: str) -> str:
        trimmed = value.strip().upper()
        if not trimmed:
            raise ValueError("SKU cannot be empty")
        validate_no_formula_injection(trimmed, "sku")
        validate_no_script_injection(trimmed, "sku")
        validate_no_sql_injection(trimmed, "sku")
        if not SKU_ALLOWED_PATTERN.match(trimmed):
            raise ValueError(
                "SKU contains invalid characters. Only alphanumeric, hyphen, underscore, and dot are permitted."
            )
        return trimmed

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Name cannot be empty")
        validate_no_formula_injection(trimmed, "name")
        validate_no_script_injection(trimmed, "name")
        validate_no_sql_injection(trimmed, "name")
        return trimmed

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Category cannot be empty")
        validate_no_formula_injection(trimmed, "category")
        validate_no_script_injection(trimmed, "category")
        validate_no_sql_injection(trimmed, "category")
        return trimmed

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        validate_no_formula_injection(trimmed, "description")
        validate_no_script_injection(trimmed, "description")
        validate_no_sql_injection(trimmed, "description")
        return trimmed


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, min_length=2, max_length=100)
    price: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    stock: Optional[int] = Field(default=None, ge=0)
    weight_kg: Optional[Decimal] = Field(default=None, ge=0, decimal_places=3)

    @field_validator("name")
    @classmethod
    def validate_update_name(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            trimmed = value.strip()
            validate_no_formula_injection(trimmed, "name")
            validate_no_script_injection(trimmed, "name")
            validate_no_sql_injection(trimmed, "name")
            return trimmed
        return None

    @field_validator("category")
    @classmethod
    def validate_update_category(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            trimmed = value.strip()
            validate_no_formula_injection(trimmed, "category")
            validate_no_script_injection(trimmed, "category")
            validate_no_sql_injection(trimmed, "category")
            return trimmed
        return None

    @field_validator("description")
    @classmethod
    def validate_update_description(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            trimmed = value.strip()
            validate_no_formula_injection(trimmed, "description")
            validate_no_script_injection(trimmed, "description")
            validate_no_sql_injection(trimmed, "description")
            return trimmed
        return None


class ProductResponse(ProductBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPurchaseRequest(BaseModel):
    quantity: int = Field(..., gt=0, le=1000)


class ProductPurchaseResponse(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    purchased_quantity: int
    remaining_stock: int
    unit_price: Decimal
    total_price: Decimal
    timestamp: datetime


class CsvRowError(BaseModel):
    row_number: int
    sku: Optional[str] = None
    error: str


class CsvImportSummary(BaseModel):
    total_rows: int
    successful_imports: int
    failed_imports: int
    errors: List[CsvRowError]


class UserLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip().lower()
        validate_no_formula_injection(trimmed, "email")
        validate_no_script_injection(trimmed, "email")
        validate_no_sql_injection(trimmed, "email")
        return trimmed


class UserRegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=4, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip().lower()
        validate_no_formula_injection(trimmed, "email")
        validate_no_script_injection(trimmed, "email")
        validate_no_sql_injection(trimmed, "email")
        return trimmed


class AdminCreateRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=4, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip().lower()
        validate_no_formula_injection(trimmed, "email")
        validate_no_script_injection(trimmed, "email")
        validate_no_sql_injection(trimmed, "email")
        return trimmed


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    user: UserResponse
    token: str
    message: str

