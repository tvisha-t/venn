import { NextResponse } from "next/server";
import { z } from "zod";
import { route, throttle } from "@/server/http";
import { requestCode } from "@/server/signinCodes";
import { hasPassword } from "@/server/passwords";

const Body = z.object({ email: z.string().max(254), forceCode: z.boolean().optional() });

// Sign-in step 1: an account with a password gets the password box; everyone else gets a 6-digit code
// (same rules as /api/auth/request-code). forceCode = "Email me a code instead" (forgot password).
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const { email, forceCode } = Body.parse(await req.json());
  if (!forceCode && (await hasPassword(email))) return NextResponse.json({ method: "password" });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return NextResponse.json({ method: "code", ...(await requestCode(email, ip)) });
});
