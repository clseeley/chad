from __future__ import annotations

from datetime import date, datetime, timedelta

import structlog
from sqlalchemy import select, and_

from app.agent.coach import ChadCoach
from app.database import async_session
from app.integrations import twilio_client
from app.models.user import User
from app.models.training_plan import TrainingPlan
from app.models.workout import PlannedWorkout

log = structlog.get_logger()


async def send_weekly_reviews():
    """Sunday evening: compare planned vs actual for the week, send summary SMS."""
    async with async_session() as db:
        result = await db.execute(
            select(User).where(
                and_(User.phone != None, User.onboarding_complete == True)
            )
        )
        users = result.scalars().all()

        for user in users:
            try:
                now = _now_in_timezone(user.timezone)
                if now.weekday() != 6:
                    continue
                if now.hour != user.notification_hour:
                    continue

                plan_result = await db.execute(
                    select(TrainingPlan).where(
                        and_(
                            TrainingPlan.user_id == user.id,
                            TrainingPlan.status == "active",
                        )
                    )
                )
                plan = plan_result.scalar_one_or_none()
                if not plan:
                    continue

                today = date.today()
                week_start = today - timedelta(days=6)
                workout_result = await db.execute(
                    select(PlannedWorkout).where(
                        and_(
                            PlannedWorkout.user_id == user.id,
                            PlannedWorkout.training_plan_id == plan.id,
                            PlannedWorkout.scheduled_date >= week_start,
                            PlannedWorkout.scheduled_date <= today,
                        )
                    )
                )
                workouts = workout_result.scalars().all()
                if not workouts:
                    continue

                total = len(workouts)
                completed = sum(1 for w in workouts if w.completed)
                compliance = completed / total if total else 0

                summary_parts = [
                    f"Week in review: {completed}/{total} workouts completed ({compliance:.0%}).",
                ]
                missed = [w for w in workouts if not w.completed]
                if missed:
                    missed_names = ", ".join(w.title for w in missed[:3])
                    summary_parts.append(f"Missed: {missed_names}.")

                coach = ChadCoach(db)
                if compliance < 0.6 and total >= 3:
                    try:
                        reason = (
                            f"Only completed {completed}/{total} workouts this week "
                            f"({compliance:.0%} compliance). Missed: "
                            + ", ".join(w.title for w in missed[:3])
                        )
                        await coach.adjust_plan(user.id, reason)
                        summary_parts.append(
                            "I've adjusted your upcoming week to account for this."
                        )
                    except Exception as e:
                        log.error(
                            "plan_adjust_error",
                            user_id=str(user.id),
                            error=str(e),
                        )

                summary = " ".join(summary_parts)
                twilio_client.send_sms(user.phone, summary)
                log.info(
                    "weekly_review_sent",
                    user_id=str(user.id),
                    compliance=compliance,
                )

            except Exception as e:
                log.error(
                    "weekly_review_error",
                    user_id=str(user.id),
                    error=str(e),
                )


def _now_in_timezone(tz_name: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(tz_name))
