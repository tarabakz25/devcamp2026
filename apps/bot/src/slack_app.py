"""Slack接続: Socket Modeで受信 -> Gateway -> Context -> Agents -> Policy ->投稿."""
from __future__ import annotations

import os
import sys
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent
AI_CORE = BOT_SRC.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import get_llm, resolve_llm_name
from actions import post_message
from mentions import to_slack_text
from pipeline import process_event, thread_people
from store import connect


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
    out = process_event(conn, llm, payload)
    if not out.accepted or out.message is None:
        return
    channel_id = out.message["channel_id"]
    thread_id = out.message["thread_id"]
    print(f"[{channel_id}/{thread_id}] {out.action}: {out.reason}")
    if not out.should_act:
        return
    text = to_slack_text(out.bot_text, thread_people(conn, thread_id))
    post_message(channel_id, thread_id, text, out.action)


def main() -> None:
    load_dotenv()
    bot_token = os.environ.get("SLACK_BOT_TOKEN", "")
    app_token = os.environ.get("SLACK_APP_TOKEN", "")
    if not bot_token or not app_token:
        raise SystemExit("SLACK_BOT_TOKEN / SLACK_APP_TOKEN を .env に入れてね")

    from slack_bolt import App
    from slack_bolt.adapter.socket_mode import SocketModeHandler

    conn = connect()
    llm = get_llm(resolve_llm_name())
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
