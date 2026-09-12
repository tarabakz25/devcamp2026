"""Store: SQLiteローカル / Postgres本番の薄い抽象化。MVPはsqlite3のみ実装。"""
from __future__ import annotations

import json
import os
import sqlite3
import time
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
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    _ensure_columns(conn)
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


def _ensure_columns(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(stakeholders)")}
    if "avatar" not in cols:
        conn.execute(
            "ALTER TABLE stakeholders ADD COLUMN avatar TEXT DEFAULT ''"
        )
        conn.commit()
    profile_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(stakeholder_profiles)")
    }
    if "source" not in profile_cols:
        conn.execute(
            "ALTER TABLE stakeholder_profiles "
            "ADD COLUMN source TEXT NOT NULL DEFAULT 'slack'"
        )
        # Demo IDs use U-...; real Slack user IDs do not contain a hyphen.
        conn.execute(
            "UPDATE stakeholder_profiles SET source = 'demo' "
            "WHERE user_id LIKE 'U-%'"
        )
        conn.commit()
    if "channel_id" not in profile_cols:
        conn.execute(
            "ALTER TABLE stakeholder_profiles "
            "ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''"
        )
        conn.execute(
            "UPDATE stakeholder_profiles SET channel_id = 'demo' "
            "WHERE source = 'demo'"
        )
        conn.commit()
    profile_pk = [
        row[1]
        for row in sorted(
            conn.execute("PRAGMA table_info(stakeholder_profiles)"),
            key=lambda row: row[5],
        )
        if row[5]
    ]
    if profile_pk != ["source", "channel_id", "user_id"]:
        conn.executescript(
            "CREATE TABLE stakeholder_profiles_scoped ("
            "user_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT DEFAULT '', "
            "interests TEXT DEFAULT '', avatar TEXT DEFAULT '', "
            "source TEXT NOT NULL DEFAULT 'slack' CHECK (source IN ('slack','demo')), "
            "channel_id TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, "
            "PRIMARY KEY (source, channel_id, user_id));"
            "INSERT OR REPLACE INTO stakeholder_profiles_scoped "
            "(user_id,name,role,interests,avatar,source,channel_id,updated_at) "
            "SELECT user_id,name,role,interests,avatar,source,channel_id,updated_at "
            "FROM stakeholder_profiles;"
            "DROP TABLE stakeholder_profiles;"
            "ALTER TABLE stakeholder_profiles_scoped RENAME TO stakeholder_profiles;"
        )


def upsert_user(
    conn: sqlite3.Connection, user_id: str, name: str, role: str = ""
) -> None:
    conn.execute(
        "INSERT INTO users (id, name, role) VALUES (?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET "
        "name=excluded.name, "
        "role=CASE WHEN excluded.role != '' THEN excluded.role ELSE users.role END",
        (user_id, name, role),
    )
    conn.commit()


def upsert_stakeholder(
    conn: sqlite3.Connection,
    thread_id: str,
    user_id: str,
    user_name: str,
    role: str = "",
    interests: str = "",
    avatar: str = "",
) -> None:
    conn.execute(
        "INSERT INTO stakeholders "
        "(thread_id, user_id, user_name, role, interests, message_count, avatar) "
        "VALUES (?, ?, ?, ?, ?, 0, ?) "
        "ON CONFLICT(thread_id, user_id) DO UPDATE SET "
        "user_name=excluded.user_name, "
        "role=excluded.role, "
        "interests=excluded.interests, "
        "avatar=CASE WHEN excluded.avatar != '' THEN excluded.avatar "
        "ELSE stakeholders.avatar END",
        (thread_id, user_id, user_name, role, interests, avatar),
    )
    upsert_user(conn, user_id, user_name, role)


def delete_stakeholder(
    conn: sqlite3.Connection, thread_id: str, user_id: str
) -> bool:
    cur = conn.execute(
        "DELETE FROM stakeholders WHERE thread_id = ? AND user_id = ?",
        (thread_id, user_id),
    )
    conn.commit()
    return cur.rowcount > 0


