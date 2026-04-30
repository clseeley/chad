from __future__ import annotations

from datetime import datetime, date

import structlog
from sqlalchemy import select, and_

from app.agent.coach import ChadCoach
from app.database import async_session
from app.integrations import twilio_client
from app.models.user import User
from app.models.workout import PlannedWorkout

log = structlog.get_logger()


async def send_daily_workouts():
    """Check all users and send morning workout texts to those whose notification hour matches now."""
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
                if now.hour != user.notification_hour:
                    continue

                today = date.today()
                workouts = await db.execute(
                    select(PlannedWorkout).where(
                        and_(
                            PlannedWorkout.user_id == user.id,
                            PlannedWorkout.scheduled_date == today,
                            PlannedWorkout.notification_sent == False,
                        )
                    )
                )
                pending = workouts.scalars().all()
                if not pending:
                    continue

                coach = ChadCoach(db)
                briefing = await coach.generate_daily_briefing(user.id)
                if briefing:
                    twilio_client.send_sms(user.phone, briefing)
                    for w in pending:
                        w.notification_sent = True
                    await db.commit()
                    log.info("daily_workout_sent", user_id=str(user.id))

            except Exception as e:
                log.error("daily_workout_error", user_id=str(user.id), error=str(e))


def _now_in_timezone(tz_name: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(tz_name))
