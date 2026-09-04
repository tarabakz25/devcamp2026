"""Slack接続: Socket Modeで受信 -> Gateway -> Context -> Agents -> Policy ->投稿."""
from __future__ import annotations

import os
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
from gateway import normalize_event
from store import SqliteRules, connect, save_message, thread_messages


def load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def handle_message(payload: dict, conn, llm) -> None:
    msg = normalize_event(payload)
    if msg is None:
        return
    save_message(conn, msg)
    rules = SqliteRules(conn)
    rows = thread_messages(conn, msg.thread_id)
    ctx = build_context([dict(r) for r in rows], msg.thread_id, msg.channel_id)
    summary = observe(ctx, llm)
    result = judge_intervention(ctx, llm)
    decision = decide(rules, msg.channel_id, msg.thread_id, result)
    print(f"[{msg.channel_id}/{msg.thread_id}] {decision.action}: {decision.reason}")
    if not decision.should_act:
        return
    record(rules, msg.thread_id, result, decision.action)
    post_message(msg.channel_id, msg.thread_id, make_handoff(ctx, summary),
                 decision.action)


def main() -> None:
    load_dotenv()
    bot_token = os.environ.get("SLACK_BOT_TOKEN", "")
    app_token = os.environ.get("SLACK_APP_TOKEN", "")
    if not bot_token or not app_token:
        raise SystemExit("SLACK_BOT_TOKEN / SLACK_APP_TOKEN を .env に入れてね")

    from slack_bolt import App
    from slack_bolt.adapter.socket_mode import SocketModeHandler

    conn = connect()
    llm = get_llm(os.environ.get("LLM_PROVIDER", "dummy"))
    app = App(token=bot_token)

    @app.event("app_mention")
    def on_mention(body, ack):
        ack()
        handle_message(body, conn, llm)

    @app.event("message")
    def on_message(body, ack):
        ack()
        handle_message(body, conn, llm)

    print("comms-agent起動 (Socket Mode)。Ctrl-Cで止まるよ")
    SocketModeHandler(app, app_token).start()


if __name__ == "__main__":
    main()
