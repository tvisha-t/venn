import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { sendInvite } from "@/server/invites";

const Body = z.object({ email: z.string().trim().max(254), note: z.string().max(300).optional().nullable() });

// Same response whether or not an email went out (never reveals who is on Venn or opted out).
export const POST = route(async (req: Request) => {
  throttle(req, "send");
  const s = await requireSession();
  const { email, note } = Body.parse(await req.json());
  await sendInvite(s.profileId, s.userId, email, note);
  return NextResponse.json({ ok: true, message: "Invite sent if they're not already on Venn." });
});
