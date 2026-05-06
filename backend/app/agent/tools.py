from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_note import AthleteNote
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
        "description": "Replace a planned workout with a new one. Use when you need to adjust difficulty or type. If multiple workouts exist on the same day, use original_sport or original_title to target the right one.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "ISO date of workout to replace (YYYY-MM-DD)"},
                "sport": {"type": "string", "description": "running, lifting, cross_training, or rest"},
                "workout_type": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "original_sport": {"type": "string", "description": "Sport of the workout to replace (use when multiple workouts on same day)"},
                "original_title": {"type": "string", "description": "Title of the workout to replace (use when multiple workouts on same day)"},
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
    {
        "name": "add_athlete_note",
        "description": "Save a note about the athlete — injury, fatigue level, preference, or general context. Use when the athlete shares how they're feeling or reports an issue.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["injury", "fatigue", "preference", "general"],
                    "description": "Type of note",
                },
                "content": {"type": "string", "description": "The note content"},
            },
            "required": ["category", "content"],
        },
    },
    {
        "name": "get_athlete_notes",
        "description": "Retrieve all active notes about the athlete (injuries, fatigue, preferences).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "dismiss_athlete_note",
        "description": "Mark a note as resolved/inactive (e.g., injury healed, fatigue passed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string", "description": "UUID of the note to dismiss"},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "skip_workout",
        "description": "Mark a workout as skipped. Use when the athlete can't do a workout due to injury, schedule conflict, etc. If multiple workouts exist on the same day, use sport or title to skip only one.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "ISO date of workout to skip (YYYY-MM-DD)"},
                "reason": {"type": "string", "description": "Why the workout is being skipped"},
                "sport": {"type": "string", "description": "Only skip the workout with this sport (use when multiple workouts on same day)"},
                "title": {"type": "string", "description": "Only skip the workout with this title (use when multiple workouts on same day)"},
            },
            "required": ["date"],
        },
    },
    {
        "name": "add_workout",
        "description": "Add a new workout to the plan on a specific date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "ISO date (YYYY-MM-DD)"},
                "sport": {"type": "string", "description": "running, lifting, cross_training"},
                "workout_type": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["date", "sport", "workout_type", "title", "description"],
        },
    },
    {
        "name": "mark_workout_complete",
        "description": "Toggle a workout's completion status. If multiple workouts exist on the same day, use sport or title to target only one.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "ISO date (YYYY-MM-DD)"},
                "sport": {"type": "string", "description": "Only toggle the workout with this sport"},
                "title": {"type": "string", "description": "Only toggle the workout with this title"},
            },
            "required": ["date"],
        },
    },
    {
        "name": "remove_workout",
        "description": "Remove a planned workout from the schedule. Use sport and/or title to target a specific workout when multiple exist on the same day.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "ISO date (YYYY-MM-DD)"},
                "sport": {"type": "string", "description": "Sport of the workout to remove"},
                "title": {"type": "string", "description": "Title of the workout to remove"},
            },
            "required": ["date"],
        },
    },
]


_REQUIRED_FIELDS: dict[str, list[str]] = {
    "swap_workout": ["date_from", "date_to"],
    "replace_workout": ["date", "sport", "workout_type", "title", "description"],
    "add_athlete_note": ["category", "content"],
    "dismiss_athlete_note": ["note_id"],
    "skip_workout": ["date"],
    "add_workout": ["date", "sport", "workout_type", "title", "description"],
    "mark_workout_complete": ["date"],
    "remove_workout": ["date"],
}


