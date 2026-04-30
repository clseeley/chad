from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session, get_db
from app.dependencies import get_current_user
from app.integrations import strava_client
from app.models.activity import Activity
from app.models.strava_token import StravaToken
from app.models.user import User
from app.services.activity_service import sync_activity_from_strava

log = structlog.get_logger()
router = APIRouter()


@router.get("/connect")
async def strava_connect(user: User = Depends(get_current_user)):
    if not settings.STRAVA_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Strava not configured")
    state = str(user.id)
    url = strava_client.get_authorization_url(state)
    return {"authorization_url": url}


@router.get("/callback")
async def strava_callback(
    code: str = Query(...),
    scope: str = Query(""),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    try:
        user_id = uuid.UUID(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    token_data = await strava_client.exchange_code(code)

    existing = await db.execute(
        select(StravaToken).where(StravaToken.user_id == user_id)
    )
    strava_token = existing.scalar_one_or_none()

    if strava_token:
        strava_token.access_token = token_data["access_token"]
        strava_token.refresh_token = token_data["refresh_token"]
        strava_token.expires_at = token_data["expires_at"]
        strava_token.strava_athlete_id = token_data["athlete"]["id"]
        strava_token.scope = scope
    else:
        strava_token = StravaToken(
            user_id=user_id,
            strava_athlete_id=token_data["athlete"]["id"],
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_at=token_data["expires_at"],
            scope=scope,
        )
        db.add(strava_token)

    await db.commit()

    from urllib.parse import urlencode
    redirect_url = f"{settings.FRONTEND_URL}/settings?{urlencode({'strava': 'connected'})}"
    from starlette.responses import RedirectResponse
    return RedirectResponse(url=redirect_url)


@router.get("/status")
async def strava_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StravaToken).where(StravaToken.user_id == user.id)
    )
    token = result.scalar_one_or_none()
    if not token:
        return {"connected": False}

    return {
        "connected": True,
        "athlete_id": token.strava_athlete_id,
    }


@router.delete("/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def strava_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StravaToken).where(StravaToken.user_id == user.id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Strava not connected")

    try:
        access = await strava_client.get_valid_access_token(token)
        await strava_client.deauthorize(access)
    except Exception:
        log.warning("strava_deauthorize_failed", user_id=str(user.id))

    await db.delete(token)
    await db.commit()


@router.post("/sync")
async def strava_sync(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StravaToken).where(StravaToken.user_id == user.id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=400, detail="Strava not connected")

    background_tasks.add_task(_sync_user_activities, user.id)
    return {"status": "sync_started"}


async def _sync_user_activities(user_id: uuid.UUID):
    async with async_session() as db:
        result = await db.execute(
            select(StravaToken).where(StravaToken.user_id == user_id)
        )
        token = result.scalar_one_or_none()
        if not token:
            return

        access = await strava_client.get_valid_access_token(token)
        await db.commit()

        last_activity = await db.execute(
            select(Activity.start_date)
            .where(Activity.user_id == user_id)
            .order_by(Activity.start_date.desc())
            .limit(1)
        )
        last = last_activity.scalar_one_or_none()
        after = int(last.timestamp()) if last else int(time.time()) - 86400 * 90

        page = 1
        total_synced = 0
        while True:
            activities = await strava_client.get_athlete_activities(
                access, after=after, page=page, per_page=50
            )
            if not activities:
                break

            for a in activities:
                existing = await db.execute(
                    select(Activity).where(Activity.strava_id == a["id"])
                )
                if existing.scalar_one_or_none():
                    continue
                await sync_activity_from_strava(db, user_id, a, access)
                total_synced += 1

            if len(activities) < 50:
                break
            page += 1

        await db.commit()
        log.info("strava_sync_complete", user_id=str(user_id), synced=total_synced)


# --- Strava Webhook ---

@router.get("/webhook")
async def strava_webhook_validate(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.STRAVA_WEBHOOK_VERIFY_TOKEN:
        return {"hub.challenge": hub_challenge}
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def strava_webhook_event(request: Request, background_tasks: BackgroundTasks):
    body = await request.json()
    log.info("strava_webhook", event=body)

    object_type = body.get("object_type")
    aspect_type = body.get("aspect_type")
    object_id = body.get("object_id")
    owner_id = body.get("owner_id")

    if object_type == "activity" and aspect_type == "create":
        background_tasks.add_task(_handle_new_activity, owner_id, object_id)
    elif object_type == "activity" and aspect_type == "update":
        background_tasks.add_task(_handle_updated_activity, owner_id, object_id)
    elif object_type == "athlete" and aspect_type == "update":
        updates = body.get("updates", {})
        if updates.get("authorized") == "false":
            background_tasks.add_task(_handle_deauthorization, owner_id)

    return {"status": "ok"}


async def _handle_new_activity(strava_athlete_id: int, activity_id: int):
    async with async_session() as db:
        result = await db.execute(
            select(StravaToken).where(StravaToken.strava_athlete_id == strava_athlete_id)
        )
        token = result.scalar_one_or_none()
        if not token:
            return

        access = await strava_client.get_valid_access_token(token)
        await db.commit()

        existing = await db.execute(
            select(Activity).where(Activity.strava_id == activity_id)
        )
        if existing.scalar_one_or_none():
            return

        detail = await strava_client.get_activity_detail(access, activity_id)
        await sync_activity_from_strava(db, token.user_id, detail, access)
        await db.commit()
        log.info("activity_synced_via_webhook", activity_id=activity_id, user_id=str(token.user_id))


async def _handle_updated_activity(strava_athlete_id: int, activity_id: int):
    async with async_session() as db:
        result = await db.execute(
            select(StravaToken).where(StravaToken.strava_athlete_id == strava_athlete_id)
        )
        token = result.scalar_one_or_none()
        if not token:
            return

        access = await strava_client.get_valid_access_token(token)
        await db.commit()

        detail = await strava_client.get_activity_detail(access, activity_id)

        existing = await db.execute(
            select(Activity).where(Activity.strava_id == activity_id)
        )
        activity = existing.scalar_one_or_none()
        if activity:
            activity.name = detail.get("name")
            activity.description = detail.get("description")
            activity.raw_json = detail
        else:
            await sync_activity_from_strava(db, token.user_id, detail, access)

        await db.commit()


async def _handle_deauthorization(strava_athlete_id: int):
    async with async_session() as db:
        result = await db.execute(
            select(StravaToken).where(StravaToken.strava_athlete_id == strava_athlete_id)
        )
        token = result.scalar_one_or_none()
        if token:
            await db.delete(token)
            await db.commit()
            log.info("strava_deauthorized_via_webhook", athlete_id=strava_athlete_id)
