import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { nextBestForIntro } from "@/server/intros";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const { id } = await ctx.params;
  return NextResponse.json({ next: await nextBestForIntro(s.profileId, id) });
});
