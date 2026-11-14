import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- bot throttle
// Per-minute burst limit per client + route group. Bot protection only — NOT a user quota.
const buckets = new Map<string, { start: number; count: number }>();
const LIMITS: Record<string, number> = { default: 120, agent: 20, send: 20, auth: 20, webhook: 600 };

export function throttle(req: Request, group: keyof typeof LIMITS = "default") {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = `${group}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > 60_000) {
    buckets.set(key, { start: now, count: 1 });
    return;
  }
  b.count++;
  const mult = Number(process.env.RATE_LIMIT_MULTIPLIER ?? 1) || 1;
  if (b.count > (LIMITS[group] ?? LIMITS.default) * mult) {
    throw new HttpError(429, "Too many requests — slow down for a minute.", "throttled");
  }
}

/** Wraps a route handler: consistent JSON errors, no stack traces or internals to the client. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues.map((i) => i.path.join(".")) }, { status: 400 });
      console.error("[api]", e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
