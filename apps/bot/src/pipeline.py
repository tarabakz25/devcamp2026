"""Shared message pipeline: normalize -> save -> context -> agents -> policy."""
from __future__ import annotations

import time
from dataclasses import dataclass

from ai_core import (
    build_context,
    decide,
    judge_intervention,
    make_handoff,
    observe,
    record,
)
from ai_core.policy import Decision
from gateway import NormalizedMessage, normalize_event
from store import SqliteRules, save_message, thread_messages, upsert_user

ROOMI_USER_ID = "U-ROOMI"
ROOMI_NAME = "Roomi"


@dataclass
class ProcessResult:
    accepted: bool
    message: dict | None
    should_act: bool
    action: str
    reason: str
    confidence: float
    impact: float
    summary: str
    bot_message: dict | None
    bot_text: str


def _public_message(msg: NormalizedMessage, *, is_bot: bool = False) -> dict:
    return {
        "id": msg.message_id,
        "user_id": msg.user_id,
        "text": msg.text,
        "ts": msg.ts,
        "is_mention": msg.is_mention,
        "is_bot": is_bot or msg.user_id == ROOMI_USER_ID,
        "thread_id": msg.thread_id,
        "channel_id": msg.channel_id,
    }


def save_bot_reply(
    conn, channel_id: str, thread_id: str, text: str
) -> dict:
    ts = str(time.time())
    msg = NormalizedMessage(
        event_id=f"{channel_id}-{ts}",
        channel_id=channel_id,
        thread_id=thread_id,
        message_id=f"{channel_id}-{ts}",
        user_id=ROOMI_USER_ID,
        text=text,
        ts=ts,
        is_mention=False,
        is_thread_reply=True,
    )
    upsert_user(conn, ROOMI_USER_ID, ROOMI_NAME, "AI")
    save_message(conn, msg)
    public = _public_message(msg, is_bot=True)
    public["user_name"] = ROOMI_NAME
    public["role"] = "AI"
    public["avatar"] = ""
    return public


def evaluate_thread(
    conn,
    llm,
    thread_id: str,
    channel_id: str,
    *,
    now: float | None = None,
    force: bool = False,
    persist_bot: bool = True,
) -> ProcessResult:
    rows = thread_messages(conn, thread_id)
    if not rows:
        return ProcessResult(
            accepted=True,
            message=None,
            should_act=False,
            action="silent",
            reason="メッセージがない",
            confidence=0.0,
            impact=0.0,
            summary="",
            bot_message=None,
            bot_text="",
        )

    ctx = build_context([dict(r) for r in rows], thread_id, channel_id)
    result = judge_intervention(ctx, llm)
    rules = SqliteRules(conn)
    if force:
        decision = Decision(True, "reply", result.reason)
    else:
        decision = decide(rules, channel_id, thread_id, result, now=now)

    bot_message = None
    bot_text = ""
    summary = ""
    if decision.should_act and persist_bot:
        summary = observe(ctx, llm)
        record(rules, thread_id, result, decision.action)
        bot_text = make_handoff(ctx, summary)
        bot_message = save_bot_reply(conn, channel_id, thread_id, bot_text)

    return ProcessResult(
        accepted=True,
        message=None,
        should_act=decision.should_act,
        action=decision.action,
        reason=decision.reason,
        confidence=result.confidence,
        impact=result.impact,
        summary=summary,
        bot_message=bot_message,
        bot_text=bot_text,
    )


def process_event(
    conn,
    llm,
    payload: dict,
    *,
    now: float | None = None,
    force: bool = False,
    persist_bot: bool = True,
) -> ProcessResult:
    msg = normalize_event(payload)
    if msg is None:
        return ProcessResult(
            accepted=False,
            message=None,
            should_act=False,
            action="silent",
            reason="対応外のイベント",
            confidence=0.0,
            impact=0.0,
            summary="",
            bot_message=None,
            bot_text="",
        )
    if msg.user_id == ROOMI_USER_ID:
        return ProcessResult(
            accepted=False,
            message=_public_message(msg, is_bot=True),
            should_act=False,
            action="silent",
            reason="Roomi自身の発言は再評価しない",
            confidence=0.0,
            impact=0.0,
            summary="",
            bot_message=None,
            bot_text="",
        )

    if "@roomi" in msg.text.lower():
        msg.is_mention = True

    save_message(conn, msg)
    if not persist_bot:
        return ProcessResult(
            accepted=True,
            message=_public_message(msg),
            should_act=False,
            action="silent",
            reason="再生中の記録のみ",
            confidence=0.0,
            impact=0.0,
            summary="",
            bot_message=None,
            bot_text="",
        )
    out = evaluate_thread(
        conn,
        llm,
        msg.thread_id,
        msg.channel_id,
        now=now,
        force=force,
        persist_bot=persist_bot,
    )
    out.message = _public_message(msg)
    return out
