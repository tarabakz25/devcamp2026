-- MVP Data Model: Postgres本番 / SQLiteローカル両対応
-- pgvectorは本番のみ: CREATE EXTENSION vector;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  summary TEXT DEFAULT '',
  status TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TEXT NOT NULL,
  is_mention INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  text TEXT NOT NULL,
  decided_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  embedding TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stakeholders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT DEFAULT '',
  role TEXT DEFAULT '',
  interests TEXT DEFAULT '',
  message_count INTEGER DEFAULT 0,
  UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS interventions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence REAL NOT NULL,
  impact REAL NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intervention_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL DEFAULT '*',
  min_confidence REAL NOT NULL DEFAULT 0.7,
  min_impact REAL NOT NULL DEFAULT 0.7,
  cooldown_sec INTEGER NOT NULL DEFAULT 600,
  enabled INTEGER NOT NULL DEFAULT 1
);
