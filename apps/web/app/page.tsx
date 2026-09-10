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
import type { AuditItem } from "./mocks/communicationDemo";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import GoogleIcon from "./components/GoogleIcon";
import MaterialIcon from "./components/MaterialIcon";
import RoomiLogo from "./components/RoomiLogo";

type MenuItem = "top" | "members" | "agent" | "account";

export default function Page() {
  const { data: session, isPending: isSessionPending } = useSession();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeMenu, setActiveMenu] = useState<MenuItem>("top");
  const [audit] = useState<AuditItem[]>(COMMUNICATION_DEMO.audit);
  const [graph] = useState<CommunicationGraphData>(COMMUNICATION_DEMO.graph);
  const [, setSelection] = useState<GraphSelection | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      await signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
    } catch (err: any) {
      console.error("Google sign in failed:", err);
      setAuthError(err?.message || "Google認証の開始に失敗しました。");
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (err: any) {
      console.error("Sign out failed:", err);
    }
  };

  const topicLabel = COMMUNICATION_DEMO.title;
  const loadedThreadId = COMMUNICATION_DEMO.threadId;
  const topicAudit = audit.filter((item) => item.thread_id === loadedThreadId);
  function handleSelectMember(id: string) {
    setSelectedPersonId(id);
    setActiveMenu("top");
  }

  return (
    <main className="roomi-app-shell">
      {/* サイドバー（Boxデザイン: フィールド上Popupとしてフロート表示） */}
      <aside className="roomi-sidebar-nav" aria-label="ナビゲーション">
        <div className="roomi-workspace-header">
          <div className="roomi-workspace-logo" aria-hidden="true">
            <RoomiLogo size={44} />
          </div>
          <div className="roomi-workspace-info">
            <span className="roomi-workspace-title">Roomi</span>
            <span className="roomi-workspace-meta">神山まるごと高専</span>
          </div>
        </div>

        <nav className="roomi-menu-list" aria-label="メインメニュー">
          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "top" ? " active" : ""}`}
            onClick={() => setActiveMenu("top")}
          >
            <MaterialIcon name="home" className="roomi-menu-icon" filled={activeMenu === "top"} />
            <span className="roomi-menu-label">トップ</span>
          </button>
          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "members" ? " active" : ""}`}
            onClick={() => setActiveMenu("members")}
          >
            <MaterialIcon name="group" className="roomi-menu-icon" filled={activeMenu === "members"} />
            <span className="roomi-menu-label">メンバーリスト</span>
          </button>
          <button
            type="button"
            className="roomi-menu-item"
            onClick={() => router.push("/demo")}
          >
            <MaterialIcon name="forum" className="roomi-menu-icon" />
            <span className="roomi-menu-label">ディスカッション</span>
          </button>
          <button
            type="button"
            className={`roomi-menu-item${activeMenu === "agent" ? " active" : ""}`}
            onClick={() => setActiveMenu("agent")}
          >
            <MaterialIcon name="smart_toy" className="roomi-menu-icon" filled={activeMenu === "agent"} />
            <span className="roomi-menu-label">エージェント</span>
          </button>
        </nav>

        {/* メニュータブごとのサブコンテンツエリア */}
        <div className="roomi-sidebar-content">
          {activeMenu === "members" && (
            <div className="roomi-pane-members">
              <span className="roomi-pane-kicker">参加メンバー一覧</span>
              <p className="roomi-pane-hint">
                メンバーをクリックするとグラフ上で位置を確認できます
              </p>
              <div className="roomi-member-list">
                {[...graph.nodes]
                  .sort((a, b) => {
                    const agentA = a.kind === "agent" || a.id === "U-ROOMI" ? 0 : 1;
                    const agentB = b.kind === "agent" || b.id === "U-ROOMI" ? 0 : 1;
                    return agentA - agentB;
                  })
                  .map((node) => {
                  const isAgent = node.kind === "agent" || node.id === "U-ROOMI";
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`roomi-member-card${selectedPersonId === node.id ? " selected" : ""}${isAgent ? " agent" : ""}`}
                      onClick={() => handleSelectMember(node.id)}
                    >
                      <img
                        className="member-avatar"
                        src={
                          isAgent
                            ? node.avatar || "/roomi-logo.svg"
                            : node.avatar || getFallbackAvatarSvg(node.name || node.id, node.id)
                        }
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
                  );
                })}
              </div>
            </div>
          )}

          {activeMenu === "agent" && (
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
              {isSessionPending ? (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
                  認証状態を確認中...
                </div>
              ) : session?.user ? (
                <>
                  <div className="account-profile-box">
                    <img
                      className="account-avatar"
                      src={
                        session.user.image ||
                        getFallbackAvatarSvg(session.user.name || "ユーザー", session.user.id)
                      }
                      alt={session.user.name || "ユーザー"}
                    />
                    <h4 className="account-name">{session.user.name}</h4>
                    <span className="account-role-tag">Google 認証済み</span>
                    <span className="account-email">{session.user.email}</span>
                  </div>
                  <div className="account-details">
                    <div className="detail-item">
                      <span className="detail-key">ワークスペース</span>
                      <span className="detail-val">Roomi DevCamp 2026</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-key">認証プロバイダ</span>
                      <span className="detail-val">Google (Better Auth)</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-key">ユーザーID</span>
                      <span className="detail-val" style={{ fontSize: "10px", wordBreak: "break-all" }}>
                        {session.user.id.slice(0, 12)}...
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-key">ステータス</span>
                      <span className="detail-val status-online">● ログイン中</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="roomi-logout-btn"
                    onClick={handleSignOut}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    ログアウト
                  </button>
                </>
              ) : (
                <div className="roomi-auth-card">
                  <h4 className="roomi-auth-card-title">Google アカウントでログイン</h4>
                  <p className="roomi-auth-card-desc">
                    Better Auth による Google OAuth 認証でログインできます。
                  </p>
                  <button
                    type="button"
                    className="roomi-google-signin-btn"
                    onClick={handleGoogleSignIn}
                    disabled={isSigningIn}
                  >
                    <GoogleIcon />
                    <span>{isSigningIn ? "Googleへ接続中..." : "Googleでログイン"}</span>
                  </button>

                  {authError && (
                    <div style={{ color: "#f87171", fontSize: "11px", marginTop: "8px" }}>
                      {authError}
                    </div>
                  )}

                  <div className="roomi-auth-notice">
                    <p><strong>💡 Google OAuth設定:</strong></p>
                    <p>Google Cloud Console のリダイレクトURI:</p>
                    <code>http://localhost:3000/api/auth/callback/google</code>
                    <p style={{ marginTop: "4px" }}>
                      <code>.env</code> に <code>GOOGLE_CLIENT_ID</code> と <code>GOOGLE_CLIENT_SECRET</code> を指定して利用します。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* サイドバー下部 */}
        <div className="roomi-sidebar-footer">
          {session?.user ? (
            <button
              type="button"
              className="roomi-footer-user"
              onClick={() => setActiveMenu("account")}
            >
              <img
                src={
                  session.user.image ||
                  getFallbackAvatarSvg(session.user.name || "ユーザー", session.user.id)
                }
                alt={session.user.name}
                className="footer-avatar"
              />
              <div className="footer-user-meta">
                <span className="footer-user-name">
                  {session.user.name}
                </span>
                <span className="footer-user-email">
                  {session.user.email}
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              className="roomi-footer-user"
              onClick={() => setActiveMenu("account")}
            >
              <span className="footer-avatar placeholder" aria-hidden="true" />
              <div className="footer-user-meta">
                <span className="footer-user-name">ログイン</span>
                <span className="footer-user-email">Googleアカウント</span>
              </div>
            </button>
          )}
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
              {graph.nodes.filter((node) => node.kind !== "agent").length} 人のメンバー
              {" · "}
              Roomi 介入中
              {" · "}
              {graph.edges.length} の関係性
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
          <span>
            <i className="agent" aria-hidden="true" />Roomi
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
