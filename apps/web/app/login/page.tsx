"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import GoogleIcon from "../components/GoogleIcon";
import RoomiLogo from "../components/RoomiLogo";

export default function LoginPage() {
  const { data: session, isPending } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    try {
      setIsSigningIn(true);
      setErrorMessage(null);
      await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (err: any) {
      console.error("Google sign in failed:", err);
      setErrorMessage(err?.message || "Google認証の開始に失敗しました。");
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
    <div className="roomi-login-shell">
      <div className="roomi-login-card">
        <div className="roomi-login-logo" aria-hidden="true">
          <RoomiLogo size={56} />
        </div>
        <h1 className="roomi-login-title">Roomi Control Center</h1>
        <p className="roomi-login-subtitle">
          AIの判断・関係性・記憶を可視化するダッシュボード
        </p>

        {isPending ? (
          <div style={{ padding: "24px", color: "var(--color-text-muted)" }}>
            認証状態を確認中...
          </div>
        ) : session?.user ? (
          <div className="roomi-auth-card">
            <p className="roomi-auth-card-title">ログイン中</p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "12px 0",
                textAlign: "left",
              }}
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                  }}
                >
                  {session.user.name?.charAt(0) || "U"}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 600, color: "#fff", fontSize: "14px" }}>
                  {session.user.name}
                </div>
                <div
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {session.user.email}
                </div>
              </div>
            </div>

            <div className="roomi-login-actions" style={{ marginTop: "16px" }}>
              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 16px",
                  background: "var(--color-primary)",
                  color: "#fff",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                コントロールセンターを開く
              </Link>
              <button
                type="button"
                className="roomi-logout-btn"
                onClick={handleSignOut}
              >
                ログアウト
              </button>
            </div>
          </div>
        ) : (
          <div className="roomi-login-actions">
            <button
              type="button"
              className="roomi-google-signin-btn"
              onClick={handleGoogleLogin}
              disabled={isSigningIn}
            >
              <GoogleIcon />
              <span>
                {isSigningIn ? "Googleへリダイレクト中..." : "Googleアカウントでログイン"}
              </span>
            </button>

            {errorMessage && (
              <div
                style={{
                  color: "#f87171",
                  fontSize: "12px",
                  padding: "8px",
                  background: "rgba(239, 68, 68, 0.1)",
                  borderRadius: "4px",
                }}
              >
                {errorMessage}
              </div>
            )}

            <div className="roomi-auth-notice">
              <p>
                <strong>💡 Google OAuth の事前準備:</strong>
              </p>
              <p>
                Google Cloud Console で OAuth 2.0 クライアントを作成し、
                リダイレクト URI に以下を追加してください:
              </p>
              <code>http://localhost:3000/api/auth/callback/google</code>
              <p style={{ marginTop: "6px" }}>
                その後 <code>.env</code> の <code>GOOGLE_CLIENT_ID</code> と{" "}
                <code>GOOGLE_CLIENT_SECRET</code> を設定します。
              </p>
            </div>

            <div style={{ marginTop: "12px" }}>
              <Link
                href="/"
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: "12px",
                  textDecoration: "none",
                }}
              >
                ← ダッシュボード（ゲスト閲覧）へ戻る
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
