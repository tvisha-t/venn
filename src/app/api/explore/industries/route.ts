import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { filtersFromSearch, industryGroups } from "@/server/explore";

export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  return NextResponse.json({ groups: await industryGroups(filtersFromSearch(new URL(req.url).searchParams), s.profileId) });
});
