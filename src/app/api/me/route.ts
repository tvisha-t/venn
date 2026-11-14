import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { getOwnProfile, updateOwnProfile } from "@/server/profiles";
import { route, throttle } from "@/server/http";
import { sql } from "@/server/db";

export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const profile = await getOwnProfile(s.profileId);
  const [counts] = await sql`
    select count(*) filter (where status = 'replied' and not sender_seen_reply)::int as unseen_replies
    from intro_requests where sender_profile_id = ${s.profileId}`;
  const thisYear = new Date().getFullYear();
  const graduationPrompt = profile.roles.includes("student") && profile.classYear != null && profile.classYear < thisYear;
  // monthly employer check-in
  const checkIn = Boolean(profile.employer) && profile.summaryApproved && Date.now() - new Date(profile.updatedAt).getTime() > 30 * 86400_000;
  return NextResponse.json({ profile, unseenReplies: counts.unseen_replies, graduationPrompt, checkIn });
});

const Patch = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  roles: z.array(z.enum(["student", "alum", "faculty", "staff", "lifetime_learner"])).min(1).optional(),
  classYear: z.number().int().min(1900).max(2040).nullable().optional(),
  degree: z.string().max(40).nullable().optional(),
  major: z.string().max(100).nullable().optional(),
  gtPrograms: z.array(z.string().max(60)).max(20).optional(),
  csThreads: z.array(z.string().max(60)).max(10).optional(),
  activities: z.array(z.string().max(60)).max(20).optional(),
  industry: z.string().max(60).nullable().optional(),
  employer: z.string().max(100).nullable().optional(),
  jobTitle: z.string().max(100).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  state: z.string().max(40).nullable().optional(),
  country: z.string().max(40).nullable().optional(),
  summary: z.string().max(600).nullable().optional(),
  openTo: z.array(z.string().max(60)).max(10).optional(),
  interests: z.array(z.string().max(40)).max(15).optional(),
  graduated: z.boolean().optional(),
  touch: z.boolean().optional(),
});

export const PATCH = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const { graduated, touch, ...edit } = Patch.parse(await req.json());
  if (graduated) {
    const me = await getOwnProfile(s.profileId);
    edit.roles = Array.from(new Set([...me.roles.filter((r) => r !== "student"), "alum"])) as typeof edit.roles;
  }
  if (touch) await sql`update profiles set updated_at = now() where id = ${s.profileId}`;
  const profile = await updateOwnProfile(s.profileId, edit);
  return NextResponse.json({ profile });
});
