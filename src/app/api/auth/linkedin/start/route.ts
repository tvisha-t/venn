import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { randomToken } from "@/server/crypto";
import { throttle } from "@/server/http";
import { LI_STATE_COOKIE, authorizeUrl } from "@/server/linkedin";
import { getSession } from "@/server/session";

// Step 1 of "Continue with LinkedIn": send the browser to LinkedIn with a one-time state value.
export async function GET(req: Request) {
  // Signed-in members connect LinkedIn from the profile builder; send problems back there.
  const signedIn = Boolean(await getSession());
  const back = (q: string) => NextResponse.redirect(new URL(signedIn ? `/profile?linkedin=${q}#linkedin` : `/signin?linkedin=${q}`, req.url));
  try { throttle(req, "auth"); } catch { return back("error"); }
  if (!env.linkedinReady) return back("unavailable");
  const state = randomToken(24);
  (await cookies()).set(LI_STATE_COOKIE, state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state));
}
