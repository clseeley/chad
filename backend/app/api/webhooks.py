from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.coach import ChadCoach
from app.config import settings
from app.database import get_db
from app.integrations.twilio_client import validate_request
from app.models.user import User

log = structlog.get_logger()
router = APIRouter()


@router.post("/twilio")
async def twilio_inbound(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    params = dict(form)

    signature = request.headers.get("X-Twilio-Signature", "")
    url = str(request.url)

    if settings.TWILIO_AUTH_TOKEN and not validate_request(url, params, signature):
        log.warning("twilio_invalid_signature")
        return Response(
            content=_twiml("Sorry, I couldn't verify that request."),
            media_type="application/xml",
        )

    from_number = params.get("From", "")
    body = params.get("Body", "").strip()

    if not body:
        return Response(content=_twiml(""), media_type="application/xml")

    result = await db.execute(select(User).where(User.phone == from_number))
    user = result.scalar_one_or_none()

    if not user:
        log.info("twilio_unknown_number", from_number=from_number)
        return Response(
            content=_twiml(
                "Hey! I don't recognize this number. "
                "Sign up at the web app and add your phone number in Settings to get started."
            ),
            media_type="application/xml",
        )

    log.info("twilio_inbound", user_id=str(user.id), body_length=len(body))

    coach = ChadCoach(db)
    try:
        reply = await coach.respond(user.id, body, channel="sms")
    except Exception as e:
        log.error("twilio_coach_error", user_id=str(user.id), error=str(e))
        reply = "Sorry, I'm having trouble right now. Try again in a minute."

    return Response(content=_twiml(reply), media_type="application/xml")


def _twiml(message: str) -> str:
    from xml.sax.saxutils import escape
    if not message:
        return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Message>{escape(message)}</Message></Response>"
    )
