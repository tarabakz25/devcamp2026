"use client";

import { useState } from "react";
import CommunicationTopicGraph, {
  RELATIONSHIP_STATUS_META,
} from "./components/CommunicationTopicGraph";
import type {
  CommunicationGraphData,
  GraphSelection,
} from "./components/CommunicationTopicGraph";
import { COMMUNICATION_DEMO } from "./mocks/communicationDemo";
import type { AuditItem, TimelineItem } from "./mocks/communicationDemo";

const EMPTY_GRAPH: CommunicationGraphData = { nodes: [], edges: [] };

export default function Page() {
  const [threadId, setThreadId] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>(COMMUNICATION_DEMO.timeline);
  const [audit, setAudit] = useState<AuditItem[]>(COMMUNICATION_DEMO.audit);
  const [graph, setGraph] = useState<CommunicationGraphData>(COMMUNICATION_DEMO.graph);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [loaded, setLoaded] = useState(true);
  const [loadedThreadId, setLoadedThreadId] = useState(COMMUNICATION_DEMO.threadId);
  const [isMock, setIsMock] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topicLabel = isMock
    ? COMMUNICATION_DEMO.title
    : timeline[0]?.text || loadedThreadId;
  const topicAudit = audit.filter((item) => item.thread_id === loadedThreadId);
  const messageCount = graph.nodes.reduce((total, node) => total + node.messages, 0);

  function loadMock() {
    setTimeline(COMMUNICATION_DEMO.timeline);
    setAudit(COMMUNICATION_DEMO.audit);
    setGraph(COMMUNICATION_DEMO.graph);
    setSelection(null);
    setLoadedThreadId(COMMUNICATION_DEMO.threadId);
    setLoaded(true);
    setIsMock(true);
    setTimelineOpen(true);
    setError("");
  }

  async function load() {
    const requestedThreadId = threadId.trim();
    if (!requestedThreadId) {
      setError("トピックIDを入力してね。");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const encodedThreadId = encodeURIComponent(requestedThreadId);
      const [timelineResponse, graphResponse, auditResponse] = await Promise.all([
        fetch(`/api/threads/${encodedThreadId}/timeline`),
        fetch(`/api/threads/${encodedThreadId}/graph`),
        fetch("/api/audit"),
      ]);
      const [timelineData, graphData, auditData] = await Promise.all([
        timelineResponse.json(),
        graphResponse.json(),
        auditResponse.json(),
      ]);

      setTimeline(Array.isArray(timelineData) ? timelineData : []);
      setGraph(
        graphData &&
          Array.isArray(graphData.nodes) &&
          Array.isArray(graphData.edges)
          ? graphData
          : EMPTY_GRAPH
      );
      setAudit(Array.isArray(auditData) ? auditData : []);
      setSelection(null);
      setLoadedThreadId(requestedThreadId);
      setLoaded(true);
      setIsMock(false);
      setTimelineOpen(false);
    } catch {
      setError("読み込みに失敗したよ。Dashboard APIの接続を確認してね。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="roomi-app-shell">
      <header className="roomi-app-header">
        <div className="roomi-brand">
          <span className="roomi-brand-mark" aria-hidden="true">
            R
          </span>
          <div>
            <span>Roomi</span>
            <h1>Communication map</h1>
          </div>
        </div>
        <div className={`roomi-live-status${isMock ? " mock" : ""}`}>
          <span aria-hidden="true" />
          {isMock ? "Demo workspace" : "Live workspace"}
        </div>
      </header>

      <section className="roomi-workspace" aria-label="コミュニケーションマップ">
        <aside className="roomi-sidebar">
          <div className="roomi-sidebar-heading">
            <span className="roomi-kicker">Topic explorer</span>
            <h2>トピックをひらく</h2>
            <p>SlackスレッドのIDから、会話の中心と関係性を読み込む。</p>
          </div>

          <form
            className="roomi-topic-form"
            onSubmit={(event) => {
              event.preventDefault();
              load();
            }}
          >
            <label htmlFor="topic-id">トピックID</label>
            <div>
              <input
                id="topic-id"
                className="roomi-input"
                value={threadId}
                onChange={(event) => setThreadId(event.target.value)}
                placeholder="例: C1-1"
              />
              <button className="roomi-button" type="submit" disabled={loading}>
                {loading ? "…" : "表示"}
              </button>
            </div>
          </form>
          <div className="roomi-data-mode">
            <span className={isMock ? "mock" : "live"}>
              <i aria-hidden="true" />
              {isMock ? "Mock data" : "Dashboard API"}
            </span>
            <button type="button" onClick={loadMock}>
              サンプルを表示
            </button>
          </div>
          {error && <p className="roomi-error">{error}</p>}

          {loaded ? (
            <>
              <section className="roomi-sidebar-block roomi-topic-overview">
                <span className="roomi-sidebar-label">Current topic</span>
                <h3>{topicLabel}</h3>
                <span className="roomi-thread-id">{loadedThreadId}</span>
                <dl className="roomi-stats">
                  <div>
                    <dt>参加者</dt>
                    <dd>{graph.nodes.length}</dd>
                  </div>
                  <div>
                    <dt>関係</dt>
                    <dd>{graph.edges.length}</dd>
                  </div>
                  <div>
                    <dt>発言</dt>
                    <dd>{messageCount}</dd>
                  </div>
                </dl>
              </section>

              <section className="roomi-sidebar-block roomi-selection" aria-live="polite">
                <span className="roomi-sidebar-label">
                  {selection?.kind === "person" ? "Selected person" : "Selected topic"}
                </span>
                <h3>{selection?.label || topicLabel}</h3>
                <dl>
                  <div>
                    <dt>発言</dt>
                    <dd>{selection?.messages ?? messageCount}件</dd>
                  </div>
                  {selection?.kind === "person" && selection.role && (
                    <div>
                      <dt>役割</dt>
                      <dd>{selection.role}</dd>
                    </div>
                  )}
                  {selection?.kind === "person" && selection.interests && (
                    <div>
                      <dt>関心</dt>
                      <dd>{selection.interests}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <details
                className="roomi-disclosure"
                open={timelineOpen}
                onToggle={(event) => setTimelineOpen(event.currentTarget.open)}
              >
                <summary>
                  タイムライン <span>{timeline.length}</span>
                </summary>
                {timeline.length === 0 ? (
                  <p>まだメッセージがないよ。</p>
                ) : (
                  <ol>
                    {timeline.map((message, index) => (
                      <li key={`${message.ts}-${index}`}>
                        <span>
                          {message.user_name ||
                            graph.nodes.find((node) => node.id === message.user_id)?.name ||
                            message.user_id}
                        </span>
                        {message.text}
                      </li>
                    ))}
                  </ol>
                )}
              </details>

              <details className="roomi-disclosure">
                <summary>
                  AI介入 <span>{topicAudit.length}</span>
                </summary>
                {topicAudit.length === 0 ? (
                  <p>このトピックへの介入はまだないよ。</p>
                ) : (
                  <ul>
                    {topicAudit.slice(0, 3).map((item, index) => (
                      <li key={`${item.action}-${index}`}>
                        <strong>{item.action}</strong>
                        <span>{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </>
          ) : (
            <div className="roomi-sidebar-placeholder">
              <span aria-hidden="true">↗</span>
              <p>トピックを読み込むと、ここに詳細が出るよ。</p>
            </div>
          )}
        </aside>

        <section className="roomi-graph-stage" aria-labelledby="graph-title">
          <header className="roomi-stage-header">
            <div>
              <span className="roomi-kicker">Force-directed graph</span>
              <h2 id="graph-title">{loaded ? topicLabel : "Communication graph"}</h2>
            </div>
            {loaded && (
              <div className="roomi-stage-meta">
                {isMock && <span className="roomi-mock-pill">Mock scenario</span>}
                <span className="roomi-stage-count">
                  {graph.nodes.length} people · {graph.edges.length} links
                </span>
              </div>
            )}
          </header>

          {loaded ? (
            <CommunicationTopicGraph
              threadId={loadedThreadId}
              topicLabel={topicLabel}
              data={graph}
              onSelectionChange={setSelection}
            />
          ) : (
            <div className="roomi-stage-empty">
              <div className="roomi-empty-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <h2>会話のつながりを見てみよう</h2>
              <p>左のパネルからトピックIDを読み込んでね。</p>
            </div>
          )}

          <div className="roomi-legend" aria-label="グラフの凡例">
            <span>
              <i className="topic" aria-hidden="true" />トピック
            </span>
            <span>
              <i className="person" aria-hidden="true" />参加者
            </span>
            {Object.entries(RELATIONSHIP_STATUS_META).map(([status, meta]) => (
              <span key={status}>
                <i className={`relation ${status}`} aria-hidden="true" />
                {meta.label}
              </span>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
