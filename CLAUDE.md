# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chad is an AI-powered fitness coaching agent. Users interact with it via SMS (Twilio) and a web frontend. It pulls activity data from Strava, combines it with user goals and daily inputs, and uses Claude to generate and optimize personalized training plans for running, lifting, and cross-training.

## Architecture

- **Backend**: Python 3.9 / FastAPI / SQLAlchemy (async) / Alembic
- **Frontend**: React + TypeScript + Vite
- **Database**: PostgreSQL 16
- **AI**: Claude API via Anthropic Python SDK
- **SMS**: Twilio (inbound webhooks + outbound)
- **Activity Data**: Strava OAuth2 API + webhooks
- **Hosting**: Railway

## Development Commands

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000    # dev server
alembic revision --autogenerate -m "msg"      # new migration
alembic upgrade head                          # run migrations
pytest                                        # run tests
pytest tests/test_auth.py -k test_login       # single test
```

### Frontend
```bash
cd frontend
npm run dev          # dev server (port 5173)
npm run build        # production build
npx tsc --noEmit     # type check
```

### Database
```bash
brew services start postgresql@16   # start postgres
# Connection: postgresql+asyncpg://chad:chad@localhost:5432/chad
```

## Key Patterns

- Python 3.9: use `from __future__ import annotations` and `Optional[T]` (not `T | None`)
- Models use SQLAlchemy 2.0 `Mapped` + `mapped_column` style
- All API routes are async, use `AsyncSession` from `app.database.get_db`
- Auth: JWT access tokens (15min) + refresh tokens (30 days) via `python-jose`
- Password hashing: passlib + bcrypt 4.0.1 (pinned for compatibility)
- Strava tokens encrypted at rest with Fernet (`EncryptedString` TypeDecorator)
- Frontend auth: React context + axios interceptor for JWT refresh
