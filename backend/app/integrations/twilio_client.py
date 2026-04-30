from __future__ import annotations

import structlog
from twilio.rest import Client
from twilio.request_validator import RequestValidator

from app.config import settings

log = structlog.get_logger()

_client = None
_validator = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client


def _get_validator() -> RequestValidator:
    global _validator
    if _validator is None:
        _validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
    return _validator


def send_sms(to: str, body: str) -> str:
    if not settings.TWILIO_ACCOUNT_SID:
        log.warning("twilio_not_configured", to=to)
        return "not_configured"

    if len(body) > 1600:
        body = body[:1597] + "..."

    message = _get_client().messages.create(
        body=body,
        from_=settings.TWILIO_PHONE_NUMBER,
        to=to,
    )
    log.info("sms_sent", to=to, sid=message.sid, length=len(body))
    return message.sid


def validate_request(url: str, params: dict, signature: str) -> bool:
    if not settings.TWILIO_AUTH_TOKEN:
        return True
    return _get_validator().validate(url, params, signature)
