// Roomi Worker: Hono + D1. Replaces apps/bot/src/dash_server.py for Cloudflare.
// Slack Socket Mode (long-lived WS) can't run on Workers; /api/slack/events
// accepts Slack Events API (HTTP) instead.
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  auditAll,
  demoIds,
  ensureRoom,
  Env,
  graph,
  listAudit,
  listMessages,
  listStakeholders,
  playbackView,
  ROOMI_NAME,
  ROOMI_USER_ID,
  roomState,
  Row,
  timeline,
} from "./db";
import { judge, resolveLlmName, roomiLine, stakeholderReply } from "./llm";
import { SCENARIO_MESSAGES } from "./seed";

const app = new Hono<{ Bindings: Env }>();
app.use("/*", cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"], allowMethods: ["*"], allowHeaders: ["*"] }));

function llmName(env: Env): string {
  return resolveLlmName(env as unknown as Record<string, string | undefined>);
}

async function saveMessage(
  db: D1Database,
  ids: ReturnType<typeof demoIds>,
  userId: string,
  text: string,
): Promise<Row> {
  const ts = String(Date.now() / 1000);
  const id = `${ids.channel}-${ts}-${Math.floor(Math.random() * 1e6)}`;
  const holder = await db
    .prepare("SELECT user_name, role FROM stakeholders WHERE thread_id = ? AND user_id = ?")
    .bind(ids.threadId, userId)
    .first<{ user_name: string; role: string }>();
  const mention = /@roomi/i.test(text) ? 1 : 0;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO channels (id, name) VALUES (?, ?)").bind(ids.channel, ids.name),
    db.prepare("INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)").bind(ids.threadId, ids.channel),
    db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)").bind(userId, holder?.user_name || userId),
    db.prepare(
      "INSERT OR IGNORE INTO messages (id, thread_id, channel_id, user_id, text, ts, is_mention) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, ids.threadId, ids.channel, userId, text, ts, mention),
  ]);
  return {
    id,
    user_id: userId,
    user_name: userId === ROOMI_USER_ID ? ROOMI_NAME : holder?.user_name || userId,
    role: userId === ROOMI_USER_ID ? "AI" : holder?.role || "",
    avatar: "",
    text,
    ts,
    is_bot: userId === ROOMI_USER_ID ? 1 : 0,
  };
}

async function maybeIntervene(
  db: D1Database,
  env: Env,
  ids: ReturnType<typeof demoIds>,
  provider: string,
  force = false,
): Promise<{ intervention: Row; bot_message: Row | null }> {
  const msgs = await listMessages(db, ids.threadId);
  const summary = msgs
    .slice(-10)
    .map((m) => `${String(m["user_name"])}: ${String(m["text"])}`)
    .join("\n");
  const j = await judge(env as unknown as Record<string, string | undefined>, provider, summary);
  const should = force || j.yes;
  if (!should) {
    return {
      intervention: { should_act: false, intervene: 0, action: "silent", reason: j.reason, confidence: 0, impact: 0, summary: "", text: "" },
      bot_message: null,
    };
  }
  const people = (await listStakeholders(db, ids.threadId)).map((p) => ({
    name: String(p["user_name"] || ""),
    user_id: String(p["user_id"] || ""),
    role: String(p["role"] || ""),
    interests: String(p["interests"] || ""),
  }));
  const text = await roomiLine(env as unknown as Record<string, string | undefined>, provider, summary, people, j.reason);
  const bot = await saveMessage(db, ids, ROOMI_USER_ID, text);
  await db
    .prepare(
      "INSERT INTO interventions (thread_id, reason, confidence, impact, action, created_at) VALUES (?, ?, 1.0, 1.0, 'reply', datetime('now'))",
    )
    .bind(ids.threadId, j.reason)
    .run();
  return {
    intervention: { should_act: true, intervene: 1, action: "reply", reason: j.reason, confidence: 1, impact: 1, summary, text },
    bot_message: bot,
  };
}

app.get("/health", (c) => c.json({ ok: true, llm: llmName(c.env) }));

app.get("/api/threads/:id/timeline", async (c) => {
  const rows = await timeline(c.env.DB, c.req.param("id"));
  return c.json(rows);
});

app.get("/api/threads/:id/graph", async (c) => {
  const data = await graph(c.env.DB, c.req.param("id"));
  return c.json(data);
});

app.get("/api/audit", async (c) => {
  return c.json(await auditAll(c.env.DB));
});

