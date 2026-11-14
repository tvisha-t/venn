import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { companies, companyPeople, filtersFromSearch } from "@/server/explore";

export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const sp = new URL(req.url).searchParams;
  const company = sp.get("company");
  sp.delete("company");
  const f = filtersFromSearch(sp);
  if (company) return NextResponse.json({ employer: company, groups: await companyPeople(company, f, s.profileId) });
  return NextResponse.json({ companies: await companies(f, s.profileId) });
});
