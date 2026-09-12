import { fetchBackend } from "@/lib/backend";

async function proxy(req: Request, path: string[] = []) {
  const suffix = path.length ? `/${path.join("/")}` : "";
  const incoming = new URL(req.url);
  const pathWithQuery = `/api/demo${suffix}${incoming.search}`;
  const init: RequestInit = {
    method: req.method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  try {
    const response = await fetchBackend(pathWithQuery, init);
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
        error: "backend_unavailable",
        hint: "Cloudflare Worker または Dashboard API の接続を確認してね",
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
