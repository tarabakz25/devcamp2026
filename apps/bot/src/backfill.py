"""稼働中Workspaceから履歴を取得し、ステークホルダーを抽出する。

使い方:
    python apps/bot/src/backfill.py --channel C123456 --limit 100

要 .env: SLACK_BOT_TOKEN, LLM_PROVIDER=openai, OPENAI_API_KEY
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent
AI_CORE = BOT_SRC.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import extract_stakeholders, get_llm  # noqa: E402
from gateway import normalize_event  # noqa: E402
from store import connect, save_message, upsert_stakeholder_profile  # noqa: E402


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


def api_call(fn, *args, tries: int = 5, **kwargs):
    """激遅・不安定回線向けリトライ付き呼び出し。"""
    import time

    last: Exception | None = None
    for i in range(tries):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001 - 全種別リトライ
            last = e
            wait = 5 * (i + 1)
            print(f"  retry {i + 1}/{tries} ({e}). {wait}秒待つ")
            time.sleep(wait)
    raise last  # type: ignore[misc]


def fetch_channel(client, channel_id: str, limit: int) -> list[dict]:
    msgs: list[dict] = []
    cursor = None
    while len(msgs) < limit:
        resp = api_call(
            client.conversations_history,
            channel=channel_id, limit=min(200, limit - len(msgs)),
            cursor=cursor,
        )
        batch = resp.get("messages", [])
        if not batch:
            break
        msgs.extend(batch)
        # スレッド返信も取得
        for m in batch:
            if m.get("reply_count"):
                rep = api_call(
                    client.conversations_replies,
                    channel=channel_id, ts=m["ts"], limit=200,
                )
                msgs.extend(
                    r for r in rep.get("messages", []) if r["ts"] != m["ts"]
                )
        cursor = resp.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break
    return msgs


def main() -> None:
    # 安全装置: 抽出中は投稿系を物理的に無効化
    os.environ["DRY_RUN"] = "true"
    print("SAFETY: DRY_RUN=true 固定 (投稿APIは呼ばない)")
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", required=True)
    ap.add_argument("--limit", type=int, default=100)
    args = ap.parse_args()

    from slack_sdk import WebClient

    # 回線が遅い環境向けにタイムアウトを長めに
    client = WebClient(token=os.environ["SLACK_BOT_TOKEN"], timeout=120)
    # Botが未参加なら参加 (channels:join)
    try:
        client.conversations_join(channel=args.channel)
    except Exception as e:
        print(f"join skip: {e}")

    raw = fetch_channel(client, args.channel, args.limit)
    print(f"取得: {len(raw)}件")

    conn = connect()
    names: dict[str, str] = {}

    def name_of(uid: str) -> str:
        if uid not in names:
            try:
                info = api_call(client.users_info, user=uid)["user"]
                names[uid] = info.get("real_name") or info.get("name", uid)
            except Exception:
                names[uid] = uid
        return names[uid]

    # 保存 (スレッドごとにグルーピング)
    by_thread: dict[str, list[dict]] = {}
    for r in raw:
        if r.get("subtype") in ("bot_message", "channel_join"):
            continue
        msg = normalize_event({
            "type": "message", "channel": args.channel,
            "user": r.get("user", "UNKNOWN"), "text": r.get("text", ""),
            "ts": r["ts"], "thread_ts": r.get("thread_ts"),
        })
        if msg is None:
            continue
        save_message(conn, msg)
        by_thread.setdefault(msg.thread_id, []).append({
            "user_id": msg.user_id, "text": msg.text,
        })

    llm = get_llm(os.environ.get("LLM_PROVIDER", "dummy"))
    print(f"スレッド数: {len(by_thread)} / LLM={llm.__class__.__name__}")

    user_profiles: dict[str, dict] = {}
    for tid, messages in sorted(by_thread.items()):
        holders = extract_stakeholders(messages, llm)
        for h in holders:
            conn.execute(
                "INSERT OR REPLACE INTO stakeholders "
                "(thread_id, user_id, user_name, role, interests, message_count) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (tid, h.user_id, name_of(h.user_id),
                 h.role, h.interests, h.messages),
            )
            existing = user_profiles.setdefault(h.user_id, {"role": "", "interests": set()})
            if h.role and not existing["role"]:
                existing["role"] = h.role
            if h.interests:
                existing["interests"].add(h.interests)
        conn.commit()
        print(f"\n[{tid}] {len(messages)}件")
        for h in holders:
            print(f"  - {name_of(h.user_id)} ({h.user_id}) "
                  f"発言{h.messages}: {h.role} / {h.interests}")

    print("\n組織全体のステークホルダーカタログを構築 & ベクトル化中 (RAG用)...")
    for uid, data in user_profiles.items():
        uname = name_of(uid)
        role = data["role"]
        interests_str = "、".join(sorted(data["interests"])) if data["interests"] else ""
        profile_text = f"氏名: {uname} / 役割: {role} / 担当・関心: {interests_str}"
        emb = llm.embed(profile_text) if hasattr(llm, "embed") else None
        upsert_stakeholder_profile(
            conn,
            user_id=uid,
            name=uname,
            role=role,
            interests=interests_str,
            embedding=emb,
        )
        print(f"  [カタログ登録] {uname} ({uid}): {role} - {interests_str}")


if __name__ == "__main__":
    main()
