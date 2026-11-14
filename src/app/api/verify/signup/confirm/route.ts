import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { HttpError, route, throttle } from "@/server/http";
import { verifyCode } from "@/server/signinCodes";
import { setSession } from "@/server/session";
import { TICKET_COOKIE, createDocAccount, readTicket } from "@/server/verification";

const Body = z.object({ email: z.string().max(254), code: z.string().max(12) });

// Step 3: check the code, create the account (verified by the document), sign in.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const jar = await cookies();
  const ticket = readTicket(jar.get(TICKET_COOKIE)?.value);
  if (!ticket) throw new HttpError(400, "Your upload expired. Upload it again.", "no_ticket");
  const { email, code } = Body.parse(await req.json());
  const verified = await verifyCode(email, code, { personal: true });
  const r = await createDocAccount(verified, ticket);
  jar.delete(TICKET_COOKIE);
  await setSession({ userId: r.userId, profileId: r.profileId });
  return NextResponse.json({ ok: true, next: r.isNew ? "/profile?welcome=1" : "/home" });
});
