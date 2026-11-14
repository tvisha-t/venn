import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route } from "@/server/http";
import { getVocab, OPEN_TO } from "@/server/agent/vocab";
import { GT_CONFIG } from "@/server/seed";
import { CITIES } from "@/server/geo";

export const GET = route(async () => {
  await requireSession();
  const v = await getVocab();
  return NextResponse.json({
    industries: v.industries, majors: v.majors, programs: GT_CONFIG.programs, csThreads: GT_CONFIG.csThreads, openTo: OPEN_TO,
    cities: CITIES.map((c) => ({ city: c.city, state: c.state })),
  });
});
