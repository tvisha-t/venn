import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { facets, filtersFromSearch, listProfiles } from "@/server/explore";

export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const sp = new URL(req.url).searchParams;
  const f = filtersFromSearch(sp);
  // Sequential on purpose: parallel queries through the Supabase pooler could stall on Vercel.
  const list = await listProfiles(f, { page: Number(sp.get("page") ?? 1), viewer: s.profileId });
  const fc = sp.get("facets") === "0" ? null : await facets(f, s.profileId);
  return NextResponse.json({ ...list, facets: fc });
});
