export function controlCenterConfigured(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(process.env.BETTER_AUTH_SECRET && process.env.AGREEMENT_API_TOKEN);
}

export function controlCenterUserAllowed(email: string | null | undefined): boolean {
  const allowed = (process.env.ROOMI_ALLOWED_USER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return process.env.NODE_ENV !== "production";
  return Boolean(email && allowed.includes(email.trim().toLowerCase()));
}

export function controlCenterThreadAllowed(threadId: string): boolean {
  const demoThreadId = process.env.NEXT_PUBLIC_DEMO_THREAD_ID || "demo-live";
  const allowed = new Set([
    demoThreadId,
    ...(process.env.ROOMI_ALLOWED_THREAD_IDS || "").split(",").map((value) => value.trim()).filter(Boolean),
  ]);
  return allowed.has(threadId);
}
