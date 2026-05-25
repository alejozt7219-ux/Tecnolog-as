from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models.user import UserRole


# ── Auth ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── User ──────────────────────────────────────────────
class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: UserRole = UserRole.analyst


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserToggle(BaseModel):
    is_active: bool
