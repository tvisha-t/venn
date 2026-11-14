import { NextResponse } from "next/server";
import { z } from "zod";
import { route, throttle } from "@/server/http";
import { requireAlum } from "@/server/roles";
import { joinGroup, leaveGroup, setShowOnProfile } from "@/server/groups";

type Ctx = { params: Promise<{ slug: string }> };

// Join (private by default for identity groups), leave (deletes the row), or show/hide on profile.
export const POST = route(async (req: Request, ctx: Ctx) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await joinGroup(s.profileId, (await ctx.params).slug));
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await leaveGroup(s.profileId, (await ctx.params).slug));
});

const Patch = z.object({ showOnProfile: z.boolean() });
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  throttle(req);
  const s = await requireAlum();
  const { showOnProfile } = Patch.parse(await req.json());
  return NextResponse.json(await setShowOnProfile(s.profileId, (await ctx.params).slug, showOnProfile));
});
