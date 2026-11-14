import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { HttpError, route, throttle } from "@/server/http";
import { requestCode } from "@/server/signinCodes";
import { TICKET_COOKIE, readTicket } from "@/server/verification";

const Body = z.object({ email: z.string().max(254) });

// Step 2: add a personal email (only after a document upload). Sends a 6-digit code to it.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  if (!readTicket((await cookies()).get(TICKET_COOKIE)?.value)) throw new HttpError(400, "Upload your transcript or diploma first.", "no_ticket");
  const { email } = Body.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return NextResponse.json(await requestCode(email, ip, { personal: true }));
});
