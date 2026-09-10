// D1 data layer. Mirrors apps/bot/src/{store,dashboard,demo_room}.py queries.
import { SCENARIO_MESSAGES, SEED_STAKEHOLDERS } from "./seed";

export const ROOMI_USER_ID = "U-ROOMI";
export const ROOMI_NAME = "Roomi";

export type Row = Record<string, string | number | boolean | null | undefined>;

export type Env = {
  DB: D1Database;
  LLM_PROVIDER?: string;
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  DEMO_CHANNEL_ID?: string;
  DEMO_THREAD_TS?: string;
  DEMO_CHANNEL_NAME?: string;
  DEMO_TITLE?: string;
};

export function demoIds(env: Env) {
  const channel = env.DEMO_CHANNEL_ID || "demo";
  const ts = env.DEMO_THREAD_TS || "live";
  return {
    channel,
    ts,
    threadId: `${channel}-${ts}`,
    name: env.DEMO_CHANNEL_NAME || "03_rooms_discussion",
    title: env.DEMO_TITLE || "朝食会場を決めよう",
  };
}

export async function ensureRoom(db: D1Database, ids: ReturnType<typeof demoIds>) {
  await db
    .batch([
      db.prepare("INSERT INTO channels (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(ids.channel, ids.name),
      db.prepare("INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)").bind(ids.threadId, ids.channel),
      db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(ROOMI_USER_ID, ROOMI_NAME, "AI"),
      db.prepare(
        "INSERT INTO intervention_rules (channel_id, min_confidence, min_impact, cooldown_sec, enabled) " +
          "SELECT ?, 0.7, 0.7, 600, 1 WHERE NOT EXISTS (SELECT 1 FROM intervention_rules)",
      ).bind("*"),
      db.prepare(
        "INSERT INTO intervention_rules (channel_id, min_confidence, min_impact, cooldown_sec, enabled) " +
          "SELECT ?, 0.55, 0.5, 20, 1 WHERE NOT EXISTS (SELECT 1 FROM intervention_rules WHERE channel_id = ?)",
      ).bind(ids.channel, ids.channel),
    ])
    .then((r) => r);
  const count = await db
    .prepare("SELECT COUNT(*) AS c FROM stakeholders WHERE thread_id = ?")
    .bind(ids.threadId)
    .first<{ c: number }>();
  if (!count || count.c === 0) {
    const stmts = SEED_STAKEHOLDERS.map((p) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO stakeholders (thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, ?, ?, 0)",
        )
        .bind(ids.threadId, p.user_id, p.user_name, p.role, p.interests, p.avatar || ""),
    );
    await db.batch(stmts);
  }
}

export async function listStakeholders(db: D1Database, threadId: string): Promise<Row[]> {
  const rows = await db
    .prepare("SELECT user_id, user_name, role, interests, avatar FROM stakeholders WHERE thread_id = ? ORDER BY id")
    .bind(threadId)
    .all<Row>();
  const counts = await db
    .prepare("SELECT user_id, COUNT(*) AS n FROM messages WHERE thread_id = ? GROUP BY user_id")
    .bind(threadId)
    .all<{ user_id: string; n: number }>();
  const byId = new Map((counts.results || []).map((r) => [String(r.user_id), Number(r.n)]));
  return (rows.results || []).map((r) => ({ ...r, messages: byId.get(String(r["user_id"])) || 0 }));
}

export async function listMessages(db: D1Database, threadId: string): Promise<Row[]> {
  const rows = await db
    .prepare(
      "SELECT m.id, m.user_id, m.text, m.ts, m.is_mention, " +
        "COALESCE(s.user_name, u.name, m.user_id) AS user_name, " +
        "COALESCE(NULLIF(s.role, ''), u.role, '') AS role, " +
        "COALESCE(s.avatar, '') AS avatar " +
        "FROM messages m LEFT JOIN stakeholders s ON s.thread_id = m.thread_id AND s.user_id = m.user_id " +
        "LEFT JOIN users u ON u.id = m.user_id WHERE m.thread_id = ? " +
        "ORDER BY CAST(m.ts AS REAL), m.ts",
    )
    .bind(threadId)
    .all<Row>();
  return (rows.results || []).map((r) => ({
    ...r,
    is_bot: r["user_id"] === ROOMI_USER_ID ? 1 : 0,
    user_name: r["user_id"] === ROOMI_USER_ID ? ROOMI_NAME : r["user_name"],
    role: r["user_id"] === ROOMI_USER_ID ? "AI" : r["role"],
  }));
}

