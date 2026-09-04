const DASH = process.env.DASHBOARD_URL ?? "http://localhost:8000";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await fetch(`${DASH}/api/threads/${params.id}/timeline`);
    const data = await r.json();
    return Response.json(data);
  } catch {
    return Response.json([]);
  }
}
