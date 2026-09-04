"use client";
import { useState } from "react";

type TimelineItem = { ts: string; user_id: string; text: string };

export default function Page() {
  const [threadId, setThreadId] = useState("C1-1");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [audit, setAudit] = useState<any[]>([]);

  async function load() {
    const t = await fetch(`/api/threads/${threadId}/timeline`).then((r) =>
      r.json().catch(() => [])
    );
    setTimeline(Array.isArray(t) ? t : []);
    const a = await fetch(`/api/audit`).then((r) => r.json().catch(() => []));
    setAudit(Array.isArray(a) ? a : []);
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Web Control Center (MVP)</h1>
      <p>Slackが主戦場。ここはAIの判断・関係性・記憶の可視化だけやる。</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={load}>読み込み</button>
      </div>
      <h2>議論タイムライン</h2>
      <ul>
        {timeline.map((m, i) => (
          <li key={i}>
            [{m.ts}] {m.user_id}: {m.text}
          </li>
        ))}
      </ul>
      <h2>AI介入履歴</h2>
      <ul>
        {audit.map((a, i) => (
          <li key={i}>
            {a.thread_id} / {a.action} (conf={a.confidence} impact={a.impact}):{" "}
            {a.reason}
          </li>
        ))}
      </ul>
      <h2>介入ルール設定</h2>
      <p>MVPではDBの intervention_rules を直接編集。次でUI化する。</p>
    </main>
  );
}
