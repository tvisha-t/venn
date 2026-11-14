import { NextResponse } from "next/server";
import { z } from "zod";
import { route, throttle } from "@/server/http";
import { requestCode } from "@/server/signinCodes";

const Body = z.object({ email: z.string().max(254) });

// Step 1: email a 6-digit code to a school address. Same response whether or not an account exists.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const { email } = Body.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return NextResponse.json(await requestCode(email, ip));
});
