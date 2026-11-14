import { NextResponse } from "next/server";
import { HttpError, route, throttle } from "@/server/http";
import { requestDocVerification } from "@/server/verification";

// Sign-in page "No GT email? Verify with Transcript / Diploma": file + personal email → pending review.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const form = await req.formData();
  const method = form.get("method");
  const file = form.get("file");
  const email = form.get("email");
  if (method !== "etranscript" && method !== "diploma_photo") throw new HttpError(400, "Unknown method");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  if (typeof email !== "string") throw new HttpError(400, "Enter the personal email you'll sign in with.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return NextResponse.json(await requestDocVerification(method, file, email, ip));
});
