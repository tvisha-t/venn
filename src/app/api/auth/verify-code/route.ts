import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { completeSignIn } from "@/server/auth";
import { setSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { verifySession } from "@/server/crypto";
import { verifyCode } from "@/server/signinCodes";

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
  await setSession({ userId: r.userId, profileId: r.profileId });
  const next = r.needsProfile ? (claim ? "/profile?import=linkedin" : "/profile") : "/home";
  return NextResponse.json({ ok: true, next, claimed: Boolean(claim) });
});
