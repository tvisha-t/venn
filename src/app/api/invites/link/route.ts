import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { getOrCreateInviteLink, resetInviteLink } from "@/server/referrals";

// The member's personal invite link (for "Text an invite") and how many people joined with it.
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  return NextResponse.json(await getOrCreateInviteLink(s.profileId, s.userId));
});

const Body = z.object({ action: z.literal("reset") });

export const POST = route(async (req: Request) => {
  throttle(req, "send");
  const s = await requireSession();
  Body.parse(await req.json());
  return NextResponse.json(await resetInviteLink(s.profileId, s.userId));
});
