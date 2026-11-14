import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { route } from "@/server/http";
import { getSession } from "@/server/session";
import { sql } from "@/server/db";
import { LI_PENDING_COOKIE, readPending } from "@/server/linkedin";

// Is LinkedIn switched on; for a signed-in member, have they connected it; and (legacy sign-in flow)
// is a LinkedIn connection waiting for the school-email step? First name only, never an address.
export const GET = route(async () => {
  const pending = readPending((await cookies()).get(LI_PENDING_COOKIE)?.value);
  const s = await getSession();
  const connected = s ? Boolean((await sql`select 1 from linkedin_links where user_id = ${s.userId}`)[0]) : false;
  return NextResponse.json({ ready: env.linkedinReady, connected, pendingFirstName: pending?.firstName || null }, { headers: { "cache-control": "no-store" } });
});
