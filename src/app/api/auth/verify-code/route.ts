import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { completeSignIn } from "@/server/auth";
import { setSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { verifySession } from "@/server/crypto";
import { verifyCode } from "@/server/signinCodes";
import { applyReferralCookie } from "@/server/referrals";
import { LI_PENDING_COOKIE, applyPendingLinkedIn } from "@/server/linkedin";

const Body = z.object({ email: z.string().max(254), code: z.string().max(12) });

// Step 2: check the code, then sign in (creating the account on first sign-in).
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const { email, code } = Body.parse(await req.json());
  const verified = await verifyCode(email, code);
  const jar = await cookies();
  const claim = verifySession(jar.get("venn_claim")?.value); // pending claim from a signed /r/{token}/claim link
  const r = await completeSignIn({ email: verified }, claim?.profileId);
  jar.delete("venn_claim");
  const viaLinkedIn = Boolean(jar.get(LI_PENDING_COOKIE));
  await applyPendingLinkedIn(jar, r); // LinkedIn connected first, school email verified now
  const invited = Boolean(jar.get("venn_ref"));
  await applyReferralCookie(jar, r);
  await setSession({ userId: r.userId, profileId: r.profileId });
  const next = r.needsProfile ? (claim ? "/profile?import=linkedin" : invited || viaLinkedIn ? "/profile?welcome=1" : "/profile") : "/home";
  return NextResponse.json({ ok: true, next, claimed: Boolean(claim) });
});
