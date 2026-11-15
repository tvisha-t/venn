import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { completeSignIn } from "@/server/auth";
import { setSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { verifySession } from "@/server/crypto";
import { verifyPasswordSignIn } from "@/server/passwords";
import { applyReferralCookie } from "@/server/referrals";

const Body = z.object({ email: z.string().max(254), password: z.string().max(200) });

// Email + password sign-in (only for accounts that set a password after a code sign-in).
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const { email, password } = Body.parse(await req.json());
  const verified = await verifyPasswordSignIn(email, password);
  const jar = await cookies();
  const claim = verifySession(jar.get("venn_claim")?.value);
  const r = await completeSignIn({ email: verified }, claim?.profileId);
  jar.delete("venn_claim");
  await applyReferralCookie(jar, r);
  await setSession({ userId: r.userId, profileId: r.profileId });
  const next = r.needsProfile ? (claim ? "/profile?import=linkedin" : "/profile") : "/home";
  return NextResponse.json({ ok: true, next });
});
