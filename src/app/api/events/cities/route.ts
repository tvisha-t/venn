import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { eventCities, NEIGHBORHOODS } from "@/server/events";

export const GET = route(async (req: Request) => {
  throttle(req);
  await requireSession();
  return NextResponse.json({ cities: await eventCities(), neighborhoods: Object.keys(NEIGHBORHOODS) });
});
