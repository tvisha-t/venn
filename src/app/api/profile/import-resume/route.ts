import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { extractProfile, pdfToText } from "@/server/resume";
import { LinkedInExportError, extractFromLinkedIn, readLinkedInZip } from "@/server/linkedinExport";
import { getVocab } from "@/server/agent/vocab";

// LinkedIn PDF / resume PDF / LinkedIn data export (.zip) / pasted text → extracted fields.
// Nothing is saved until the user reviews and approves.
export const POST = route(async (req: Request) => {
  throttle(req, "agent");
  await requireSession();
  const ct = req.headers.get("content-type") ?? "";
  let text = "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const pasted = form.get("text");
    if (file instanceof File && file.size > 0) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".zip") || /zip/.test(file.type)) {
        if (file.size > 50 * 1024 * 1024) throw new HttpError(413, "That export is over 50 MB. Request the smaller LinkedIn export (profile only) and try again.");
        try {
          const files = readLinkedInZip(new Uint8Array(await file.arrayBuffer()));
          const vocab = await getVocab();
          return NextResponse.json({ extracted: extractFromLinkedIn(files, vocab.majors) });
        } catch (e) {
          if (e instanceof LinkedInExportError) throw new HttpError(422, e.message);
          throw e;
        }
      }
      if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "That file is over 5 MB.");
      if (!/pdf$/i.test(file.type) && !name.endsWith(".pdf")) throw new HttpError(415, "Upload a PDF or a LinkedIn data export (.zip), or paste the text instead.");
      try { text = await pdfToText(await file.arrayBuffer()); } catch { throw new HttpError(422, "We couldn't read that PDF. Try pasting the text instead."); }
    } else if (typeof pasted === "string") text = pasted;
  } else {
    const b = (await req.json()) as { text?: string };
    text = b.text ?? "";
  }
  if (text.trim().length < 40) throw new HttpError(400, "We need a bit more text to build your profile.");
  return NextResponse.json({ extracted: await extractProfile(text) });
});
