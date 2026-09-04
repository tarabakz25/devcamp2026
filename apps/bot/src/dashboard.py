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
    nodes = [{"id": r["user_id"], "messages": r["n"]} for r in cur.fetchall()]
    rel = conn.execute(
        "SELECT from_user, to_user, label FROM relations WHERE thread_id = ?",
        (thread_id,),
    )
    return {"nodes": nodes, "edges": [dict(r) for r in rel.fetchall()]}


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
