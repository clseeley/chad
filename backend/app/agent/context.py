from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.activity import Activity
from app.models.athlete_note import AthleteNote
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
    fitness_profile: Optional[dict]
    athlete_notes: list
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
        full_profile: bool = False,
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

        fitness_profile = None
        if full_profile:
            fitness_profile = await self._compute_rich_fitness_profile(user_id)

        recent = await self._get_recent_activities(user_id, days=14)
        fitness = self._compute_fitness_summary(recent)
        notes = await self._get_athlete_notes(user_id)
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
            fitness_profile=fitness_profile,
            athlete_notes=notes,
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
        total_running_mi = sum(a.get("distance_mi", 0) for a in activities if SPORT_TYPE_MAP.get(a.get("sport_type", ""), "") == "running")
        total_lifting = sum(1 for a in activities if SPORT_TYPE_MAP.get(a.get("sport_type", ""), "") == "lifting")

        return {
            "last_14d_running_miles": round(total_running_mi, 1),
            "last_14d_lifting_sessions": total_lifting,
            "total_activities_14d": len(activities),
        }

    async def _compute_rich_fitness_profile(self, user_id: uuid.UUID) -> dict:
        result = await self.db.execute(
            select(Activity)
            .where(Activity.user_id == user_id)
            .order_by(Activity.start_date.asc())
        )
        all_activities = result.scalars().all()

        if not all_activities:
            return {"total_activities": 0, "training_history_weeks": 0}

        today = date.today()
        earliest = all_activities[0].start_date.date()
        history_weeks = max(1, (today - earliest).days // 7)

        runs = []
        lifts = []
        cross = []

        for a in all_activities:
            sport = SPORT_TYPE_MAP.get(a.sport_type, "cross_training")
            if sport == "running":
                runs.append(a)
            elif sport == "lifting":
                lifts.append(a)
            else:
                cross.append(a)

        profile: dict[str, Any] = {
            "total_activities": len(all_activities),
            "training_history_weeks": history_weeks,
        }

        profile["running"] = self._analyze_running(runs, today)
        profile["lifting"] = self._analyze_lifting(lifts, today)
        profile["cross_training"] = self._analyze_cross_training(cross, today)
        profile["weekly_pattern"] = self._analyze_weekly_pattern(all_activities, today)

        return profile

    def _analyze_running(self, runs: list, today: date) -> dict:
        if not runs:
            return {"total_runs": 0}

        weeks = 12
        start = today - timedelta(weeks=weeks)
        weekly_miles = [0.0] * weeks
        weekly_counts = [0] * weeks

        all_paces = []
        all_hrs = []
        easy_paces = []
        hard_paces = []
        easy_hrs = []
        hard_hrs = []
        max_hr = 0.0
        key_efforts = []

        for r in runs:
            rd = r.start_date.date()
            dist_mi = (r.distance or 0) / 1609.34

            if rd >= start:
                wk_idx = min((rd - start).days // 7, weeks - 1)
                weekly_miles[wk_idx] += dist_mi
                weekly_counts[wk_idx] += 1

            if r.average_speed and r.distance and r.distance > 500:
                pace_sec = 1609.34 / r.average_speed
                all_paces.append(pace_sec)

            if r.average_heartrate:
                all_hrs.append(r.average_heartrate)
            if r.max_heartrate and r.max_heartrate > max_hr:
                max_hr = r.max_heartrate

            if dist_mi > 5 and r.average_speed and rd >= today - timedelta(weeks=8):
                pace_sec = 1609.34 / r.average_speed
                key_efforts.append({
                    "date": rd.isoformat(),
                    "name": r.name or "Run",
                    "distance_mi": round(dist_mi, 1),
                    "pace": _format_pace(pace_sec),
                    "avg_hr": round(r.average_heartrate) if r.average_heartrate else None,
                })

        # Easy/hard classification
        hr_threshold = max_hr * 0.80 if max_hr > 0 else None
        median_pace = sorted(all_paces)[len(all_paces) // 2] if all_paces else None

        for r in runs:
            if not r.average_speed or not r.distance or r.distance < 500:
                continue
            pace_sec = 1609.34 / r.average_speed
            is_hard = False
            if hr_threshold and r.average_heartrate:
                is_hard = r.average_heartrate >= hr_threshold
            elif median_pace:
                is_hard = pace_sec < median_pace

            if is_hard:
                hard_paces.append(pace_sec)
                if r.average_heartrate:
                    hard_hrs.append(r.average_heartrate)
            else:
                easy_paces.append(pace_sec)
                if r.average_heartrate:
                    easy_hrs.append(r.average_heartrate)

        weekly_miles_rounded = [round(m, 1) for m in weekly_miles]
        avg_4wk = sum(weekly_miles[-4:]) / 4 if weeks >= 4 else sum(weekly_miles) / max(len(weekly_miles), 1)
        avg_prior_4wk = sum(weekly_miles[-8:-4]) / 4 if weeks >= 8 else avg_4wk

        if avg_prior_4wk > 0:
            pct_change = (avg_4wk - avg_prior_4wk) / avg_prior_4wk
            if pct_change > 0.10:
                trend = "building"
            elif pct_change < -0.10:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "new"

        active_weeks = [m for m in weekly_miles if m > 0]
        longest_4wk = max((r.distance or 0) / 1609.34 for r in runs if r.start_date.date() >= today - timedelta(weeks=4)) if any(r.start_date.date() >= today - timedelta(weeks=4) for r in runs) else 0

        key_efforts.sort(key=lambda e: e["distance_mi"], reverse=True)

        return {
            "total_runs": len(runs),
            "weekly_mileage_12wk": weekly_miles_rounded,
            "trend": trend,
            "avg_weekly_mileage_4wk": round(avg_4wk, 1),
            "avg_weekly_mileage_prior_4wk": round(avg_prior_4wk, 1),
            "peak_weekly_mileage": round(max(weekly_miles), 1) if weekly_miles else 0,
            "longest_run_4wk_mi": round(longest_4wk, 1),
            "avg_easy_pace": _format_pace(sum(easy_paces) / len(easy_paces)) if easy_paces else None,
            "avg_hard_pace": _format_pace(sum(hard_paces) / len(hard_paces)) if hard_paces else None,
            "avg_easy_hr": round(sum(easy_hrs) / len(easy_hrs)) if easy_hrs else None,
            "avg_hard_hr": round(sum(hard_hrs) / len(hard_hrs)) if hard_hrs else None,
            "max_hr_observed": round(max_hr) if max_hr > 0 else None,
            "runs_per_week_avg": round(len(active_weeks) and sum(weekly_counts[-8:]) / min(8, weeks), 1),
            "key_efforts": key_efforts[:5],
        }

    def _analyze_lifting(self, lifts: list, today: date) -> dict:
        if not lifts:
            return {"total_sessions": 0, "consistency": "none"}

        weeks = 12
        start = today - timedelta(weeks=weeks)
        weekly_counts = [0] * weeks
        durations = []

        for l in lifts:
            ld = l.start_date.date()
            if ld >= start:
                wk_idx = min((ld - start).days // 7, weeks - 1)
                weekly_counts[wk_idx] += 1
            if l.moving_time:
                durations.append(l.moving_time / 60)

        active_weeks = [c for c in weekly_counts if c > 0]
        avg_per_week = sum(weekly_counts) / weeks

        if len(active_weeks) >= weeks * 0.7:
            consistency = "consistent"
        elif len(active_weeks) >= weeks * 0.4:
            consistency = "moderate"
        else:
            consistency = "sporadic"

        return {
            "total_sessions": len(lifts),
            "sessions_per_week_12wk": weekly_counts,
            "avg_sessions_per_week": round(avg_per_week, 1),
            "avg_session_duration_min": round(sum(durations) / len(durations)) if durations else None,
            "consistency": consistency,
        }

    def _analyze_cross_training(self, cross: list, today: date) -> dict:
        if not cross:
            return {}

        weeks = 12
        start = today - timedelta(weeks=weeks)
        type_counts: dict[str, int] = defaultdict(int)

        for c in cross:
            if c.start_date.date() >= start:
                type_counts[c.sport_type] += 1

        return {
            "types_and_weekly_freq": {
                k: round(v / weeks, 1) for k, v in type_counts.items()
            },
        }

    def _analyze_weekly_pattern(self, activities: list, today: date) -> dict:
        weeks = 8
        start = today - timedelta(weeks=weeks)
        day_counts = [0] * 7
        weekly_training_days: list[set] = [set() for _ in range(weeks)]

        for a in activities:
            ad = a.start_date.date()
            if ad >= start:
                wk_idx = min((ad - start).days // 7, weeks - 1)
                dow = ad.weekday()
                day_counts[dow] += 1
                weekly_training_days[wk_idx].add(dow)

        total_training_days = sum(len(s) for s in weekly_training_days)
        avg_training_days = total_training_days / weeks
        preferred = [i for i in range(7) if day_counts[i] >= weeks * 0.4]

        max_volume_jump = 0.0
        for i in range(1, len(weekly_training_days)):
            prev = len(weekly_training_days[i - 1])
            curr = len(weekly_training_days[i])
            if prev > 0:
                jump = (curr - prev) / prev
                if jump > max_volume_jump:
                    max_volume_jump = jump

        return {
            "preferred_days": preferred,
            "avg_training_days_per_week": round(avg_training_days, 1),
            "avg_rest_days_per_week": round(7 - avg_training_days, 1),
        }

    async def _get_athlete_notes(self, user_id: uuid.UUID) -> list:
        result = await self.db.execute(
            select(AthleteNote).where(
                and_(AthleteNote.user_id == user_id, AthleteNote.active == True)
            ).order_by(AthleteNote.created_at.desc())
        )
        return [
            {
                "id": str(n.id),
                "category": n.category,
                "content": n.content,
                "created_at": n.created_at.strftime("%Y-%m-%d"),
            }
            for n in result.scalars().all()
        ]

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


def _format_pace(seconds_per_mile: float) -> str:
    m = int(seconds_per_mile // 60)
    s = int(seconds_per_mile % 60)
    return f"{m}:{s:02d}/mi"


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

    if ctx.athlete_notes:
        lines.append("\nAthlete Notes:")
        for n in ctx.athlete_notes:
            lines.append(f"  [{n['category']}] {n['content']} (id: {n['id']}, {n['created_at']})")

    if ctx.planned_vs_actual["planned"] > 0:
        pva = ctx.planned_vs_actual
        lines.append(f"\nCompliance: {pva['completed']}/{pva['planned']} workouts completed ({pva['skipped']} skipped)")

    if ctx.fitness_profile:
        lines.append(_format_fitness_profile(ctx.fitness_profile))
    elif ctx.recent_activities:
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


def _format_fitness_profile(fp: dict) -> str:
    lines = [f"\nTraining History: {fp['training_history_weeks']} weeks of data ({fp['total_activities']} activities)"]

    r = fp.get("running", {})
    if r.get("total_runs", 0) > 0:
        lines.append("\nRunning:")
        wk = r.get("weekly_mileage_12wk", [])
        if wk:
            lines.append(f"  Weekly mileage (last 12wk): {' → '.join(str(m) for m in wk)}")
        lines.append(f"  Trend: {r.get('trend', 'unknown')}. Avg {r.get('avg_weekly_mileage_4wk', 0)} mi/wk (last 4wk), {r.get('avg_weekly_mileage_prior_4wk', 0)} mi/wk (prior 4wk)")
        lines.append(f"  Peak week: {r.get('peak_weekly_mileage', 0)} mi. Longest recent run: {r.get('longest_run_4wk_mi', 0)} mi")
        if r.get("avg_easy_pace"):
            parts = [f"Easy pace: ~{r['avg_easy_pace']}"]
            if r.get("avg_easy_hr"):
                parts[0] += f" @ HR {r['avg_easy_hr']}"
            if r.get("avg_hard_pace"):
                parts.append(f"Hard pace: ~{r['avg_hard_pace']}")
                if r.get("avg_hard_hr"):
                    parts[-1] += f" @ HR {r['avg_hard_hr']}"
            if r.get("max_hr_observed"):
                parts.append(f"Max HR: {r['max_hr_observed']}")
            lines.append(f"  {'. '.join(parts)}")
        if r.get("key_efforts"):
            lines.append("  Key efforts:")
            for e in r["key_efforts"]:
                parts = [f"{e['distance_mi']} mi @ {e['pace']}"]
                if e.get("avg_hr"):
                    parts.append(f"HR {e['avg_hr']}")
                lines.append(f"    {e['date']} {e['name']}: {', '.join(parts)}")
        lines.append(f"  Frequency: {r.get('runs_per_week_avg', 0)} runs/wk avg")

    l = fp.get("lifting", {})
    if l.get("total_sessions", 0) > 0:
        lines.append(f"\nLifting: {l.get('avg_sessions_per_week', 0)} sessions/wk, {l.get('consistency', 'unknown')} consistency")
        if l.get("avg_session_duration_min"):
            lines.append(f"  Avg session: {l['avg_session_duration_min']} min")

    ct = fp.get("cross_training", {})
    if ct.get("types_and_weekly_freq"):
        parts = [f"{k} {v}x/wk" for k, v in ct["types_and_weekly_freq"].items()]
        lines.append(f"\nCross-training: {', '.join(parts)}")

    wp = fp.get("weekly_pattern", {})
    if wp:
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        pref = [day_names[d] for d in wp.get("preferred_days", [])]
        lines.append(f"\nPattern: Trains {'/'.join(pref) if pref else 'varied days'}. {wp.get('avg_training_days_per_week', 0)} training days/wk, {wp.get('avg_rest_days_per_week', 0)} rest days/wk")

    return "\n".join(lines)
