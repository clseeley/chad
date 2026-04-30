from __future__ import annotations

from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel


class WorkoutResponse(BaseModel):
    id: str
    scheduled_date: date
    sport: str
    workout_type: str
    title: str
    description: str
    target_metrics: Optional[Any]
    week_number: Optional[int]
    day_of_week: Optional[int]
    completed: bool
    matched_activity_id: Optional[str]

    class Config:
        from_attributes = True


class TrainingPlanResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    start_date: date
    end_date: date
    phase: Optional[str]
    status: str
    rationale: Optional[str]
    workouts: List[WorkoutResponse]

    class Config:
        from_attributes = True


class ActivityResponse(BaseModel):
    id: str
    strava_id: int
    sport_type: str
    name: Optional[str]
    description: Optional[str]
    start_date: datetime
    moving_time: Optional[int]
    elapsed_time: Optional[int]
    distance: Optional[float]
    total_elevation_gain: Optional[float]
    average_speed: Optional[float]
    max_speed: Optional[float]
    average_heartrate: Optional[float]
    max_heartrate: Optional[float]
    suffer_score: Optional[int]
    calories: Optional[float]
    matched_workout_id: Optional[str]

    class Config:
        from_attributes = True


class FitnessSummary(BaseModel):
    weekly_running_distance: List[float]
    weekly_running_time_min: List[float]
    lifting_sessions_per_week: List[int]
    total_activities: int
    weeks: int
