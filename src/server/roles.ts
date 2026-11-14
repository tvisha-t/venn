import { sql } from "./db";
import { HttpError } from "./http";
import { requireSession } from "./session";
import { isAlum } from "@/lib/roles";

/** API guard for alumni-only areas (Events, Groups). Students get 403. */
export async function requireAlum() {
  const s = await requireSession();
  const [p] = await sql`select roles from profiles where id = ${s.profileId}`;
  if (!isAlum(p as { roles: string[] } | undefined)) throw new HttpError(403, "Events and groups are for Georgia Tech alumni.", "alumni_only");
  return s;
}

/** Page guard: true if the signed-in member may see alumni-only pages. */
export async function viewerIsAlum(profileId: string) {
  const [p] = await sql`select roles from profiles where id = ${profileId}`;
  return isAlum(p as { roles: string[] } | undefined);
}
