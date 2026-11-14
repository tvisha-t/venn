import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAlum } from "@/server/roles";
import { route, throttle } from "@/server/http";
import { createMemberEvent, EVENT_CATEGORIES, listEvents, NEIGHBORHOODS, type EventRange } from "@/server/events";

// GET /api/events?city=&range=week|month|going&category= — events in range with counts, the viewer's
// RSVP state, discoverable attendee avatars and the "you'll know" phrase (computed server-side).
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireAlum();
  const sp = new URL(req.url).searchParams;
  const range = (["week", "month", "going"].includes(sp.get("range") ?? "") ? sp.get("range") : "month") as EventRange;
  return NextResponse.json(await listEvents(s.profileId, { city: sp.get("city"), range, category: sp.get("category") }));
});

const Body = z.object({
  title: z.string().trim().min(3).max(80),
  category: z.enum(EVENT_CATEGORIES),
  startsAt: z.string().min(10).max(40),
  venueName: z.string().trim().min(2).max(120),
  venueAddress: z.string().trim().min(5).max(200),
  neighborhood: z.string().max(40).nullable().optional().refine((n) => !n || n in NEIGHBORHOODS, "Unknown neighborhood"),
  city: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(600).nullable().optional(),
});

// POST /api/events — a member-hosted event. The host is the signed-in member.
export const POST = route(async (req: Request) => {
  throttle(req, "send");
  const s = await requireAlum();
  return NextResponse.json(await createMemberEvent(s.profileId, Body.parse(await req.json())));
});
