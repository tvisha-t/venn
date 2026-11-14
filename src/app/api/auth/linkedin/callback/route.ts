import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { safeEq, verifySession } from "@/server/crypto";
import { throttle } from "@/server/http";
import { completeSignIn } from "@/server/auth";
import { setSession } from "@/server/session";
import { applyReferralCookie } from "@/server/referrals";
import { LI_PENDING_COOKIE, LI_STATE_COOKIE, fetchLinkedInUser, linkLinkedIn, signPending, userForLinkedIn } from "@/server/linkedin";
import { schoolForEmail } from "@/lib/schoolDomain";

// Step 2 of "Continue with LinkedIn". Three outcomes:
//  1. LinkedIn already linked to a member → signed in.
//  2. LinkedIn's verified email is a GT address → that proves school membership → signed in.
//  3. Otherwise (usually a personal email) → remember LinkedIn for 30 min and ask for the GT email code once.
export async function GET(req: Request) {
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const back = (q: string) => go(`/signin?linkedin=${q}`);
  const jar = await cookies();
  const expected = jar.get(LI_STATE_COOKIE)?.value;
  jar.delete(LI_STATE_COOKIE);
  try {
    throttle(req, "auth");
    const url = new URL(req.url);
    if (url.searchParams.get("error")) return back("cancelled");
    if (!env.linkedinReady) return back("unavailable");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || !expected || !safeEq(state, expected)) return back("error");

    const li = await fetchLinkedInUser(code);

    const existing = await userForLinkedIn(li.subHash);
    if (existing) {
      await setSession({ userId: existing.userId, profileId: existing.profileId });
      return go(existing.approved ? "/home" : "/profile");
    }

    if (li.email && li.emailVerified && schoolForEmail(li.email)) {
      const claim = verifySession(jar.get("venn_claim")?.value);
      const r = await completeSignIn({ email: li.email }, claim?.profileId);
      jar.delete("venn_claim");
      await linkLinkedIn(r.userId, r.profileId, li, r.isNew);
      await applyReferralCookie(jar, r);
      await setSession({ userId: r.userId, profileId: r.profileId });
      return go(r.needsProfile ? (claim ? "/profile?import=linkedin" : "/profile?welcome=1") : "/home");
    }

    jar.set(LI_PENDING_COOKIE, signPending({ subHash: li.subHash, firstName: li.firstName, lastName: li.lastName }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1800,
    });
    return back("verify");
  } catch {
    return back("error");
  }
}
