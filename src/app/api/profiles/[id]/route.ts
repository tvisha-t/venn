import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { getPublicProfile } from "@/server/profiles";
import { sql } from "@/server/db";
import { hasSharedContact } from "@/server/sharedContact";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const { id } = await ctx.params;
  const profile = await getPublicProfile(id);
  if (!profile) throw new HttpError(404, "This profile isn't available.");
  const [open] = await sql`select id, status from intro_requests where sender_profile_id = ${s.profileId} and recipient_profile_id = ${id}
    order by created_at desc limit 1`;
  // LinkedIn: whether they connected it (proved they own a LinkedIn account) and shared their profile link.
  // Flags only; the link itself comes from the audited /contact endpoint.
  const [li] = await sql`select
      exists (select 1 from linkedin_links l join profiles p on p.user_id = l.user_id where p.id = ${id}) as connected,
      exists (select 1 from shared_contact sc where sc.profile_id = ${id} and sc.linkedin_url is not null) as shared`;
  return NextResponse.json({
    profile, sharesContact: await hasSharedContact(id), myIntro: open ? { id: open.id, status: open.status } : null,
    linkedin: { connected: Boolean(li?.connected), shared: Boolean(li?.shared) },
  });
});
