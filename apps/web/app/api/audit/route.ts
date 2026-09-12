import { getSession } from "@/lib/auth-server";
import { controlCenterConfigured, controlCenterUserAllowed } from "@/lib/control-center-access";

// Cloudflare移行後: WORKER_URL (roomi-worker) を優先。未設定なら従来の
// Python Dashboard (DASHBOARD_URL / localhost:8000) にフォールバックする。
const DASH = process.env.WORKER_URL ?? process.env.DASHBOARD_URL ?? "http://localhost:8000";

export async function GET() {
  const isDev = process.env.NODE_ENV !== "production";
  const session = await getSession();
  if (!session && !isDev) return Response.json([], { status: 401 });
  if (!controlCenterConfigured()) return Response.json([], { status: 503 });
  const userEmail = session?.user?.email ?? (isDev ? "dev@example.com" : null);
  if (!controlCenterUserAllowed(userEmail) || (process.env.ROOMI_ALLOW_AUDIT !== "true" && !isDev)) {
    return Response.json([], { status: 403 });
  }
  try {
    const r = await fetch(`${DASH}/api/audit`, {
      cache: "no-store",
      headers: process.env.AGREEMENT_API_TOKEN
        ? { authorization: `Bearer ${process.env.AGREEMENT_API_TOKEN}` }
        : undefined,
    });
    if (!r.ok) return Response.json([], { status: 502 });
    return Response.json(await r.json());
  } catch {
    return Response.json([]);
  }
}
