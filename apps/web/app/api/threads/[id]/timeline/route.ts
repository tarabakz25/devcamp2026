// Cloudflare移行後: WORKER_URL (roomi-worker) を優先。未設定なら従来の
// Python Dashboard (DASHBOARD_URL / localhost:8000) にフォールバックする。
const DASH = process.env.WORKER_URL ?? process.env.DASHBOARD_URL ?? "http://localhost:8000";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await fetch(`${DASH}/api/threads/${params.id}/timeline`);
    const data = await r.json();
    return Response.json(data);
  } catch {
    return Response.json([]);
  }
}
