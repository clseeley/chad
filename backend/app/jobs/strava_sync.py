from __future__ import annotations

import time

import structlog
from sqlalchemy import select, and_

from app.database import async_session
from app.integrations import strava_client
from app.models.activity import Activity
from app.models.strava_token import StravaToken
from app.models.user import User
from app.services.activity_service import sync_activity_from_strava

log = structlog.get_logger()

SYNC_LOOKBACK_HOURS = 12


async def sync_all_strava_users():
    """Safety-net sync: fetch recent activities for all connected Strava users."""
    async with async_session() as db:
        result = await db.execute(
            select(StravaToken).join(User, StravaToken.user_id == User.id)
        )
        tokens = result.scalars().all()

        for token in tokens:
            try:
                access = await strava_client.get_valid_access_token(token)
                after = int(time.time()) - (SYNC_LOOKBACK_HOURS * 3600)

                activities = await strava_client.get_athlete_activities(
                    access, after=after, per_page=30
                )

                synced = 0
                for act_summary in activities:
                    existing = await db.execute(
                        select(Activity).where(
                            and_(
                                Activity.user_id == token.user_id,
                                Activity.strava_id == act_summary["id"],
                            )
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue

                    detail = await strava_client.get_activity_detail(
                        access, act_summary["id"]
                    )
                    await sync_activity_from_strava(db, token.user_id, detail, access)
                    synced += 1

                if synced:
                    await db.commit()
                    log.info(
                        "strava_sync_backfill",
                        user_id=str(token.user_id),
                        synced=synced,
                    )

            except Exception as e:
                log.error(
                    "strava_sync_error",
                    user_id=str(token.user_id),
                    error=str(e),
                )
