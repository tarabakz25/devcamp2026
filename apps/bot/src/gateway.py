"""Event Gateway: Slack Events -> normalize -> queue."""
from __future__ import annotations

import queue
import re
from dataclasses import dataclass


@dataclass
class NormalizedMessage:
    event_id: str
    channel_id: str
    thread_id: str
    message_id: str
    user_id: str
    text: str
    ts: str
    is_mention: bool = False
    is_thread_reply: bool = False


MENTION_RE = re.compile(r"<@[A-Z0-9]+>")


def normalize_event(payload: dict) -> NormalizedMessage | None:
    """Slack Events API payloadを正規化。対応外はNone。"""
    event = payload.get("event", payload)
    etype = event.get("type")

    if etype not in ("message", "app_mention", "reaction_added"):
        return None
    if etype == "reaction_added":
        # reactionはスレッド文脈のヒントとしてのみ扱う
        return None
    if event.get("subtype") in ("bot_message", "message_changed", "message_deleted"):
        return None

    text = event.get("text", "")
    channel = event.get("channel", "")
    ts = event.get("ts", "")
    thread_ts = event.get("thread_ts", "") or ts
    user = event.get("user", "UNKNOWN")

    return NormalizedMessage(
        event_id=f"{channel}-{ts}",
        channel_id=channel,
        thread_id=f"{channel}-{thread_ts}",
        message_id=f"{channel}-{ts}",
        user_id=user,
        text=text,
        ts=ts,
        is_mention=(etype == "app_mention") or bool(MENTION_RE.search(text)),
        is_thread_reply=bool(event.get("thread_ts")),
    )


class EventQueue:
    """MVPはインメモリ。本番はRedis/SQS等に差し替え。"""

    def __init__(self) -> None:
        self._q: queue.Queue[NormalizedMessage] = queue.Queue()

    def put(self, msg: NormalizedMessage) -> None:
        self._q.put(msg)

    def get(self) -> NormalizedMessage | None:
        try:
            return self._q.get_nowait()
        except queue.Empty:
            return None

    def __len__(self) -> int:
        return self._q.qsize()