app.get("/api/demo", async (c) => {
  const ids = demoIds(c.env);
  return c.json(await roomState(c.env.DB, ids, llmName(c.env)));
});

app.post("/api/demo/messages", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { user_id?: string; text?: string };
  const userId = String(body.user_id || "");
  const text = String(body.text || "").trim();
  if (!text) return c.json({ detail: "メッセージが空" }, 400);
  if (userId === ROOMI_USER_ID) return c.json({ detail: "Roomiとしては発言できない" }, 400);
  const ids = demoIds(c.env);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids);
  const message = await saveMessage(c.env.DB, ids, userId, text);
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider);
  return c.json({
    message,
    bot_message,
    intervention,
    channel: { id: ids.channel, name: ids.name },
    title: ids.title,
    thread_id: ids.threadId,
    messages: await listMessages(c.env.DB, ids.threadId),
    audit: await listAudit(c.env.DB, ids.threadId),
    stakeholders: await listStakeholders(c.env.DB, ids.threadId),
    playback: await playbackView(c.env.DB, ids.threadId),
  });
});

app.post("/api/demo/stakeholders", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; role?: string; interests?: string; avatar?: string };
  const name = String(body.name || "").trim();
  if (!name) return c.json({ detail: "名前が必要" }, 400);
  const ids = demoIds(c.env);
  await ensureRoom(c.env.DB, ids);
  const userId = `U-${Date.now().toString(36).toUpperCase()}`;
  await c.env.DB.prepare(
    "INSERT INTO stakeholders (thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, ?, ?, 0)",
  )
    .bind(ids.threadId, userId, name, String(body.role || ""), String(body.interests || ""), String(body.avatar || ""))
    .run();
  return c.json({ user_id: userId, user_name: name });
});

app.delete("/api/demo/stakeholders/:userId", async (c) => {
  const ids = demoIds(c.env);
  const r = await c.env.DB.prepare("DELETE FROM stakeholders WHERE thread_id = ? AND user_id = ?")
    .bind(ids.threadId, c.req.param("userId"))
    .run();
  if (!r.meta.changes) return c.json({ detail: "関係者が見つからない" }, 404);
  return c.json({ ok: true, user_id: c.req.param("userId") });
});

app.post("/api/demo/intervene", async (c) => {
  const ids = demoIds(c.env);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids);
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider, true);
  return c.json({
    message: null,
    bot_message,
    intervention,
    channel: { id: ids.channel, name: ids.name },
    title: ids.title,
    thread_id: ids.threadId,
    messages: await listMessages(c.env.DB, ids.threadId),
    audit: await listAudit(c.env.DB, ids.threadId),
    stakeholders: await listStakeholders(c.env.DB, ids.threadId),
    playback: await playbackView(c.env.DB, ids.threadId),
  });
});

app.post("/api/demo/scenario", async (c) => {
  const ids = demoIds(c.env);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids);
  for (const m of SCENARIO_MESSAGES) {
    await saveMessage(c.env.DB, ids, m.user_id, m.text);
  }
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider, true);
  return c.json({ ok: true, loaded: SCENARIO_MESSAGES.length, intervention, bot_message });
});

app.post("/api/demo/play/start", async (c) => {
  const ids = demoIds(c.env);
  await ensureRoom(c.env.DB, ids);
  await c.env.DB.prepare(
    "INSERT INTO demo_playback (thread_id, mode, idx, ai_count, updated_at) VALUES (?, 'script', 0, 0, datetime('now')) " +
      "ON CONFLICT(thread_id) DO UPDATE SET mode='script', idx=0, updated_at=datetime('now')",
  )
    .bind(ids.threadId)
    .run();
  return c.json(await roomState(c.env.DB, ids, llmName(c.env)));
});

