const DASH = process.env.DASHBOARD_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const r = await fetch(`${DASH}/api/audit`);
    return Response.json(await r.json());
  } catch {
    return Response.json([]);
  }
}
