from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from app.config import settings


AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API_BASE = "https://www.strava.com/api/v3"


def get_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.STRAVA_CLIENT_ID,
        "redirect_uri": f"{settings.API_URL}/api/strava/callback",
        "response_type": "code",
        "scope": "activity:read_all,profile:read_all",
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(TOKEN_URL, data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(TOKEN_URL, data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        return resp.json()


async def get_valid_access_token(strava_token) -> str:
    """Return a valid access token, refreshing if expired. Mutates the token object."""
    if strava_token.expires_at < int(time.time()) + 60:
        data = await refresh_access_token(strava_token.refresh_token)
        strava_token.access_token = data["access_token"]
        strava_token.refresh_token = data["refresh_token"]
        strava_token.expires_at = data["expires_at"]
    return strava_token.access_token


async def get_athlete_activities(
    access_token: str,
    after: Optional[int] = None,
    before: Optional[int] = None,
    page: int = 1,
    per_page: int = 50,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"page": page, "per_page": per_page}
    if after:
        params["after"] = after
    if before:
        params["before"] = before

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{API_BASE}/athlete/activities",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def get_activity_detail(access_token: str, activity_id: int) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{API_BASE}/activities/{activity_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def deauthorize(access_token: str) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://www.strava.com/oauth/deauthorize",
            headers={"Authorization": f"Bearer {access_token}"},
        )


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    expected = hmac.new(
        settings.STRAVA_CLIENT_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
