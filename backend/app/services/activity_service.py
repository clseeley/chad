from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Any, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.workout import PlannedWorkout

SPORT_TYPE_MAP = {
    "Run": "running",
    "TrailRun": "running",
    "VirtualRun": "running",
    "Walk": "cross_training",
    "Hike": "cross_training",
    "Ride": "cross_training",
    "VirtualRide": "cross_training",
    "MountainBikeRide": "cross_training",
    "Swim": "cross_training",
    "WeightTraining": "lifting",
    "Crossfit": "lifting",
    "Yoga": "cross_training",
    "Workout": "cross_training",
    "Elliptical": "cross_training",
    "StairStepper": "cross_training",
    "Rowing": "cross_training",
}


async def sync_activity_from_strava(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: dict[str, Any],
    access_token: str,
) -> Activity:
    start_date = datetime.fromisoformat(data["start_date"].replace("Z", "+00:00"))

    activity = Activity(
        user_id=user_id,
        strava_id=data["id"],
        sport_type=data.get("sport_type", data.get("type", "Workout")),
        name=data.get("name"),
        description=data.get("description"),
        start_date=start_date,
        moving_time=data.get("moving_time"),
        elapsed_time=data.get("elapsed_time"),
        distance=data.get("distance"),
        total_elevation_gain=data.get("total_elevation_gain"),
        average_speed=data.get("average_speed"),
        max_speed=data.get("max_speed"),
        average_heartrate=data.get("average_heartrate"),
        max_heartrate=data.get("max_heartrate"),
        suffer_score=data.get("suffer_score"),
        calories=data.get("calories"),
        splits_json=data.get("splits_metric"),
        laps_json=data.get("laps"),
        raw_json=data,
    )

    db.add(activity)
    await db.flush()

    await match_activity_to_workout(db, activity)
    return activity


async def match_activity_to_workout(db: AsyncSession, activity: Activity) -> None:
    our_sport = SPORT_TYPE_MAP.get(activity.sport_type)
    if not our_sport:
        return

    activity_date = activity.start_date.date()

    result = await db.execute(
        select(PlannedWorkout).where(
            and_(
                PlannedWorkout.user_id == activity.user_id,
                PlannedWorkout.scheduled_date == activity_date,
                PlannedWorkout.sport == our_sport,
                PlannedWorkout.completed == False,
                PlannedWorkout.matched_activity_id == None,
            )
        ).order_by(PlannedWorkout.created_at).limit(1)
    )
    workout = result.scalar_one_or_none()
    if workout:
        workout.completed = True
        workout.matched_activity_id = activity.id
        activity.matched_workout_id = workout.id
