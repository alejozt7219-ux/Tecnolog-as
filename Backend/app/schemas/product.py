from pydantic import BaseModel
from datetime import datetime
from app.models.product import TaskStatus


class StoreOut(BaseModel):
    id: int
    name: str
    base_url: str
    is_active: bool
    is_custom: bool
    logo_url: str | None

    model_config = {"from_attributes": True}


class StoreCreate(BaseModel):
    name: str
    base_url: str
    logo_url: str | None = None
    is_custom: bool = True  # las tiendas creadas por admin siempre son personalizadas


class PriceResultOut(BaseModel):
    id: int
    store: StoreOut
    price: float
    currency: str
    url: str
    title: str | None
    in_stock: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductOut(BaseModel):
    id: int
    name: str
    category: str | None
    prices: list[PriceResultOut] = []

    model_config = {"from_attributes": True}


class ScanResponse(BaseModel):
    task_id: str
    status: TaskStatus
    message: str
    vision: dict | None = None  # atributos IA devueltos de inmediato


class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    product: ProductOut | None = None
    error: str | None = None


class SearchHistoryOut(BaseModel):
    id: int
    task_id: str
    query: str
    status: TaskStatus
    image_url: str | None
    triggered_by_admin: bool = False
    created_at: datetime
    product: ProductOut | None = None

    model_config = {"from_attributes": True}


class ScrapingLogOut(BaseModel):
    id: int
    store_id: int | None
    status: str
    products_scraped: int
    errors_count: int
    duration_seconds: float | None
    created_at: datetime

    model_config = {"from_attributes": True}