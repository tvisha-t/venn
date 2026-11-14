import { NextResponse } from "next/server";
import { route, throttle } from "@/server/http";
import { requireAlum } from "@/server/roles";
import { listGroups } from "@/server/groups";

// Alumni-only: the directory with member COUNTS (never member lists) and a private suggestion.
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await listGroups(s.profileId), { headers: { "cache-control": "no-store" } });
});
