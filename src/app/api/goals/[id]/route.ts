import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { sql } from "@/server/db";
import { rerunStandingGoals } from "@/server/agent/orchestrator";

const Body = z.object({ standing: z.boolean() });

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const { id } = await ctx.params;
  const { standing } = Body.parse(await req.json());
  const [g] = await sql`update goals set standing = ${standing} where id = ${id} and owner_profile_id = ${s.profileId} returning id, standing`;
  if (!g) throw new HttpError(404, "Goal not found");
  return NextResponse.json({ id: g.id, standing: g.standing });
});

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const { id } = await ctx.params;
  await sql`update goals set standing = false where id = ${id} and owner_profile_id = ${s.profileId}`;
  return NextResponse.json({ ok: true });
});

// POST /api/goals/:id — re-run a standing goal now
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req, "agent");
  const s = await requireSession();
  const { id } = await ctx.params;
  const [g] = await sql`select id from goals where id = ${id} and owner_profile_id = ${s.profileId} and standing`;
  if (!g) throw new HttpError(404, "Standing goal not found");
  return NextResponse.json(await rerunStandingGoals({ goalId: id }));
});
