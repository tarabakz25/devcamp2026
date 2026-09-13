/**
 * Cloudflare Worker / Dashboard API への接続先を一元管理するヘルパーモジュール。
 *
 * 優先順位:
 * 1. 環境変数 WORKER_URL (未設定時はリモート Cloudflare Worker)
 * 2. 環境変数 DASHBOARD_URL (設定されている場合のみ)
 * 3. 開発時のデフォルト: ローカル Worker (http://localhost:8787)
 * 4. 本番時のデフォルト: Cloudflare 本番 Worker
 */

export const REMOTE_WORKER_URL = "https://roomi-worker.aikikizuki.workers.dev";
export const LOCAL_WORKER_URL = "http://localhost:8787";

export function getBackendUrl(): string {
  const configured = process.env.WORKER_URL || process.env.DASHBOARD_URL;
  const fallback = process.env.NODE_ENV === "production" ? REMOTE_WORKER_URL : LOCAL_WORKER_URL;
  return (configured || fallback).replace(/\/$/, "");
}

/**
 * バックエンド API を呼び出す。
 * ローカル接続 (localhost) が失敗した場合や 502/503 が返った場合は、
 * 自動的にリモートの Cloudflare Worker (D1) にフェイルオーバーして自動接続する。
 */
export async function fetchBackend(pathWithQuery: string, init?: RequestInit): Promise<Response> {
  const primaryBase = getBackendUrl();
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const primaryUrl = `${primaryBase}${normalizedPath}`;

  try {
    const response = await fetch(primaryUrl, init);
    // ローカルを指定していて 502/503 (サーバー未起動) の場合、リモートへフォールバック
    if ((response.status === 502 || response.status === 503) && primaryBase.includes("localhost")) {
      const fallbackUrl = `${REMOTE_WORKER_URL}${normalizedPath}`;
      const fallbackResponse = await fetch(fallbackUrl, init).catch(() => null);
      if (fallbackResponse && fallbackResponse.ok) {
        return fallbackResponse;
      }
    }
    return response;
  } catch (err) {
    // ローカルへの接続拒否等のエラー時、リモート Cloudflare Worker にフェイルオーバー
    if (primaryBase !== REMOTE_WORKER_URL) {
      const fallbackUrl = `${REMOTE_WORKER_URL}${normalizedPath}`;
      try {
        const fallbackResponse = await fetch(fallbackUrl, init);
        return fallbackResponse;
      } catch {
        // リモートも失敗した場合は元のエラーを投げる
      }
    }
    throw err;
  }
}
