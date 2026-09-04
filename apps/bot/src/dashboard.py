"""Dashboard API: Graph / Timeline / Audit を返す薄い層。"""
from __future__ import annotations

import sqlite3


def timeline(conn: sqlite3.Connection, thread_id: str) -> list[dict]:
    cur = conn.execute(
        "SELECT ts, user_id, text FROM messages WHERE thread_id = ? ORDER BY ts",
        (thread_id,),
    )
    return [dict(r) for r in cur.fetchall()]


def stakeholder_graph(conn: sqlite3.Connection, thread_id: str) -> dict:
    cur = conn.execute(
        "SELECT user_id, COUNT(*) AS n FROM messages WHERE thread_id = ? GROUP BY user_id",
        (thread_id,),
    )
    counts = {r["user_id"]: r["n"] for r in cur.fetchall()}
    stakeholder_rows = conn.execute(
        "SELECT user_id, user_name, role, interests FROM stakeholders "
        "WHERE thread_id = ?",
        (thread_id,),
    )
    stakeholders = {r["user_id"]: dict(r) for r in stakeholder_rows.fetchall()}
    user_rows = conn.execute(
        "SELECT id, name, role FROM users WHERE id IN "
        "(SELECT user_id FROM messages WHERE thread_id = ?)",
        (thread_id,),
    )
    users = {r["id"]: dict(r) for r in user_rows.fetchall()}
    nodes = []
    for user_id, message_count in counts.items():
        holder = stakeholders.get(user_id, {})
        user = users.get(user_id, {})
        nodes.append({
            "id": user_id,
            "name": holder.get("user_name") or user.get("name") or user_id,
            "role": holder.get("role") or user.get("role") or "",
            "interests": holder.get("interests") or "",
            "messages": message_count,
        })

    # 明示的な関係に加えて、連続する発言者を会話リンクとして集計する。
    # backfill直後でrelationsが空でもforce-linkを成立させられる。
    edges: dict[tuple[str, str], dict] = {}
    rel = conn.execute(
        "SELECT from_user, to_user, label FROM relations WHERE thread_id = ?",
        (thread_id,),
    )
    node_ids = set(counts)
    for row in rel.fetchall():
        source, target = row["from_user"], row["to_user"]
        if source not in node_ids or target not in node_ids or source == target:
            continue
        key = tuple(sorted((source, target)))
        edges[key] = {
            "source": source,
            "target": target,
            "from_user": source,
            "to_user": target,
            "label": row["label"],
            "weight": 1,
            "directed": True,
        }

    message_rows = conn.execute(
        "SELECT user_id FROM messages WHERE thread_id = ? "
        "ORDER BY CAST(ts AS REAL), ts",
        (thread_id,),
    ).fetchall()
    for previous, current in zip(message_rows, message_rows[1:]):
        source, target = previous["user_id"], current["user_id"]
        if source == target:
            continue
        key = tuple(sorted((source, target)))
        if key in edges:
            edges[key]["weight"] += 1
            continue
        edges[key] = {
            "source": key[0],
            "target": key[1],
            "from_user": key[0],
            "to_user": key[1],
            "label": "会話",
            "weight": 1,
            "directed": False,
        }

    return {"nodes": nodes, "edges": list(edges.values())}


def audit_log(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    cur = conn.execute(
        "SELECT thread_id, reason, confidence, impact, action, created_at "
        "FROM interventions ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [dict(r) for r in cur.fetchall()]


def build_fastapi_app(db_path: str = ":memory:"):
    """FastAPIがあればWeb用APIサーバを組み立てる。なければNone。"""
    try:
        from fastapi import FastAPI
    except ImportError:
        return None
    from .store import connect

    app = FastAPI(title="AI SlackBot Dashboard API")

    @app.get("/api/threads/{thread_id}/timeline")
    def get_timeline(thread_id: str):
        with connect(db_path) as conn:
            return timeline(conn, thread_id)

    @app.get("/api/threads/{thread_id}/graph")
    def get_graph(thread_id: str):
        with connect(db_path) as conn:
            return stakeholder_graph(conn, thread_id)

    @app.get("/api/audit")
    def get_audit():
        with connect(db_path) as conn:
            return audit_log(conn)

    return app
