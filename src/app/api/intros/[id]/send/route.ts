import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { sendIntro } from "@/server/intros";

// The ONLY way an intro is sent: the user clicks Send in the composer.
// The agent has no code path that calls this.
const Body = z.object({ subject: z.string().max(120), body: z.string().min(1).max(3000), userConfirmed: z.literal(true) });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req, "send");
  const s = await requireSession();
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  const r = await sendIntro(s.profileId, s.userId, id, b);
  return NextResponse.json(r);
});
