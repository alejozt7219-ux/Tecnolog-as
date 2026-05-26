from sqlalchemy import String, Float, Boolean, Text, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.mixins import TimestampMixin
import enum


class TaskStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    error = "error"


class Store(Base, TimestampMixin):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    base_url: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    prices = relationship("PriceResult", back_populates="store")


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(500), index=True)
    normalized_name: Mapped[str] = mapped_column(String(500), index=True)
    image_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)

    prices = relationship("PriceResult", back_populates="product")
    searches = relationship("SearchHistory", back_populates="product")


class PriceResult(Base, TimestampMixin):
    __tablename__ = "price_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), index=True)
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="MXN")
    url: Mapped[str] = mapped_column(String(1000))
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)

    product = relationship("Product", back_populates="prices")
    store = relationship("Store", back_populates="prices")


class SearchHistory(Base, TimestampMixin):
    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    task_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    query: Mapped[str] = mapped_column(String(500))
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.pending)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    user = relationship("User", back_populates="searches")
    product = relationship("Product", back_populates="searches")


class ScrapingLog(Base, TimestampMixin):
    __tablename__ = "scraping_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20))
    products_scraped: Mapped[int] = mapped_column(Integer, default=0)
    errors_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)