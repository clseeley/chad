from __future__ import annotations

from datetime import date
from typing import Any, Optional

from pydantic import BaseModel


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    notification_hour: Optional[int] = None
    units: Optional[str] = None
    onboarding_complete: Optional[bool] = None


class GoalCreate(BaseModel):
    goal_type: str
    sport: Optional[str] = None
    title: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    target_value: Optional[dict] = None
    priority: int = 1


class GoalUpdate(BaseModel):
    goal_type: Optional[str] = None
    sport: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    target_value: Optional[dict] = None
    priority: Optional[int] = None
    status: Optional[str] = None


class GoalResponse(BaseModel):
    id: str
    goal_type: str
    sport: Optional[str]
    title: str
    description: Optional[str]
    target_date: Optional[date]
    target_value: Optional[Any]
    priority: int
    status: str

    class Config:
        from_attributes = True
