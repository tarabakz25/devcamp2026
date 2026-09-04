"""E2Eデモ: normalize -> save -> context -> agents -> policy -> action."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent
AI_CORE = BOT_SRC.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import (
    build_context,
    decide,
    get_llm,
    judge_intervention,
    make_handoff,
    observe,
    record,
)
from actions import post_message
from gateway import EventQueue, normalize_event
from store import SqliteRules, connect, save_message, thread_messages

DEMO_EVENTS = [
    {"type": "message", "channel": "C1", "user": "U1",
     "text": "新機能の仕様どうする?", "ts": "1"},
    {"type": "message", "channel": "C1", "user": "U2",
     "text": "決済フローが未確定で止まってる", "ts": "2",
     "thread_ts": "1"},
    {"type": "app_mention", "channel": "C1", "user": "U3",
     "text": "<@BOT> 過去の決済議論をまとめて?", "ts": "3",
     "thread_ts": "1"},
]


def run(dry_run: bool = True) -> None:
    import os

    os.environ["DRY_RUN"] = "true" if dry_run else "false"
    conn = connect()
    llm = get_llm("dummy")
    q = EventQueue()

    for ev in DEMO_EVENTS:
        msg = normalize_event(ev)
        if msg:
            q.put(msg)
            save_message(conn, msg)

    thread_id = "C1-1"
    rows = thread_messages(conn, thread_id)
    rules = SqliteRules(conn)
    ctx = build_context([dict(r) for r in rows], thread_id, "C1")
    summary = observe(ctx, llm)
    result = judge_intervention(ctx, llm)
    decision = decide(rules, "C1", thread_id, result)
    print(f"summary={summary}")
    print(f"decide act={decision.action} reason={decision.reason} "
          f"conf={result.confidence:.2f} impact={result.impact:.2f}")
    if decision.should_act:
        handoff = make_handoff(ctx, summary)
        record(rules, thread_id, result, decision.action)
        post_message("C1", thread_id, handoff, decision.action)
    else:
        print("silent: 介入なし")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", default=True)
    ap.add_argument("--demo", action="store_true")
    run(dry_run=True)
