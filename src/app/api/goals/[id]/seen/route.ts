import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route } from "@/server/http";
import { sql } from "@/server/db";

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const { id } = await ctx.params;
  await sql`update goal_matches set is_new = false, notified = true
    where goal_id = ${id} and goal_id in (select id from goals where owner_profile_id = ${s.profileId})`;
  return NextResponse.json({ ok: true });
});
