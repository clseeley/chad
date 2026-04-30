from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from cryptography.fernet import Fernet
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, TypeDecorator, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.database import Base


class EncryptedString(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not settings.ENCRYPTION_KEY:
            return value
        f = Fernet(settings.ENCRYPTION_KEY.encode())
        return f.encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if not settings.ENCRYPTION_KEY:
            return value
        f = Fernet(settings.ENCRYPTION_KEY.encode())
        return f.decrypt(value.encode()).decode()


class StravaToken(Base):
    __tablename__ = "strava_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    strava_athlete_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    access_token: Mapped[str] = mapped_column(EncryptedString, nullable=False)
    refresh_token: Mapped[str] = mapped_column(EncryptedString, nullable=False)
    expires_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    scope: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="strava_token")
