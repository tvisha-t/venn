import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { completeSignIn } from "@/server/auth";
import { setSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { SchoolEmailError } from "@/server/identity";
import { verifySession } from "@/server/crypto";

const Body = z.union([
  z.object({ identityId: z.string().min(1).max(64) }),
  z.object({ email: z.string().trim().email().max(254) }),
]);

export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Enter a valid school email address.");
  const jar = await cookies();
  // pending claim from a signed email link (cookie set by /r/{token}/claim)
  const claim = verifySession(jar.get("venn_claim")?.value);
  let r;
  try {
    r = await completeSignIn(parsed.data, claim?.profileId);
  } catch (e) {
    if (e instanceof SchoolEmailError) throw new HttpError(400, e.message, "not_school_email");
    throw e;
  }
  jar.delete("venn_claim");
  await setSession({ userId: r.userId, profileId: r.profileId });
  const next = r.needsProfile ? (claim ? "/profile?import=linkedin" : "/profile") : "/home";
  return NextResponse.json({ ok: true, next, claimed: Boolean(claim) });
});
