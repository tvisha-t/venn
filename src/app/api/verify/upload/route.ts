import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { submitUpload } from "@/server/verification";

// Demo: records an e-transcript or diploma photo as "in review". The file is hashed (to block reuse)
// and discarded in memory; it is never written to disk, the database, or logs, and never shown to anyone.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const s = await requireSession();
  const form = await req.formData();
  const method = form.get("method");
  const file = form.get("file");
  if (method !== "etranscript" && method !== "diploma_photo") throw new HttpError(400, "Unknown method");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  return NextResponse.json(await submitUpload(s.profileId, method, file));
});
