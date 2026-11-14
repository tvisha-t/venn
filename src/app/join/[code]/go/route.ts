import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CODE_RE, REF_COOKIE, REF_COOKIE_DAYS } from "@/server/referrals";

// From the invite landing page: remember which link they came from, then sign in.
// The cookie holds only the invite code; it's applied (and deleted) when they join.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const via = new URL(req.url).searchParams.get("via");
  const c = code.trim().toLowerCase();
  if (CODE_RE.test(c)) {
    (await cookies()).set(REF_COOKIE, c, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: REF_COOKIE_DAYS * 86400,
    });
  }
  return NextResponse.redirect(new URL(via === "linkedin" ? "/api/auth/linkedin/start" : "/signin?invited=1", req.url));
}
