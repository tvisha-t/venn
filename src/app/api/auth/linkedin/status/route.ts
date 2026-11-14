import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { route } from "@/server/http";
import { LI_PENDING_COOKIE, readPending } from "@/server/linkedin";

// For the sign-in page: is LinkedIn sign-in switched on, and is a LinkedIn connection waiting
// for the school-email step? Returns the person's own first name only.
export const GET = route(async () => {
  const pending = readPending((await cookies()).get(LI_PENDING_COOKIE)?.value);
  return NextResponse.json({ ready: env.linkedinReady, pendingFirstName: pending?.firstName || null });
});
