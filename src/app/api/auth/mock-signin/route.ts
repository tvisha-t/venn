import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { completeSignIn } from "@/server/auth";
import { setSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { verifySession } from "@/server/crypto";
import { env } from "@/server/env";
import { applyReferralCookie } from "@/server/referrals";

// Demo picker ("Continue with school login" until GT SSO is approved): fictional identities only.
// Typed emails never sign in here; they must go through /api/auth/request-code + verify-code.
const Body = z.object({ identityId: z.string().min(1).max(64) });

export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  if (!env.demoLogin) throw new HttpError(404, "Not found");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Pick a demo identity, or sign in with your school email.");
  const jar = await cookies();
  const claim = verifySession(jar.get("venn_claim")?.value);
  const r = await completeSignIn(parsed.data, claim?.profileId);
  jar.delete("venn_claim");
  const invited = Boolean(jar.get("venn_ref"));
  await applyReferralCookie(jar, r);
  await setSession({ userId: r.userId, profileId: r.profileId });
  const next = r.needsProfile ? (claim ? "/profile?import=linkedin" : invited ? "/profile?welcome=1" : "/profile") : "/home";
  return NextResponse.json({ ok: true, next, claimed: Boolean(claim) });
});
