from __future__ import annotations

import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import twilio_client
from app.models.user import User

log = structlog.get_logger()


async def send_sms_to_user(db: AsyncSession, user_id: uuid.UUID, body: str) -> bool:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.phone:
        log.warning("sms_skipped_no_phone", user_id=str(user_id))
        return False

    try:
        twilio_client.send_sms(user.phone, body)
        return True
    except Exception as e:
        log.error("sms_send_failed", user_id=str(user_id), error=str(e))
        return False
