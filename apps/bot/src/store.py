"""Store: SQLiteローカル / Postgres本番の薄い抽象化。MVPはsqlite3のみ実装。"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


def connect(db_path: str | None = None) -> sqlite3.Connection:
    database_url = os.environ.get("DATABASE_URL", "")
    if database_url.startswith("postgres"):
        raise RuntimeError(
            "Postgres path needs psycopg (requirements.txt). "
            "Set DATABASE_URL empty for local SQLite MVP."
        )
    db_path = db_path or os.environ.get("SQLITE_PATH", ":memory:")
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    # デフォルトルール
    cur = conn.execute("SELECT COUNT(*) AS c FROM intervention_rules")
    if cur.fetchone()["c"] == 0:
        conn.execute(
            "INSERT INTO intervention_rules "
            "(channel_id, min_confidence, min_impact, cooldown_sec, enabled) "
            "VALUES ('*', 0.7, 0.7, 600, 1)"
        )
        conn.commit()
    return conn


def save_message(conn: sqlite3.Connection, msg) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO channels (id, name) VALUES (?, ?)",
        (msg.channel_id, msg.channel_id),
    )
    conn.execute(
        "INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)",
        (msg.user_id, msg.user_id),
    )
    conn.execute(
        "INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)",
        (msg.thread_id, msg.channel_id),
    )
    conn.execute(
        "INSERT OR IGNORE INTO messages "
        "(id, thread_id, channel_id, user_id, text, ts, is_mention) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            msg.message_id,
            msg.thread_id,
            msg.channel_id,
            msg.user_id,
            msg.text,
            msg.ts,
            1 if msg.is_mention else 0,
        ),
    )
    conn.commit()


def thread_messages(conn: sqlite3.Connection, thread_id: str) -> list[sqlite3.Row]:
    cur = conn.execute(
        "SELECT * FROM messages WHERE thread_id = ? ORDER BY ts",
        (thread_id,),
    )
    return list(cur.fetchall())


class SqliteRules:
    """ai-coreのRuleStoreをsqliteで実装するアダプタ。"""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get_rule(self, channel_id: str) -> dict:
        cur = self._conn.execute(
            "SELECT * FROM intervention_rules WHERE channel_id IN ('*', ?) "
            "ORDER BY CASE channel_id WHEN '*' THEN 1 ELSE 0 END LIMIT 1",
            (channel_id,),
        )
        return dict(cur.fetchone())

    def last_intervention_ts(self, thread_id: str) -> float:
        cur = self._conn.execute(
            "SELECT created_at FROM interventions WHERE thread_id = ? "
            "ORDER BY id DESC LIMIT 1",
            (thread_id,),
        )
        row = cur.fetchone()
        return float(row["created_at"]) if row else 0.0

    def save_intervention(
        self, thread_id: str, reason: str,
        confidence: float, impact: float, action: str, created_at: str,
    ) -> None:
        self._conn.execute(
            "INSERT INTO interventions "
            "(thread_id, reason, confidence, impact, action, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (thread_id, reason, confidence, impact, action, created_at),
        )
        self._conn.commit()
