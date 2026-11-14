import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { HttpError, route, throttle } from "@/server/http";
import { TICKET_COOKIE, startDocSignup } from "@/server/verification";

// Sign-up without a GT email, step 1: upload a transcript (PDF) or diploma photo.
// Demo: not actually checked. The file is hashed in memory and dropped; a short-lived signed ticket remembers it.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const form = await req.formData();
  const method = form.get("method");
  const file = form.get("file");
  if (method !== "etranscript" && method !== "diploma_photo") throw new HttpError(400, "Unknown method");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const ticket = await startDocSignup(method, file, ip);
  (await cookies()).set(TICKET_COOKIE, ticket, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1800 });
  return NextResponse.json({ ok: true, method });
});
