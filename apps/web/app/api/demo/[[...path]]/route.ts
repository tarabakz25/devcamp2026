// Cloudflare移行後: WORKER_URL (roomi-worker) を優先。未設定なら従来の
// Python Dashboard (DASHBOARD_URL / localhost:8000) にフォールバックする。
const DASH = process.env.WORKER_URL ?? process.env.DASHBOARD_URL ?? "http://localhost:8000";

async function proxy(req: Request, path: string[] = []) {
  const suffix = path.length ? `/${path.join("/")}` : "";
  const incoming = new URL(req.url);
  const url = `${DASH}/api/demo${suffix}${incoming.search}`;
  const init: RequestInit = {
    method: req.method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return Response.json(
      {
        error: "dashboard_unavailable",
        hint: "task dash で Dashboard API を起動してね",
      },
      { status: 503 }
    );
  }
}

type Ctx = { params: { path?: string[] } };

export async function GET(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function POST(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function PUT(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function PATCH(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
export async function DELETE(req: Request, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
