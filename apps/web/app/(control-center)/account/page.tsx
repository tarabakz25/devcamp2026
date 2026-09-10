"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { getFallbackAvatarSvg } from "../../components/CommunicationTopicGraph";
import GoogleIcon from "../../components/GoogleIcon";

export default function AccountPage() {
  const { data: session, isPending } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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

  return (
    <section className="roomi-page-stage account-stage" aria-label="アカウント">
      <header className="roomi-page-head">
        <span className="roomi-page-kicker">Account</span>
        <h1>アカウント</h1>
        <p>ログイン状態と、このワークスペースでの表示。</p>
      </header>

      {isPending ? (
        <p className="roomi-empty-text">認証状態を確認中...</p>
      ) : session?.user ? (
        <div className="account-page-grid">
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
            <button type="button" className="roomi-logout-btn" onClick={handleSignOut}>
              ログアウト
            </button>
          </div>
        </div>
      ) : (
        <div className="roomi-auth-card account-login-card">
          <h4 className="roomi-auth-card-title">Google アカウントでログイン</h4>
          <p className="roomi-auth-card-desc">
            Better Auth による Google OAuth 認証でログインできる。
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
            <div style={{ color: "#f87171", fontSize: "11px", marginTop: "8px" }}>{authError}</div>
          )}
          <div className="roomi-auth-notice">
            <p>
              <strong>Google OAuth設定:</strong>
            </p>
            <p>Google Cloud Console のリダイレクトURI:</p>
            <code>http://localhost:3000/api/auth/callback/google</code>
          </div>
        </div>
      )}
    </section>
  );
}
