from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, conversations, health, strava, training, users, webhooks
from app.config import settings
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.middleware import RateLimitMiddleware

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer() if settings.ENVIRONMENT == "development"
        else structlog.processors.JSONRenderer(),
    ],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Chad", version="0.1.0", lifespan=lifespan)

origins = [settings.FRONTEND_URL]
if settings.ENVIRONMENT == "development":
    origins.append("http://localhost:5173")

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(strava.router, prefix="/api/strava", tags=["strava"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["conversations"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="static")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        file_path = STATIC_DIR / path
        if file_path.is_file():
            return Response(
                content=file_path.read_bytes(),
                media_type=_guess_media_type(file_path.suffix),
            )
        return Response(
            content=(STATIC_DIR / "index.html").read_bytes(),
            media_type="text/html",
        )


def _guess_media_type(suffix: str) -> str:
    types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }
    return types.get(suffix, "application/octet-stream")
