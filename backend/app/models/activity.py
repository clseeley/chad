from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Activity(Base):
    __tablename__ = "activities"
    __table_args__ = (
        Index("idx_activities_user_date", "user_id", "start_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    strava_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    sport_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    moving_time: Mapped[Optional[int]] = mapped_column(Integer)
    elapsed_time: Mapped[Optional[int]] = mapped_column(Integer)
    distance: Mapped[Optional[float]] = mapped_column(Float)
    total_elevation_gain: Mapped[Optional[float]] = mapped_column(Float)
    average_speed: Mapped[Optional[float]] = mapped_column(Float)
    max_speed: Mapped[Optional[float]] = mapped_column(Float)
    average_heartrate: Mapped[Optional[float]] = mapped_column(Float)
    max_heartrate: Mapped[Optional[float]] = mapped_column(Float)
    suffer_score: Mapped[Optional[int]] = mapped_column(Integer)
    calories: Mapped[Optional[float]] = mapped_column(Float)
    splits_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    laps_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    raw_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    matched_workout_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="activities")