app.post("/api/demo/play/tick", async (c) => {
  const ids = demoIds(c.env);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids);
  const cur = await c.env.DB.prepare("SELECT mode, idx, ai_count FROM demo_playback WHERE thread_id = ?")
    .bind(ids.threadId)
    .first<{ mode: string; idx: number; ai_count: number }>();
  if (!cur || cur.mode !== "script") return c.json({ detail: "再生中じゃない" }, 400);
  if (cur.idx >= SCENARIO_MESSAGES.length) {
    await c.env.DB.prepare("UPDATE demo_playback SET mode='done', updated_at=datetime('now') WHERE thread_id = ?")
      .bind(ids.threadId)
      .run();
    return c.json(await roomState(c.env.DB, ids, provider));
  }
  const next = SCENARIO_MESSAGES[cur.idx];
  const message = await saveMessage(c.env.DB, ids, next.user_id, next.text);
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider);
  await c.env.DB.prepare("UPDATE demo_playback SET idx=idx+1, last_intervene=?, last_reason=?, updated_at=datetime('now') WHERE thread_id = ?")
    .bind(intervention["intervene"] ? 1 : 0, String(intervention["reason"] || ""), ids.threadId)
    .run();
  // AI replies from other stakeholders after Roomi (simplified demo playback)
  if (bot_message) {
    const people = await listStakeholders(c.env.DB, ids.threadId);
    const others = people.filter((p) => String(p["user_id"]) !== next.user_id && String(p["user_id"]) !== ROOMI_USER_ID).slice(0, 1);
    for (const p of others) {
      await saveMessage(
        c.env.DB,
        ids,
        String(p["user_id"]),
        stakeholderReply(String(p["user_name"]), String(p["role"] || ""), String(p["interests"] || "")),
      );
    }
  }
  return c.json({
    message,
    bot_message,
    intervention,
    messages: await listMessages(c.env.DB, ids.threadId),
    audit: await listAudit(c.env.DB, ids.threadId),
    stakeholders: await listStakeholders(c.env.DB, ids.threadId),
    playback: await playbackView(c.env.DB, ids.threadId),
  });
});

app.post("/api/demo/play/stop", async (c) => {
  const ids = demoIds(c.env);
  await c.env.DB.prepare(
    "INSERT INTO demo_playback (thread_id, mode, updated_at) VALUES (?, 'stopped', datetime('now')) " +
      "ON CONFLICT(thread_id) DO UPDATE SET mode='stopped', updated_at=datetime('now')",
  )
    .bind(ids.threadId)
    .run();
  return c.json(await roomState(c.env.DB, ids, llmName(c.env)));
});

app.post("/api/demo/reset", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { keep_stakeholders?: boolean };
  const keep = body.keep_stakeholders ?? true;
  const ids = demoIds(c.env);
  await ensureRoom(c.env.DB, ids);
  await c.env.DB.prepare("DELETE FROM messages WHERE thread_id = ?").bind(ids.threadId).run();
  await c.env.DB.prepare("DELETE FROM interventions WHERE thread_id = ?").bind(ids.threadId).run();
  if (!keep) {
    await c.env.DB.prepare("DELETE FROM stakeholders WHERE thread_id = ?").bind(ids.threadId).run();
  }
  await c.env.DB.prepare("DELETE FROM demo_playback WHERE thread_id = ?").bind(ids.threadId).run();
  return c.json(await roomState(c.env.DB, ids, llmName(c.env)));
});

// Slack Events API (HTTP). Socket Mode is not available on Workers.
async function verifySlack(req: Request, secret: string): Promise<{ ok: boolean; body: string }> {
  const ts = req.headers.get("x-slack-request-timestamp") || "";
  const sig = req.headers.get("x-slack-signature") || "";
  if (!ts || !sig || !secret) return { ok: false, body: "" };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, body: "" };
  const body = await req.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const a = new TextEncoder().encode(`v0=${hex}`);
  const b = new TextEncoder().encode(sig);
  if (a.length !== b.length) return { ok: false, body };
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return { ok: diff === 0, body };
}

app.post("/api/slack/events", async (c) => {
  const secret = c.env.SLACK_SIGNING_SECRET || "";
  const { ok, body } = await verifySlack(c.req.raw.clone(), secret);
  if (!ok) return c.json({ error: "bad signature" }, 401);
  const payload = JSON.parse(body || "{}") as { type?: string; challenge?: string; event?: { type?: string; user?: string; text?: string; channel?: string; ts?: string } };
  if (payload.type === "url_verification") return c.json({ challenge: payload.challenge });
  const ev = payload.event;
  if (!ev || (ev.type !== "app_mention" && ev.type !== "message")) return c.json({ ok: true });
  const token = c.env.SLACK_BOT_TOKEN;
  if (!token) return c.json({ ok: true, note: "SLACK_BOT_TOKEN unset, skipped" });
  const ids = demoIds(c.env);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids);
  await saveMessage(c.env.DB, ids, ev.user || "U-UNKNOWN", ev.text || "");
  const { intervention } = await maybeIntervene(c.env.DB, c.env, ids, provider);
  if (intervention["should_act"] && intervention["text"]) {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: ev.channel, text: String(intervention["text"]), thread_ts: ev.ts }),
    });
  }
  return c.json({ ok: true });
});

export default app;
