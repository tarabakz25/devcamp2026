import { getSession } from "@/lib/auth-server";
import {
  controlCenterConfigured,
  controlCenterThreadAllowed,
  controlCenterUserAllowed,
} from "@/lib/control-center-access";

import { fetchBackend } from "@/lib/backend";

const EMPTY_GRAPH = { nodes: [], edges: [] };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return Response.json(EMPTY_GRAPH, { status: 401 });
  if (!controlCenterConfigured()) return Response.json(EMPTY_GRAPH, { status: 503 });
  if (!controlCenterUserAllowed(session.user.email) || !controlCenterThreadAllowed(params.id)) {
    return Response.json(EMPTY_GRAPH, { status: 403 });
  }
  try {
    const threadId = encodeURIComponent(params.id);
    const response = await fetchBackend(`/api/threads/${threadId}/graph`, {
      cache: "no-store",
      headers: process.env.AGREEMENT_API_TOKEN
        ? { authorization: `Bearer ${process.env.AGREEMENT_API_TOKEN}` }
        : undefined,
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