def save_embedding(
    conn: sqlite3.Connection, kind: str, ref_id: str, embedding: list[float]
) -> None:
    conn.execute(
        "DELETE FROM embeddings WHERE kind = ? AND ref_id = ?",
        (kind, ref_id),
    )
    conn.execute(
        "INSERT INTO embeddings (kind, ref_id, embedding) VALUES (?, ?, ?)",
        (kind, ref_id, json.dumps(embedding)),
    )
    conn.commit()


def get_embedding(
    conn: sqlite3.Connection, kind: str, ref_id: str
) -> list[float] | None:
    row = conn.execute(
        "SELECT embedding FROM embeddings WHERE kind = ? AND ref_id = ?",
        (kind, ref_id),
    ).fetchone()
    if row and row["embedding"]:
        try:
            return json.loads(row["embedding"])
        except Exception:
            return None
    return None


def upsert_stakeholder_profile(
    conn: sqlite3.Connection,
    user_id: str,
    name: str,
    role: str = "",
    interests: str = "",
    avatar: str = "",
    embedding: list[float] | None = None,
    source: str = "slack",
    channel_id: str = "",
) -> None:
    if source not in {"slack", "demo"}:
        raise ValueError("stakeholder profile source must be slack or demo")
    now = str(time.time())
    conn.execute(
        "INSERT INTO stakeholder_profiles "
        "(user_id, name, role, interests, avatar, source, channel_id, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(source, channel_id, user_id) DO UPDATE SET "
        "name=excluded.name, "
        "role=CASE WHEN excluded.role != '' THEN excluded.role ELSE stakeholder_profiles.role END, "
        "interests=CASE WHEN excluded.interests != '' THEN excluded.interests ELSE stakeholder_profiles.interests END, "
        "avatar=CASE WHEN excluded.avatar != '' THEN excluded.avatar ELSE stakeholder_profiles.avatar END, "
        "source=excluded.source, "
        "channel_id=excluded.channel_id, "
        "updated_at=excluded.updated_at",
        (user_id, name, role, interests, avatar, source, channel_id, now),
    )
    upsert_user(conn, user_id, name, role)
    if embedding is not None:
        save_embedding(
            conn,
            "stakeholder",
            f"{source}:{channel_id}:{user_id}",
            embedding,
        )
    conn.commit()


def get_stakeholder_profiles(
    conn: sqlite3.Connection,
    source: str | None = None,
    channel_id: str | None = None,
) -> list[dict]:
    query = (
        "SELECT user_id, name, role, interests, avatar, source, channel_id, updated_at "
        "FROM stakeholder_profiles"
    )
    filters: list[str] = []
    params: list[str] = []
    if source:
        filters.append("source = ?")
        params.append(source)
    if channel_id:
        filters.append("channel_id = ?")
        params.append(channel_id)
    rows = conn.execute(
        query + (f" WHERE {' AND '.join(filters)}" if filters else ""),
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def load_stakeholder_catalog(
    conn: sqlite3.Connection,
    llm=None,
    *,
    source: str | None = None,
    channel_id: str | None = None,
) -> list:
    from ai_core import StakeholderProfile

    profiles = get_stakeholder_profiles(
        conn,
        source=source,
        channel_id=channel_id,
    )
    catalog: list[StakeholderProfile] = []
    for p in profiles:
        uid = p["user_id"]
        embedding_ref = f"{p['source']}:{p['channel_id']}:{uid}"
        emb = get_embedding(conn, "stakeholder", embedding_ref)
        profile = StakeholderProfile(
            user_id=uid,
            name=p["name"],
            role=p["role"],
            interests=p["interests"],
            avatar=p["avatar"],
            embedding=emb,
        )
        if profile.embedding is None and llm and hasattr(llm, "embed"):
            profile.embedding = llm.embed(profile.profile_text)
            save_embedding(conn, "stakeholder", embedding_ref, profile.embedding)
        catalog.append(profile)
    return catalog


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
