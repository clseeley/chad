from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from typing import Any, Optional

import structlog
from anthropic import AsyncAnthropic
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.context import AthleteContext, ContextBuilder, format_context_for_prompt
from app.agent.prompts import PLAN_GENERATION_PROMPT, SYSTEM_PROMPT
from app.agent.tools import COACH_TOOLS, execute_tool
from app.config import settings
from app.models.message import Message
from app.models.training_plan import TrainingPlan
from app.models.workout import PlannedWorkout

log = structlog.get_logger()


class ChadCoach:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.context_builder = ContextBuilder(db)

    async def respond(self, user_id: uuid.UUID, message: str, channel: str) -> str:
        await self._save_message(user_id, channel, "inbound", "user", message)

        ctx = await self.context_builder.build(user_id)
        context_text = format_context_for_prompt(ctx)

        messages = []
        for m in ctx.conversation_history[:-1]:
            messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": f"{context_text}\n\n{message}"})

        response_text = await self._call_with_tools(messages, channel)

        await self._save_message(user_id, channel, "outbound", "assistant", response_text)
        await self.db.commit()

        return response_text

    async def generate_plan(self, user_id: uuid.UUID) -> TrainingPlan:
        ctx = await self.context_builder.build(
            user_id, include_plan=False, include_history=False, full_profile=True
        )
        context_text = format_context_for_prompt(ctx)

        messages = [
            {
                "role": "user",
                "content": f"{context_text}\n\n{PLAN_GENERATION_PROMPT}",
            }
        ]

        response = await self.client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        raw_text = response.content[0].text

        if response.stop_reason == "max_tokens":
            log.warning("plan_truncated", user_id=str(user_id), length=len(raw_text))

        rationale, plan_data = self._parse_plan_response(raw_text)

        plan = await self._save_plan(user_id, plan_data, ctx, rationale=rationale)
        await self.db.commit()

        log.info("plan_generated", user_id=str(user_id), plan_id=str(plan.id),
                 weeks=len(plan_data.get("weeks", [])))
        return plan

    async def generate_daily_briefing(self, user_id: uuid.UUID) -> Optional[str]:
        ctx = await self.context_builder.build(user_id, include_history=False, conversation_limit=5)
        context_text = format_context_for_prompt(ctx)

        if not ctx.this_week_workouts:
            return None

        today_workouts = [w for w in ctx.this_week_workouts if w["date"] == ctx.today]
        if not today_workouts:
            return None

        messages = [
            {
                "role": "user",
                "content": (
                    f"{context_text}\n\n"
                    "Generate a brief, motivating morning text message for today's workout. "
                    "Keep it under 300 characters. Include the workout details. "
                    "If they completed yesterday's workout, mention it briefly."
                ),
            }
        ]

        response = await self.client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        text = response.content[0].text
        await self._save_message(user_id, "sms", "outbound", "assistant", text)
        await self.db.commit()
        return text

    async def adjust_plan(self, user_id: uuid.UUID, reason: str) -> str:
        ctx = await self.context_builder.build(user_id, include_history=False)
        context_text = format_context_for_prompt(ctx)

        messages = [
            {
                "role": "user",
                "content": (
                    f"{context_text}\n\n"
                    f"The athlete's plan needs adjustment. Reason: {reason}\n\n"
                    "Using the available tools, make reasonable adjustments to the upcoming "
                    "week's workouts. Swap, lighten, or reschedule as appropriate. "
                    "Respond with a brief summary of what you changed."
                ),
            }
        ]

        response_text = await self._call_with_tools(messages, "system")
        self._current_user_id = user_id
        log.info("plan_adjusted", user_id=str(user_id), reason=reason)
        return response_text

    async def analyze_activity(self, user_id: uuid.UUID, activity_data: dict) -> Optional[str]:
        ctx = await self.context_builder.build(user_id, include_history=False, conversation_limit=0)

        messages = [
            {
                "role": "user",
                "content": (
                    f"{format_context_for_prompt(ctx)}\n\n"
                    f"The athlete just completed this activity:\n{json.dumps(activity_data, indent=2)}\n\n"
                    "Generate a brief (1-2 sentence) feedback message suitable for SMS. "
                    "Only respond if there's something noteworthy (great job, concern about pace, "
                    "missed the target significantly). If nothing notable, respond with just 'SKIP'."
                ),
            }
        ]

        response = await self.client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        text = response.content[0].text.strip()
        if text == "SKIP":
            return None
        return text

    async def _call_with_tools(self, messages: list, channel: str) -> str:
        max_iterations = 5

        for _ in range(max_iterations):
            response = await self.client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=2000,
                system=SYSTEM_PROMPT,
                messages=messages,
                tools=COACH_TOOLS,
            )

            if response.stop_reason == "end_turn":
                text_parts = [b.text for b in response.content if b.type == "text"]
                return " ".join(text_parts)

            tool_results = []
            text_parts = []

            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    user_id = self._extract_user_id(messages)
                    result = await execute_tool(block.name, block.input, user_id, self.db)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        text_parts = [b.text for b in response.content if b.type == "text"]
        return " ".join(text_parts) if text_parts else "I'm having trouble processing that right now."

    def _extract_user_id(self, messages: list) -> uuid.UUID:
        # The user_id is passed through the respond() method's closure
        # For tool execution, we store it on the instance during respond()
        return self._current_user_id

    async def _save_message(
        self, user_id: uuid.UUID, channel: str, direction: str, role: str, content: str
    ):
        self._current_user_id = user_id
        msg = Message(
            user_id=user_id,
            channel=channel,
            direction=direction,
            role=role,
            content=content,
        )
        self.db.add(msg)
        await self.db.flush()

    def _parse_plan_response(self, raw: str) -> tuple:
        rationale = None
        plan_json_text = raw

        if "<rationale>" in raw and "</rationale>" in raw:
            start = raw.index("<rationale>") + len("<rationale>")
            end = raw.index("</rationale>")
            rationale = raw[start:end].strip()

        if "<plan_json>" in raw:
            start = raw.index("<plan_json>") + len("<plan_json>")
            end = raw.index("</plan_json>") if "</plan_json>" in raw else len(raw)
            plan_json_text = raw[start:end].strip()

        plan_data = self._parse_plan_json(plan_json_text)
        return rationale, plan_data

    def _parse_plan_json(self, raw: str) -> dict:
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            repaired = text
            open_braces = repaired.count("{") - repaired.count("}")
            open_brackets = repaired.count("[") - repaired.count("]")
            last_complete = max(repaired.rfind("},"), repaired.rfind("}]"))
            if last_complete > 0:
                repaired = repaired[:last_complete + 1]
            repaired += "]" * open_brackets + "}" * open_braces
            open_braces = repaired.count("{") - repaired.count("}")
            open_brackets = repaired.count("[") - repaired.count("]")
            repaired += "]" * open_brackets + "}" * open_braces
            return json.loads(repaired)

    async def _save_plan(
        self, user_id: uuid.UUID, plan_data: dict, ctx: AthleteContext,
        rationale: Optional[str] = None,
    ) -> TrainingPlan:
        result = await self.db.execute(
            select(TrainingPlan).where(
                and_(TrainingPlan.user_id == user_id, TrainingPlan.status == "active")
            )
        )
        for old_plan in result.scalars().all():
            old_plan.status = "superseded"

        gen_context = {
            "goals": ctx.goals,
            "fitness_summary": ctx.fitness_summary,
        }
        if ctx.fitness_profile:
            gen_context["fitness_profile"] = ctx.fitness_profile

        plan = TrainingPlan(
            user_id=user_id,
            name=plan_data["name"],
            description=plan_data.get("description"),
            start_date=date.fromisoformat(plan_data["start_date"]),
            end_date=date.fromisoformat(plan_data["end_date"]),
            phase=plan_data.get("phases", [{}])[0].get("name") if plan_data.get("phases") else None,
            plan_json=plan_data,
            rationale=rationale,
            status="active",
            generation_context=gen_context,
        )
        self.db.add(plan)
        await self.db.flush()

        plan_start = date.fromisoformat(plan_data["start_date"])
        week1_monday = plan_start - timedelta(days=plan_start.weekday())

        for week in plan_data.get("weeks", []):
            week_num = week["week_number"]
            week_monday = week1_monday + timedelta(weeks=week_num - 1)

            for workout in week.get("workouts", []):
                day = workout["day_of_week"]
                scheduled = week_monday + timedelta(days=day)

                pw = PlannedWorkout(
                    training_plan_id=plan.id,
                    user_id=user_id,
                    scheduled_date=scheduled,
                    sport=workout["sport"],
                    workout_type=workout["workout_type"],
                    title=workout["title"],
                    description=workout["description"],
                    target_metrics=workout.get("target_metrics"),
                    week_number=week_num,
                    day_of_week=day,
                )
                self.db.add(pw)

        return plan
