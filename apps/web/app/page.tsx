"use client";
import { useState } from "react";

type TimelineItem = { ts: string; user_id: string; text: string };
type AuditItem = {
  thread_id: string;
  action: string;
  confidence: number;
  impact: string;
  reason: string;
};

export default function Page() {
  const [threadId, setThreadId] = useState("C1-1");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const t = await fetch(`/api/threads/${threadId}/timeline`).then((r) =>
      r.json().catch(() => [])
    );
    setTimeline(Array.isArray(t) ? t : []);
    const a = await fetch(`/api/audit`).then((r) => r.json().catch(() => []));
    setAudit(Array.isArray(a) ? a : []);
    setLoaded(true);
  }

  return (
    <main className="roomi-shell">
      <section className="roomi-hero">
        <span className="roomi-badge">Roomi control center</span>
        <h1>AIの判断を見える化する</h1>
        <p>Slackが主戦場。ここは判断・関係性・記憶の可視化だけやる。</p>
      </section>

      <section className="roomi-card">
        <h2>スレッド読み込み</h2>
        <div className="roomi-row">
          <input
            className="roomi-input"
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            placeholder="C1-1"
            aria-label="thread id"
          />
          <button className="roomi-button" onClick={load}>
            読み込み
          </button>
        </div>
      </section>

      <section className="roomi-card">
        <h2>議論タイムライン</h2>
        {timeline.length === 0 ? (
          <p className="roomi-empty">
            {loaded
              ? "まだメッセージがないよ。スレッドIDを変えて読み込んでみて。"
              : "スレッドIDを入れて読み込みを押してね。"}
          </p>
        ) : (
          <ul className="roomi-list">
            {timeline.map((m, i) => (
              <li key={i} className="roomi-item">
                <div className="roomi-item-meta">
                  {m.ts} ・ {m.user_id}
                </div>
                <div>{m.text}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="roomi-card">
        <h2>AI介入履歴</h2>
        {audit.length === 0 ? (
          <p className="roomi-empty">
            {loaded ? "介入履歴はまだないよ。" : "読み込むとここに出るよ。"}
          </p>
        ) : (
          <ul className="roomi-list">
            {audit.map((a, i) => (
              <li key={i} className="roomi-item">
                <div className="roomi-item-meta">
                  <span
                    className={`roomi-pill${a.impact === "high" ? " warn" : ""}`}
                  >
                    {a.action}
                  </span>
                  {a.thread_id} ・ conf {a.confidence} ・ impact {a.impact}
                </div>
                <div>{a.reason}</div>
              </li>
            ))}
          </ul>
        )}

        <h3>介入ルール設定</h3>
        <p className="roomi-note">
          MVPではDBの intervention_rules
          を直接編集。次でUI化する。
        </p>
      </section>
    </main>
  );
}
