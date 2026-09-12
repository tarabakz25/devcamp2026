import { getSession } from "@/lib/auth-server";
import {
  controlCenterConfigured,
  controlCenterThreadAllowed,
  controlCenterUserAllowed,
} from "@/lib/control-center-access";

// Cloudflare移行後: WORKER_URL (roomi-worker) を優先。未設定なら従来の
// Python Dashboard (DASHBOARD_URL / localhost:8000) にフォールバックする。
const DASH = process.env.WORKER_URL ?? process.env.DASHBOARD_URL ?? "http://localhost:8000";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return Response.json([], { status: 401 });
  if (!controlCenterConfigured()) return Response.json([], { status: 503 });
  if (!controlCenterUserAllowed(session.user.email) || !controlCenterThreadAllowed(params.id)) {
    return Response.json([], { status: 403 });
  }
  try {
    const threadId = encodeURIComponent(params.id);
    const r = await fetch(`${DASH}/api/threads/${threadId}/timeline`, {
      cache: "no-store",
      headers: process.env.AGREEMENT_API_TOKEN
        ? { authorization: `Bearer ${process.env.AGREEMENT_API_TOKEN}` }
        : undefined,
    });
    if (!r.ok) return Response.json([], { status: 502 });
    const data = await r.json();
    return Response.json(data);
  } catch {
    return Response.json([]);
  }
}
