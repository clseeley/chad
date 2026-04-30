from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import structlog

from app.agent.coach import ChadCoach
from app.database import get_db
from app.dependencies import get_current_user
from app.models.activity import Activity
from app.models.training_plan import TrainingPlan
from app.models.user import User
from app.schemas.training import ActivityResponse, TrainingPlanResponse, WorkoutResponse
from app.services.activity_service import SPORT_TYPE_MAP

log = structlog.get_logger()

router = APIRouter()


@router.get("/plan")
async def get_active_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TrainingPlan)
        .options(selectinload(TrainingPlan.workouts))
        .where(
            and_(TrainingPlan.user_id == user.id, TrainingPlan.status == "active")
        )
        .order_by(TrainingPlan.created_at.desc())
        .limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        return None

    return TrainingPlanResponse(
        id=str(plan.id),
        name=plan.name,
        description=plan.description,
        start_date=plan.start_date,
        end_date=plan.end_date,
        phase=plan.phase,
        status=plan.status,
        workouts=[
            WorkoutResponse(
                id=str(w.id),
                scheduled_date=w.scheduled_date,
                sport=w.sport,
                workout_type=w.workout_type,
                title=w.title,
                description=w.description,
                target_metrics=w.target_metrics,
                week_number=w.week_number,
                day_of_week=w.day_of_week,
                completed=w.completed,
                matched_activity_id=str(w.matched_activity_id) if w.matched_activity_id else None,
            )
            for w in sorted(plan.workouts, key=lambda w: w.scheduled_date)
        ],
    )


@router.get("/plan/week")
async def get_plan_week(
    offset: int = Query(0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    week_end = week_start + timedelta(days=6)

    result = await db.execute(
        select(TrainingPlan)
        .options(selectinload(TrainingPlan.workouts))
        .where(
            and_(TrainingPlan.user_id == user.id, TrainingPlan.status == "active")
        )
        .order_by(TrainingPlan.created_at.desc())
        .limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        return []

    return [
        WorkoutResponse(
            id=str(w.id),
            scheduled_date=w.scheduled_date,
            sport=w.sport,
            workout_type=w.workout_type,
            title=w.title,
            description=w.description,
            target_metrics=w.target_metrics,
            week_number=w.week_number,
            day_of_week=w.day_of_week,
            completed=w.completed,
            matched_activity_id=str(w.matched_activity_id) if w.matched_activity_id else None,
        )
        for w in plan.workouts
        if week_start <= w.scheduled_date <= week_end
    ]


@router.get("/activities")
async def list_activities(
    after: Optional[str] = None,
    before: Optional[str] = None,
    sport: Optional[str] = None,
    limit: int = Query(50, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Activity).where(Activity.user_id == user.id)

    if after:
        query = query.where(Activity.start_date >= after)
    if before:
        query = query.where(Activity.start_date <= before)
    if sport:
        matching_types = [k for k, v in SPORT_TYPE_MAP.items() if v == sport]
        if matching_types:
            query = query.where(Activity.sport_type.in_(matching_types))

    query = query.order_by(Activity.start_date.desc()).limit(limit)
    result = await db.execute(query)
    activities = result.scalars().all()

    return [
        ActivityResponse(
            id=str(a.id),
            strava_id=a.strava_id,
            sport_type=a.sport_type,
            name=a.name,
            description=a.description,
            start_date=a.start_date,
            moving_time=a.moving_time,
            elapsed_time=a.elapsed_time,
            distance=a.distance,
            total_elevation_gain=a.total_elevation_gain,
            average_speed=a.average_speed,
            max_speed=a.max_speed,
            average_heartrate=a.average_heartrate,
            max_heartrate=a.max_heartrate,
            suffer_score=a.suffer_score,
            calories=a.calories,
            matched_workout_id=str(a.matched_workout_id) if a.matched_workout_id else None,
        )
        for a in activities
    ]


@router.get("/summary")
async def fitness_summary(
    weeks: int = Query(4, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    start = today - timedelta(weeks=weeks)

    result = await db.execute(
        select(Activity)
        .where(and_(Activity.user_id == user.id, Activity.start_date >= str(start)))
        .order_by(Activity.start_date)
    )
    activities = result.scalars().all()

    weekly_running_dist = [0.0] * weeks
    weekly_running_time = [0.0] * weeks
    weekly_lifting = [0] * weeks

    for a in activities:
        week_idx = (a.start_date.date() - start).days // 7
        if week_idx < 0 or week_idx >= weeks:
            continue

        sport = SPORT_TYPE_MAP.get(a.sport_type, "cross_training")
        if sport == "running":
            weekly_running_dist[week_idx] += (a.distance or 0) / 1000
            weekly_running_time[week_idx] += (a.moving_time or 0) / 60
        elif sport == "lifting":
            weekly_lifting[week_idx] += 1

    return {
        "weekly_running_distance": [round(d, 1) for d in weekly_running_dist],
        "weekly_running_time_min": [round(t, 0) for t in weekly_running_time],
        "lifting_sessions_per_week": weekly_lifting,
        "total_activities": len(activities),
        "weeks": weeks,
    }


@router.post("/generate")
async def generate_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    coach = ChadCoach(db)
    try:
        plan = await coach.generate_plan(user.id)
    except Exception as e:
        log.error("plan_generation_failed", user_id=str(user.id), error=str(e))
        raise HTTPException(status_code=500, detail="Plan generation failed. Please try again.")

    return {
        "id": str(plan.id),
        "name": plan.name,
        "description": plan.description,
        "start_date": str(plan.start_date),
        "end_date": str(plan.end_date),
        "status": plan.status,
    }
