from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.workout import PlannedWorkout
from app.models.training_plan import TrainingPlan
from app.services.activity_service import SPORT_TYPE_MAP

COACH_TOOLS = [
    {
        "name": "get_todays_workout",
        "description": "Retrieve today's planned workout(s) for the athlete.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_week_schedule",
        "description": "Get the full training schedule for a given week.",
        "input_schema": {
            "type": "object",
            "properties": {
                "week_offset": {
                    "type": "integer",
                    "description": "0 for current week, 1 for next week, -1 for last week",
                },
            },
            "required": [],
        },
    },
    {
        "name": "swap_workout",
        "description": "Swap two planned workouts by date. Use when an athlete needs to move a workout to a different day.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string", "description": "ISO date to move FROM (YYYY-MM-DD)"},
                "date_to": {"type": "string", "description": "ISO date to move TO (YYYY-MM-DD)"},
            },
            "required": ["date_from", "date_to"],
        },
    },
    {
        "name": "replace_workout",
        "description": "Replace a planned workout with a new one. Use when you need to adjust difficulty or type.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "ISO date of workout to replace (YYYY-MM-DD)"},
                "sport": {"type": "string", "description": "running, lifting, cross_training, or rest"},
                "workout_type": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["date", "sport", "workout_type", "title", "description"],
        },
    },
    {
        "name": "get_recent_activities",
        "description": "Fetch recent completed activities from Strava.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Number of days to look back. Default 7."},
            },
            "required": [],
        },
    },
]


async def execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    if tool_name == "get_todays_workout":
        return await _get_todays_workout(user_id, db)
    elif tool_name == "get_week_schedule":
        offset = tool_input.get("week_offset", 0)
        return await _get_week_schedule(user_id, db, offset)
    elif tool_name == "swap_workout":
        return await _swap_workout(user_id, db, tool_input["date_from"], tool_input["date_to"])
    elif tool_name == "replace_workout":
        return await _replace_workout(user_id, db, tool_input)
    elif tool_name == "get_recent_activities":
        days = tool_input.get("days", 7)
        return await _get_recent_activities(user_id, db, days)
    return "Unknown tool"


async def _get_todays_workout(user_id: uuid.UUID, db: AsyncSession) -> str:
    today = date.today()
    result = await db.execute(
        select(PlannedWorkout).where(
            and_(PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date == today)
        )
    )
    workouts = result.scalars().all()
    if not workouts:
        return "No workouts planned for today."

    lines = []
    for w in workouts:
        status = "COMPLETED" if w.completed else "PLANNED"
        lines.append(f"[{status}] {w.title} ({w.sport}/{w.workout_type})\n{w.description}")
    return "\n---\n".join(lines)


async def _get_week_schedule(user_id: uuid.UUID, db: AsyncSession, offset: int) -> str:
    today = date.today()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    week_end = week_start + timedelta(days=6)

    result = await db.execute(
        select(PlannedWorkout).where(
            and_(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date >= week_start,
                PlannedWorkout.scheduled_date <= week_end,
            )
        ).order_by(PlannedWorkout.scheduled_date)
    )
    workouts = result.scalars().all()
    if not workouts:
        return f"No workouts scheduled for the week of {week_start}."

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    lines = []
    for w in workouts:
        day_name = days[w.scheduled_date.weekday()]
        status = "✓" if w.completed else "○"
        lines.append(f"{status} {day_name} {w.scheduled_date}: {w.title} ({w.sport})")
    return "\n".join(lines)


async def _swap_workout(user_id: uuid.UUID, db: AsyncSession, date_from: str, date_to: str) -> str:
    d_from = date.fromisoformat(date_from)
    d_to = date.fromisoformat(date_to)

    result_from = await db.execute(
        select(PlannedWorkout).where(
            and_(PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date == d_from)
        )
    )
    result_to = await db.execute(
        select(PlannedWorkout).where(
            and_(PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date == d_to)
        )
    )

    workouts_from = result_from.scalars().all()
    workouts_to = result_to.scalars().all()

    for w in workouts_from:
        w.scheduled_date = d_to
        w.day_of_week = d_to.weekday()
    for w in workouts_to:
        w.scheduled_date = d_from
        w.day_of_week = d_from.weekday()

    await db.flush()
    return f"Swapped workouts between {date_from} and {date_to}."


async def _replace_workout(user_id: uuid.UUID, db: AsyncSession, data: dict[str, Any]) -> str:
    d = date.fromisoformat(data["date"])
    result = await db.execute(
        select(PlannedWorkout).where(
            and_(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.scheduled_date == d,
                PlannedWorkout.completed == False,
            )
        ).limit(1)
    )
    workout = result.scalar_one_or_none()
    if not workout:
        return f"No incomplete workout found on {data['date']} to replace."

    workout.sport = data["sport"]
    workout.workout_type = data["workout_type"]
    workout.title = data["title"]
    workout.description = data["description"]
    await db.flush()
    return f"Replaced workout on {data['date']} with: {data['title']}"


async def _get_recent_activities(user_id: uuid.UUID, db: AsyncSession, days: int) -> str:
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(Activity).where(
            and_(Activity.user_id == user_id, Activity.start_date >= str(cutoff))
        ).order_by(Activity.start_date.desc())
    )
    activities = result.scalars().all()
    if not activities:
        return f"No activities in the last {days} days."

    lines = []
    for a in activities:
        dist = f"{a.distance / 1609.34:.1f} mi" if a.distance else ""
        time_str = f"{a.moving_time // 60}m" if a.moving_time else ""
        hr = f"avg HR {a.average_heartrate:.0f}" if a.average_heartrate else ""
        parts = [p for p in [dist, time_str, hr] if p]
        lines.append(f"{a.start_date.strftime('%a %m/%d')}: {a.name or a.sport_type} — {', '.join(parts)}")
    return "\n".join(lines)