export async function listAudit(db: D1Database, threadId: string, limit = 20) {
  const rows = await db
    .prepare("SELECT thread_id, reason, confidence, impact, action, created_at FROM interventions WHERE thread_id = ? ORDER BY id DESC LIMIT ?")
    .bind(threadId, limit)
    .all();
  return rows.results || [];
}

export async function playbackView(db: D1Database, threadId: string) {
  const row = await db
    .prepare("SELECT mode, idx, ai_count, last_intervene, last_reason FROM demo_playback WHERE thread_id = ?")
    .bind(threadId)
    .first<{ mode: string; idx: number; ai_count: number; last_intervene: number; last_reason: string }>();
  const mode = row?.mode || "idle";
  const idx = row?.idx || 0;
  let nextSpeaker: string | null = null;
  if (mode === "script" && idx < SCENARIO_MESSAGES.length) {
    const s = await db
      .prepare("SELECT user_name FROM stakeholders WHERE thread_id = ? AND user_id = ?")
      .bind(threadId, SCENARIO_MESSAGES[idx].user_id)
      .first<{ user_name: string }>();
    nextSpeaker = s?.user_name || SCENARIO_MESSAGES[idx].user_id;
  }
  return {
    mode,
    index: idx,
    total: SCENARIO_MESSAGES.length,
    ai_count: row?.ai_count || 0,
    interval_sec: 10,
    next_speaker: nextSpeaker,
    intervene: row?.last_intervene || 0,
    reason: row?.last_reason || "",
  };
}

export async function roomState(db: D1Database, ids: ReturnType<typeof demoIds>, llm: string) {
  await ensureRoom(db, ids);
  return {
    channel: { id: ids.channel, name: ids.name },
    thread_id: ids.threadId,
    title: ids.title,
    llm,
    stakeholders: await listStakeholders(db, ids.threadId),
    messages: await listMessages(db, ids.threadId),
    audit: await listAudit(db, ids.threadId),
    playback: await playbackView(db, ids.threadId),
  };
}

export async function timeline(db: D1Database, threadId: string) {
  const rows = await db
    .prepare("SELECT ts, user_id, text FROM messages WHERE thread_id = ? ORDER BY ts")
    .bind(threadId)
    .all();
  return rows.results || [];
}

export async function graph(db: D1Database, threadId: string) {
  const counts = await db
    .prepare("SELECT user_id, COUNT(*) AS n FROM messages WHERE thread_id = ? GROUP BY user_id")
    .bind(threadId)
    .all<{ user_id: string; n: number }>();
  const holders = await db
    .prepare("SELECT user_id, user_name, role, interests, avatar FROM stakeholders WHERE thread_id = ?")
    .bind(threadId)
    .all<Record<string, string>>();
  const holderById = new Map((holders.results || []).map((r) => [r.user_id, r]));
  const nodes = (counts.results || []).map((c) => {
    const h = holderById.get(c.user_id) || {};
    const agent = c.user_id === ROOMI_USER_ID;
    return {
      id: c.user_id,
      name: agent ? ROOMI_NAME : h.user_name || c.user_id,
      role: agent ? "AI" : h.role || "",
      interests: agent ? "議論に入って、止まっている一点を問う" : h.interests || "",
      avatar: agent ? "/roomi-logo.svg" : h.avatar || "",
      messages: c.n,
      kind: agent ? "agent" : "person",
    };
  });
  const msgs = await db
    .prepare("SELECT user_id FROM messages WHERE thread_id = ? ORDER BY CAST(ts AS REAL), ts")
    .bind(threadId)
    .all<{ user_id: string }>();
  const edges = new Map<string, Record<string, string | number | boolean>>();
  const seq = msgs.results || [];
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1].user_id;
    const b = seq[i].user_id;
    if (a === b) continue;
    const key = [a, b].sort().join("~");
    const prev = edges.get(key);
    if (prev) prev.weight = (prev.weight as number) + 1;
    else edges.set(key, { source: a, target: b, from_user: a, to_user: b, label: "会話", weight: 1, directed: false });
  }
  return { nodes, edges: [...edges.values()] };
}

export async function auditAll(db: D1Database, limit = 50) {
  const rows = await db
    .prepare("SELECT thread_id, reason, confidence, impact, action, created_at FROM interventions ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all();
  return rows.results || [];
}
