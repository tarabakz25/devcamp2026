"""Slack Bot Action: reply / mention / handoff。DRY_RUNがデフォルト。"""
from __future__ import annotations

import os


def post_message(channel_id: str, thread_id: str, text: str, action: str) -> dict:
    dry = os.environ.get("DRY_RUN", "true").lower() != "false"
    if dry:
        print(f"[DRY_RUN:{action}] #{channel_id} {thread_id}\n{text}")
        return {"ok": True, "dry_run": True, "action": action}
    from slack_sdk import WebClient

    client = WebClient(token=os.environ["SLACK_BOT_TOKEN"])
    # thread_idは"{channel}-{ts}"形式なのでts部分だけ取り出す
    thread_ts = thread_id.split("-", 1)[-1] if "-" in thread_id else None
    resp = client.chat_postMessage(
        channel=channel_id, text=text,
        thread_ts=thread_ts, reply_broadcast=(action == "mention"),
    )
    return {"ok": True, "dry_run": False, "action": action, "ts": resp["ts"]}
