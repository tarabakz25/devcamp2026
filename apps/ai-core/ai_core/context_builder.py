"""Context Builder: thread state / stakeholders / unresolved points."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ThreadContext:
    thread_id: str
    channel_id: str
    participants: list[str] = field(default_factory=list)
    message_count: int = 0
    mentions_bot: bool = False
    questions_open: int = 0
    summary: str = ""
    unresolved: list[str] = field(default_factory=list)
    messages: list[dict] = field(default_factory=list)


QUESTION_MARKS = ("?", "？", "どう", "なぜ", "なんで", "誰", "いつ", "どうする", "決まって")


def build_context(messages: list[dict], thread_id: str, channel_id: str) -> ThreadContext:
    participants: list[str] = []
    for m in messages:
        u = m.get("user_id") or m.get("user", "")
        if u and u not in participants:
            participants.append(u)

    texts = [m.get("text", "") for m in messages]
    unresolved = [
        t for t in texts if any(q in t for q in QUESTION_MARKS)
    ][-5:]

    return ThreadContext(
        thread_id=thread_id,
        channel_id=channel_id,
        participants=participants,
        message_count=len(messages),
        # A previous mention must not make every later turn an immediate reply.
        mentions_bot=bool(messages and messages[-1].get("is_mention")),
        questions_open=len(unresolved),
        summary="\n".join(texts[-5:])[:2000],
        unresolved=unresolved,
        messages=[dict(message) for message in messages[-12:]],
    )
