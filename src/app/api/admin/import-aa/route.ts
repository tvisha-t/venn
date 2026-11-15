import { NextResponse } from "next/server";
import { HttpError, route, throttle } from "@/server/http";
import { requireAdmin } from "@/server/admin";
import { importAlumniAssociation } from "@/server/import/aa";
import { rerunStandingGoals } from "@/server/agent/orchestrator";
import { clearVocabCache } from "@/server/agent/vocab";

export const POST = route(async (req: Request) => {
  throttle(req, "send");
  const s = await requireAdmin();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose the GT records CSV export.");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(413, "CSV is over 20 MB.");
  let counts;
  try {
    counts = await importAlumniAssociation(await file.text(), { actor: `user:${s.userId}` });
  } catch (e) {
    throw new HttpError(422, (e as Error).message.startsWith("CSV") ? (e as Error).message : "Import failed — check the file format.");
  }
  clearVocabCache();
  const standing = await rerunStandingGoals();
  return NextResponse.json({ counts, standing });
});
