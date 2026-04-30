from __future__ import annotations

import asyncio

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

log = structlog.get_logger()

scheduler = AsyncIOScheduler()


def _run_async(coro_func):
    """Wrap an async job function for APScheduler."""
    def wrapper():
        loop = asyncio.get_event_loop()
        loop.create_task(coro_func())
    return wrapper


def start_scheduler():
    from app.jobs.daily_workout import send_daily_workouts
    from app.jobs.plan_review import send_weekly_reviews
    from app.jobs.strava_sync import sync_all_strava_users

    scheduler.add_job(
        send_daily_workouts,
        trigger=CronTrigger(minute="*/15"),
        id="daily_workouts",
        replace_existing=True,
    )

    scheduler.add_job(
        send_weekly_reviews,
        trigger=CronTrigger(minute="*/15"),
        id="weekly_reviews",
        replace_existing=True,
    )

    scheduler.add_job(
        sync_all_strava_users,
        trigger=IntervalTrigger(hours=6),
        id="strava_sync",
        replace_existing=True,
    )

    scheduler.start()
    log.info("scheduler_started", jobs=len(scheduler.get_jobs()))


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        log.info("scheduler_stopped")
