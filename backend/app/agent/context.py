from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, List, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.activity import Activity
from app.models.goal import Goal
from app.models.message import Message
from app.models.training_plan import TrainingPlan
from app.models.user import User
from app.models.workout import PlannedWorkout
from app.services.activity_service import SPORT_TYPE_MAP


@dataclass
class AthleteContext:
    user_profile: dict
    goals: list
    current_plan_summary: Optional[str]
    this_week_workouts: list
    recent_activities: list
    planned_vs_actual: dict
    fitness_summary: dict
    conversation_history: list
    today: str
    days_to_goal: Optional[int]


class ContextBuilder:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build(
        self,
        user_id: uuid.UUID,
        include_plan: bool = True,
        include_history: bool = True,
        conversation_limit: int = 20,
    ) -> AthleteContext:
        user = await self._get_user(user_id)
        goals = await self._get_goals(user_id)
        today = date.today()

        plan_summary = None
        week_workouts: list = []
        planned_vs_actual: dict = {"completed": 0, "planned": 0, "skipped": 0}

        if include_plan:
            plan_summary, week_workouts, planned_vs_actual = await self._get_plan_context(user_id, today)

        recent = await self._get_recent_activities(user_id, days=14)
        fitness = self._compute_fitness_summary(recent)
        conversation: list = []
        if include_history:
            conversation = await self._get_conversation(user_id, conversation_limit)

        primary_goal = next((g for g in goals if g["priority"] == 1 and g.get("target_date")), None)
        days_to_goal = None
        if primary_goal and primary_goal["target_date"]:
            target = date.fromisoformat(str(primary_goal["target_date"]))
            days_to_goal = (target - today).days

        return AthleteContext(
            user_profile={
                "first_name": user.first_name,
                "timezone": user.timezone,
                "units": user.units,
            },
            goals=goals,
            current_plan_summary=plan_summary,
            this_week_workouts=week_workouts,
            recent_activities=recent,
            planned_vs_actual=planned_vs_actual,
            fitness_summary=fitness,
            conversation_history=conversation,
            today=today.isoformat(),
            days_to_goal=days_to_goal,
        )

    async def _get_user(self, user_id: uuid.UUID) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one()

    async def _get_goals(self, user_id: uuid.UUID) -> list:
        result = await self.db.execute(
            select(Goal).where(and_(Goal.user_id == user_id, Goal.status == "active"))
            .order_by(Goal.priority)
        )
        return [
            {
                "goal_type": g.goal_type,
                "sport": g.sport,
                "title": g.title,
                "description": g.description,
                "target_date": str(g.target_date) if g.target_date else None,
                "target_value": g.target_value,
                "priority": g.priority,
            }
            for g in result.scalars().all()
        ]

    async def _get_plan_context(self, user_id: uuid.UUID, today: date):
        result = await self.db.execute(
            select(TrainingPlan)
            .options(selectinload(TrainingPlan.workouts))
            .where(and_(TrainingPlan.user_id == user_id, TrainingPlan.status == "active"))
            .order_by(TrainingPlan.created_at.desc())
            .limit(1)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            return None, [], {"completed": 0, "planned": 0, "skipped": 0}

        summary = f"{plan.name} ({plan.start_date} to {plan.end_date})"
        if plan.phase:
            summary += f", current phase: {plan.phase}"

        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        week_workouts = []
        completed = 0
        planned = 0
        skipped = 0

        for w in plan.workouts:
            if week_start <= w.scheduled_date <= week_end:
                week_workouts.append({
                    "date": str(w.scheduled_date),
                    "day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][w.scheduled_date.weekday()],
                    "sport": w.sport,
                    "title": w.title,
                    "completed": w.completed,
                })

            if w.scheduled_date < today:
                planned += 1
                if w.completed:
                    completed += 1
                else:
                    skipped += 1

        return summary, week_workouts, {"completed": completed, "planned": planned, "skipped": skipped}

    async def _get_recent_activities(self, user_id: uuid.UUID, days: int) -> list:
        cutoff = date.today() - timedelta(days=days)
        result = await self.db.execute(
            select(Activity).where(
                and_(Activity.user_id == user_id, Activity.start_date >= cutoff)
            ).order_by(Activity.start_date.desc()).limit(20)
        )
        activities = []
        for a in result.scalars().all():
            entry = {
                "date": a.start_date.strftime("%a %m/%d"),
                "sport_type": a.sport_type,
                "name": a.name,
                "moving_time_min": round(a.moving_time / 60, 1) if a.moving_time else None,
            }
            if a.distance:
                entry["distance_mi"] = round(a.distance / 1609.34, 1)
            if a.average_heartrate:
                entry["avg_hr"] = round(a.average_heartrate)
            if a.average_speed and a.distance and a.distance > 0:
                pace_sec = 1609.34 / a.average_speed
                entry["pace_per_mi"] = f"{int(pace_sec // 60)}:{int(pace_sec % 60):02d}"
            activities.append(entry)
        return activities

    def _compute_fitness_summary(self, activities: list) -> dict:
        weekly_dist = [0.0] * 4
        weekly_time = [0.0] * 4
        weekly_lifting = [0] * 4
        today = date.today()
        start = today - timedelta(weeks=4)

        for a in activities:
            # Parse date from "Mon 04/28" format
            # We have structured data so use the raw fields
            pass

        # Simpler: iterate from raw activities
        total_running_mi = sum(a.get("distance_mi", 0) for a in activities if SPORT_TYPE_MAP.get(a.get("sport_type", ""), "") == "running")
        total_lifting = sum(1 for a in activities if SPORT_TYPE_MAP.get(a.get("sport_type", ""), "") == "lifting")

        return {
            "last_14d_running_miles": round(total_running_mi, 1),
            "last_14d_lifting_sessions": total_lifting,
            "total_activities_14d": len(activities),
        }

    async def _get_conversation(self, user_id: uuid.UUID, limit: int) -> list:
        result = await self.db.execute(
            select(Message).where(Message.user_id == user_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(reversed(result.scalars().all()))
        return [
            {"role": m.role, "content": m.content}
            for m in messages
        ]


def format_context_for_prompt(ctx: AthleteContext) -> str:
    lines = ["<athlete_context>"]
    lines.append(f"Name: {ctx.user_profile['first_name'] or 'Athlete'}")
    lines.append(f"Date: {ctx.today}")
    lines.append(f"Units: {ctx.user_profile['units']}")

    if ctx.days_to_goal is not None:
        lines.append(f"Days to primary goal: {ctx.days_to_goal}")

    if ctx.goals:
        lines.append("\nGoals:")
        for g in ctx.goals:
            line = f"  - [{g['priority']}] {g['title']} ({g['goal_type']}"
            if g.get("sport"):
                line += f", {g['sport']}"
            if g.get("target_date"):
                line += f", target: {g['target_date']}"
            line += ")"
            if g.get("description"):
                line += f"\n    {g['description']}"
            lines.append(line)

    if ctx.current_plan_summary:
        lines.append(f"\nCurrent Plan: {ctx.current_plan_summary}")

    if ctx.this_week_workouts:
        lines.append("\nThis Week:")
        for w in ctx.this_week_workouts:
            status = "✓" if w["completed"] else "○"
            lines.append(f"  {status} {w['day']} {w['date']}: {w['title']} ({w['sport']})")

    if ctx.planned_vs_actual["planned"] > 0:
        pva = ctx.planned_vs_actual
        lines.append(f"\nCompliance: {pva['completed']}/{pva['planned']} workouts completed ({pva['skipped']} skipped)")

    if ctx.recent_activities:
        lines.append("\nRecent Activities (last 14 days):")
        for a in ctx.recent_activities[:10]:
            parts = [a.get("name") or a.get("sport_type", "Activity")]
            if a.get("distance_mi"):
                parts.append(f"{a['distance_mi']} mi")
            if a.get("pace_per_mi"):
                parts.append(f"@ {a['pace_per_mi']}/mi")
            if a.get("moving_time_min"):
                parts.append(f"{a['moving_time_min']}min")
            if a.get("avg_hr"):
                parts.append(f"HR {a['avg_hr']}")
            lines.append(f"  {a['date']}: {' — '.join(parts)}")

    fs = ctx.fitness_summary
    lines.append(f"\nFitness Summary (14d): {fs['last_14d_running_miles']} mi running, {fs['last_14d_lifting_sessions']} lifting sessions, {fs['total_activities_14d']} total activities")

    lines.append("</athlete_context>")
    return "\n".join(lines)
