from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.goal import Goal
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.user import GoalCreate, GoalResponse, GoalUpdate, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(user.id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        timezone=user.timezone,
        notification_hour=user.notification_hour,
        units=user.units,
        onboarding_complete=user.onboarding_complete,
    )


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.dict(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return UserResponse(
        id=str(user.id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        timezone=user.timezone,
        notification_hour=user.notification_hour,
        units=user.units,
        onboarding_complete=user.onboarding_complete,
    )


@router.get("/me/goals", response_model=list)
async def list_goals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.user_id == user.id).order_by(Goal.priority, Goal.created_at)
    )
    goals = result.scalars().all()
    return [
        GoalResponse(
            id=str(g.id),
            goal_type=g.goal_type,
            sport=g.sport,
            title=g.title,
            description=g.description,
            target_date=g.target_date,
            target_value=g.target_value,
            priority=g.priority,
            status=g.status,
        )
        for g in goals
    ]


@router.post("/me/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: GoalCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = Goal(user_id=user.id, **body.dict())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return GoalResponse(
        id=str(goal.id),
        goal_type=goal.goal_type,
        sport=goal.sport,
        title=goal.title,
        description=goal.description,
        target_date=goal.target_date,
        target_value=goal.target_value,
        priority=goal.priority,
        status=goal.status,
    )


@router.put("/me/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.id == uuid.UUID(goal_id), Goal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    for field, value in body.dict(exclude_unset=True).items():
        setattr(goal, field, value)
    await db.commit()
    await db.refresh(goal)
    return GoalResponse(
        id=str(goal.id),
        goal_type=goal.goal_type,
        sport=goal.sport,
        title=goal.title,
        description=goal.description,
        target_date=goal.target_date,
        target_value=goal.target_value,
        priority=goal.priority,
        status=goal.status,
    )


@router.delete("/me/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.id == uuid.UUID(goal_id), Goal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    await db.delete(goal)
    await db.commit()
