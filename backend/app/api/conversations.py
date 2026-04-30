from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.coach import ChadCoach
from app.database import get_db
from app.dependencies import get_current_user
from app.models.message import Message
from app.models.user import User

router = APIRouter()


class ChatRequest(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: str
    channel: str
    direction: str
    role: str
    content: str
    created_at: str

    class Config:
        from_attributes = True


@router.get("")
async def list_messages(
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.user_id == user.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [
        MessageResponse(
            id=str(m.id),
            channel=m.channel,
            direction=m.direction,
            role=m.role,
            content=m.content,
            created_at=m.created_at.isoformat() if m.created_at else "",
        )
        for m in messages
    ]


@router.post("/message")
async def send_message(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    coach = ChadCoach(db)
    response = await coach.respond(user.id, body.content, channel="web")
    return {"response": response}
