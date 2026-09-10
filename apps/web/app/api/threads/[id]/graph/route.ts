// Cloudflare移行後: WORKER_URL (roomi-worker) を優先。未設定なら従来の
// Python Dashboard (DASHBOARD_URL / localhost:8000) にフォールバックする。
const DASH = process.env.WORKER_URL ?? process.env.DASHBOARD_URL ?? "http://localhost:8000";

const EMPTY_GRAPH = { nodes: [], edges: [] };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const threadId = encodeURIComponent(params.id);
    const response = await fetch(`${DASH}/api/threads/${threadId}/graph`, {
      cache: "no-store",
    });
    if (!response.ok) return Response.json(EMPTY_GRAPH);
    const data = await response.json();
    return Response.json(
      data && Array.isArray(data.nodes) && Array.isArray(data.edges)
        ? data
        : EMPTY_GRAPH
    );
  } catch {
    return Response.json(EMPTY_GRAPH);
  }
}
