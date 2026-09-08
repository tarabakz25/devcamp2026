"use client";

import { useState } from "react";
import CommunicationTopicGraph, {
  RELATIONSHIP_STATUS_META,
  getFallbackAvatarSvg,
} from "./components/CommunicationTopicGraph";
import type {
  CommunicationGraphData,
  GraphSelection,
} from "./components/CommunicationTopicGraph";
import { COMMUNICATION_DEMO } from "./mocks/communicationDemo";
import type { AuditItem, TimelineItem } from "./mocks/communicationDemo";

type MenuItem = "graph" | "members" | "ai" | "account";

export default function Page() {
  const [activeMenu, setActiveMenu] = useState<MenuItem>("graph");
  const [timeline] = useState<TimelineItem[]>(COMMUNICATION_DEMO.timeline);
  const [audit] = useState<AuditItem[]>(COMMUNICATION_DEMO.audit);
  const [graph] = useState<CommunicationGraphData>(COMMUNICATION_DEMO.graph);
  const [, setSelection] = useState<GraphSelection | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const topicLabel = COMMUNICATION_DEMO.title;
  const loadedThreadId = COMMUNICATION_DEMO.threadId;
  const topicAudit = audit.filter((item) => item.thread_id === loadedThreadId);
  const messageCount = graph.nodes.reduce((total, node) => total + node.messages, 0);

  function handleSelectMember(id: string) {
    setSelectedPersonId(id);
    setActiveMenu("graph");
  }

  return (
    <main className="roomi-app-shell">
      {/* サイドバー（Boxデザイン: フィールド上Popupとしてフロート表示） */}
      <aside className="roomi-sidebar-nav" aria-label="ナビゲーション">
        {/* 上部: workspace名 */}
        <div className="roomi-workspace-header">
          <div className="roomi-workspace-logo" aria-hidden="true">
            <span>R</span>
          </div>
          <div className="roomi-workspace-info">
            <span className="roomi-workspace-title">Roomi Workspace</span>
            <span className="roomi-workspace-meta">DevCamp 2026</span>
          </div>
        </div>

        {/* メニューアイテム: グラフ、メンバー、AI、アカウント */}
        <nav className="roomi-menu-list" aria-label="メインメニュー">
          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "graph" ? " active" : ""}`}
            onClick={() => setActiveMenu("graph")}
          >
            <svg
              className="roomi-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="roomi-menu-label">グラフ</span>
          </button>

          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "members" ? " active" : ""}`}
            onClick={() => setActiveMenu("members")}
          >
            <svg
              className="roomi-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="roomi-menu-label">メンバー</span>
            <span className="roomi-menu-badge">{graph.nodes.length}</span>
          </button>

          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "ai" ? " active" : ""}`}
            onClick={() => setActiveMenu("ai")}
          >
            <svg
              className="roomi-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="roomi-menu-label">AI</span>
            {topicAudit.length > 0 && (
              <span className="roomi-menu-badge ai">{topicAudit.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "account" ? " active" : ""}`}
            onClick={() => setActiveMenu("account")}
          >
            <svg
              className="roomi-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="roomi-menu-label">アカウント</span>
          </button>
        </nav>

        {/* メニュータブごとのサブコンテンツエリア */}
        <div className="roomi-sidebar-content">
          {activeMenu === "graph" && (
            <div className="roomi-pane-graph">
              {/* トピック概要 */}
              <div className="roomi-topic-box">
                <span className="roomi-pane-kicker">現在のトピック</span>
                <h3 className="roomi-topic-title">{topicLabel}</h3>
                <div className="roomi-stats-grid">
                  <div className="roomi-stat-chip">
                    <span className="chip-label">参加者</span>
                    <span className="chip-val">{graph.nodes.length}人</span>
                  </div>
                  <div className="roomi-stat-chip">
                    <span className="chip-label">関係</span>
                    <span className="chip-val">{graph.edges.length}本</span>
                  </div>
                  <div className="roomi-stat-chip">
                    <span className="chip-label">発言</span>
                    <span className="chip-val">{messageCount}件</span>
                  </div>
                </div>
              </div>

              {/* タイムライン: Boxに入れずそのまま下に表示 (縦上限はサイドバーのサイズ) */}
              <div className="roomi-timeline-section">
                <div className="roomi-timeline-header">
                  <span className="roomi-pane-kicker">タイムライン</span>
                  <span className="count-tag">{timeline.length}件</span>
                </div>
                <div className="roomi-timeline-list">
                  {timeline.map((msg, idx) => (
                    <div key={idx} className="roomi-timeline-item">
                      <div className="timeline-item-meta">
                        <span className="user-name">
                          {msg.user_name ||
                            graph.nodes.find((n) => n.id === msg.user_id)?.name ||
                            msg.user_id}
                        </span>
                        {msg.ts && <span className="timeline-ts">{msg.ts}</span>}
                      </div>
                      <p className="msg-text">{msg.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeMenu === "members" && (
            <div className="roomi-pane-members">
              <span className="roomi-pane-kicker">参加メンバー一覧</span>
              <p className="roomi-pane-hint">
                メンバーをクリックするとグラフ上で位置を確認できます
              </p>
              <div className="roomi-member-list">
                {graph.nodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className={`roomi-member-card${selectedPersonId === node.id ? " selected" : ""}`}
                    onClick={() => handleSelectMember(node.id)}
                  >
                    <img
                      className="member-avatar"
                      src={node.avatar || getFallbackAvatarSvg(node.name || node.id, node.id)}
                      alt={node.name || node.id}
                    />
                    <div className="member-info">
                      <div className="member-name-row">
                        <span className="member-name">{node.name || node.id}</span>
                        <span className="member-count">{node.messages}発言</span>
                      </div>
                      {node.role && <span className="member-role">{node.role}</span>}
                      {node.interests && (
                        <span className="member-interests">{node.interests}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeMenu === "ai" && (
            <div className="roomi-pane-ai">
              <span className="roomi-pane-kicker">AI 介入ログ</span>
              {topicAudit.length === 0 ? (
                <p className="roomi-empty-text">現在トピックへのAI介入はありません</p>
              ) : (
                <div className="roomi-audit-list">
                  {topicAudit.map((item, idx) => (
                    <div key={idx} className="roomi-audit-card">
                      <div className="audit-card-header">
                        <span className="audit-action-tag">{item.action}</span>
                        <span className="audit-conf">
                          確信度 {Math.round(item.confidence * 100)}%
                        </span>
                      </div>
                      <p className="audit-reason">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeMenu === "account" && (
            <div className="roomi-pane-account">
              <span className="roomi-pane-kicker">ユーザーアカウント</span>
              <div className="account-profile-box">
                <img
                  className="account-avatar"
                  src={
                    graph.nodes[0]?.avatar ||
                    getFallbackAvatarSvg("葵", "U-AOI")
                  }
                  alt="Current User"
                />
                <h4 className="account-name">{graph.nodes[0]?.name || "葵"}</h4>
                <span className="account-role-tag">
                  {graph.nodes[0]?.role || "プロダクトマネージャー"}
                </span>
                <span className="account-email">aoi@roomi.workspace.local</span>
              </div>
              <div className="account-details">
                <div className="detail-item">
                  <span className="detail-key">ワークスペース</span>
                  <span className="detail-val">Roomi DevCamp 2026</span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">権限</span>
                  <span className="detail-val">管理者 (Admin)</span>
                </div>
                <div className="detail-item">
                  <span className="detail-key">ステータス</span>
                  <span className="detail-val status-online">● オンライン</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* サイドバー下部 */}
        <div className="roomi-sidebar-footer">
          <div className="roomi-footer-user">
            <img
              src={
                graph.nodes[0]?.avatar ||
                getFallbackAvatarSvg("葵", "U-AOI")
              }
              alt="User"
              className="footer-avatar"
            />
            <div className="footer-user-meta">
              <span className="footer-user-name">
                {graph.nodes[0]?.name || "葵"}
              </span>
              <span className="footer-user-role">
                {graph.nodes[0]?.role || "PM"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* D3フィールド: 画面にフルで表示させる */}
      <section className="roomi-graph-stage" aria-label="コミュニケーショングラフ">
        {/* 上部フロートトピックタイトル (サイドバーの右側に配置) */}
        <div className="roomi-floating-header">
          <div className="floating-title-box">
            <span className="floating-kicker">トピック</span>
            <h2 className="floating-title">{topicLabel}</h2>
          </div>
          <div className="floating-badges">
            <span className="mock-badge">デモ</span>
            <span className="floating-stats">
              {graph.nodes.length} 人のメンバー · {graph.edges.length} の関係性
            </span>
          </div>
        </div>

        {/* D3グラフコンポーネント（フルスクリーン描画） */}
        <CommunicationTopicGraph
          threadId={loadedThreadId}
          topicLabel={topicLabel}
          data={graph}
          onSelectionChange={setSelection}
          activePersonId={selectedPersonId}
        />

        {/* グラフの凡例 */}
        <div className="roomi-legend" aria-label="グラフの凡例">
          <span>
            <i className="topic" aria-hidden="true" />トピック
          </span>
          <span>
            <i className="person" aria-hidden="true" />メンバー
          </span>
          {Object.entries(RELATIONSHIP_STATUS_META).map(([status, meta]) => (
            <span key={status}>
              <i className={`relation ${status}`} aria-hidden="true" />
              {meta.label}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