async def execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    required = _REQUIRED_FIELDS.get(tool_name, [])
    missing = [f for f in required if f not in tool_input]
    if missing:
        return f"Error: missing required fields {missing} for {tool_name}. Please retry with all required fields."

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
    elif tool_name == "add_athlete_note":
        return await _add_athlete_note(user_id, db, tool_input["category"], tool_input["content"])
    elif tool_name == "get_athlete_notes":
        return await _get_athlete_notes(user_id, db)
    elif tool_name == "dismiss_athlete_note":
        return await _dismiss_athlete_note(user_id, db, tool_input["note_id"])
    elif tool_name == "skip_workout":
        return await _skip_workout(user_id, db, tool_input["date"], tool_input.get("reason"), tool_input.get("sport"), tool_input.get("title"))
    elif tool_name == "add_workout":
        return await _add_workout(user_id, db, tool_input)
    elif tool_name == "mark_workout_complete":
        return await _mark_workout_complete(user_id, db, tool_input["date"], tool_input.get("sport"), tool_input.get("title"))
    elif tool_name == "remove_workout":
        return await _remove_workout(user_id, db, tool_input["date"], tool_input.get("sport"), tool_input.get("title"))
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
        lines.append(f"[{status}] {w.title} (sport={w.sport}, type={w.workout_type})\n{w.description}")
    header = f"{len(workouts)} workout(s) today:" if len(workouts) > 1 else ""
    body = "\n---\n".join(lines)
    return f"{header}\n{body}" if header else body


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
    conditions = [
        PlannedWorkout.user_id == user_id,
        PlannedWorkout.scheduled_date == d,
        PlannedWorkout.completed == False,
    ]
    if data.get("original_sport"):
        conditions.append(PlannedWorkout.sport == data["original_sport"])
    if data.get("original_title"):
        conditions.append(PlannedWorkout.title == data["original_title"])
    result = await db.execute(
        select(PlannedWorkout).where(and_(*conditions)).limit(1)
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
            and_(Activity.user_id == user_id, Activity.start_date >= cutoff)
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


async def _add_athlete_note(user_id: uuid.UUID, db: AsyncSession, category: str, content: str) -> str:
    note = AthleteNote(user_id=user_id, category=category, content=content)
    db.add(note)
    await db.flush()
    return f"Noted ({category}): {content}"


async def _get_athlete_notes(user_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(AthleteNote).where(
            and_(AthleteNote.user_id == user_id, AthleteNote.active == True)
        ).order_by(AthleteNote.created_at.desc())
    )
    notes = result.scalars().all()
    if not notes:
        return "No active notes."
    lines = []
    for n in notes:
        lines.append(f"[{n.category}] {n.content} (id: {n.id}, {n.created_at.strftime('%m/%d')})")
    return "\n".join(lines)


async def _dismiss_athlete_note(user_id: uuid.UUID, db: AsyncSession, note_id: str) -> str:
    try:
        nid = uuid.UUID(note_id)
    except ValueError:
        return "Invalid note ID."
    result = await db.execute(
        select(AthleteNote).where(
            and_(AthleteNote.id == nid, AthleteNote.user_id == user_id)
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return "Note not found."
    note.active = False
    await db.flush()
    return f"Dismissed note: {note.content}"


async def _skip_workout(user_id: uuid.UUID, db: AsyncSession, date_str: str, reason: Optional[str], sport: Optional[str] = None, title: Optional[str] = None) -> str:
    d = date.fromisoformat(date_str)
    conditions = [
        PlannedWorkout.user_id == user_id,
        PlannedWorkout.scheduled_date == d,
        PlannedWorkout.completed == False,
    ]
    if sport:
        conditions.append(PlannedWorkout.sport == sport)
    if title:
        conditions.append(PlannedWorkout.title == title)
    result = await db.execute(
        select(PlannedWorkout).where(and_(*conditions))
    )
    workouts = result.scalars().all()
    if not workouts:
        return f"No incomplete workouts on {date_str} to skip."
    for w in workouts:
        w.completed = True
    await db.flush()
    msg = f"Skipped {len(workouts)} workout(s) on {date_str}."
    if reason:
        note = AthleteNote(user_id=user_id, category="general", content=f"Skipped {date_str}: {reason}")
        db.add(note)
        await db.flush()
    return msg


async def _add_workout(user_id: uuid.UUID, db: AsyncSession, data: dict[str, Any]) -> str:
    d = date.fromisoformat(data["date"])
    result = await db.execute(
        select(TrainingPlan).where(
            and_(TrainingPlan.user_id == user_id, TrainingPlan.status == "active")
        ).order_by(TrainingPlan.created_at.desc()).limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        return "No active training plan to add a workout to."

    existing = await db.execute(
        select(PlannedWorkout).where(
            and_(PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date == d)
        )
    )
    existing_workouts = existing.scalars().all()

    plan_start = plan.start_date
    plan_monday = plan_start - timedelta(days=plan_start.weekday())
    week_number = ((d - plan_monday).days // 7) + 1

    pw = PlannedWorkout(
        training_plan_id=plan.id,
        user_id=user_id,
        scheduled_date=d,
        sport=data["sport"],
        workout_type=data["workout_type"],
        title=data["title"],
        description=data["description"],
        day_of_week=d.weekday(),
        week_number=week_number,
    )
    db.add(pw)
    await db.flush()
    msg = f"Added workout on {data['date']}: {data['title']}"
    if existing_workouts:
        existing_names = ", ".join(w.title for w in existing_workouts)
        msg += f"\nNote: there are now {len(existing_workouts) + 1} workouts on this date (existing: {existing_names}). If you meant to replace one, use replace_workout instead and consider removing the duplicate."
    return msg


async def _mark_workout_complete(user_id: uuid.UUID, db: AsyncSession, date_str: str, sport: Optional[str] = None, title: Optional[str] = None) -> str:
    d = date.fromisoformat(date_str)
    conditions = [PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date == d]
    if sport:
        conditions.append(PlannedWorkout.sport == sport)
    if title:
        conditions.append(PlannedWorkout.title == title)
    result = await db.execute(
        select(PlannedWorkout).where(and_(*conditions))
    )
    workouts = result.scalars().all()
    if not workouts:
        return f"No workouts found on {date_str}."
    for w in workouts:
        w.completed = not w.completed
    await db.flush()
    status = "complete" if workouts[0].completed else "incomplete"
    return f"Marked {len(workouts)} workout(s) on {date_str} as {status}."


async def _remove_workout(user_id: uuid.UUID, db: AsyncSession, date_str: str, sport: Optional[str] = None, title: Optional[str] = None) -> str:
    d = date.fromisoformat(date_str)
    conditions = [PlannedWorkout.user_id == user_id, PlannedWorkout.scheduled_date == d]
    if sport:
        conditions.append(PlannedWorkout.sport == sport)
    if title:
        conditions.append(PlannedWorkout.title == title)
    result = await db.execute(
        select(PlannedWorkout).where(and_(*conditions))
    )
    workouts = result.scalars().all()
    if not workouts:
        return f"No workouts found on {date_str} matching the criteria."
    if len(workouts) > 1 and not sport and not title:
        names = ", ".join(f"{w.title} ({w.sport})" for w in workouts)
        return f"Multiple workouts on {date_str}: {names}. Specify sport or title to remove a specific one."
    for w in workouts:
        await db.delete(w)
    await db.flush()
    return f"Removed {len(workouts)} workout(s) from {date_str}."
