"use client";
import { useRef, useState } from "react";
import { Camera, ChevronLeft, CircleCheck, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const COPY = {
  transcript: {
    method: "etranscript", title: "Verify with your transcript", line: "Upload the official PDF GT sends through Parchment.",
    accept: "application/pdf,.pdf", hint: "PDF only, up to 5 MB", max: 5 * 1024 * 1024, cta: "Verify",
  },
  diploma: {
    method: "diploma_photo", title: "Verify with your diploma", line: "Upload a clear photo. A person reviews it within 24 hours.",
    accept: "image/jpeg,image/png,image/heic,.heic", hint: "JPG, PNG or HEIC, up to 10 MB", max: 10 * 1024 * 1024, cta: "Submit for review",
  },
} as const;

/** Sign-in card step for "No GT email? Verify with Transcript / Diploma": file + personal email → pending review. */
export function VerifyByDocument({ kind, onBack }: { kind: "transcript" | "diploma"; onBack: () => void }) {
  const c = COPY[kind];
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  function choose(f: File | null | undefined) {
    setErr(null);
    if (!f) return;
    if (f.size > c.max) { setErr(`That file is too big (${c.hint}).`); return; }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setErr("Choose a file first."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("Enter the personal email you'll sign in with."); return; }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("method", c.method); fd.append("file", file); fd.append("email", email.trim());
      const res = await fetch("/api/verify/request", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Upload failed. Try again.");
      setDone(true);
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  return (
    <div>
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}><ChevronLeft aria-hidden /> All sign-in options</Button>
      <h1 className="mt-3 text-[28px] font-extrabold leading-[34px] tracking-[-0.03em]">{c.title}</h1>
      {done ? (
        <div role="status" className="mt-6 flex items-start gap-3 rounded-md bg-success-soft px-4 py-4 text-success">
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="font-semibold">Thanks! We&apos;ll email you within 24 hours.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 space-y-4" noValidate>
          <p className="text-text-muted">{c.line}</p>
          <div className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-line-control px-4 py-6 text-center">
            <Upload className="size-6 text-text-subtle" aria-hidden />
            <p className="text-body-sm text-text-muted">{file ? <span className="font-semibold text-text">{file.name}</span> : c.hint}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => pick.current?.click()}>Choose file</Button>
              {kind === "diploma" && (
                <Button type="button" variant="outline" size="sm" className="sm:hidden" onClick={() => camera.current?.click()}><Camera aria-hidden /> Take a photo</Button>
              )}
            </div>
            <input ref={pick} type="file" accept={c.accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => choose(e.target.files?.[0])} />
            {kind === "diploma" && <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => choose(e.target.files?.[0])} />}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="personal-email" className="block text-[13px] font-semibold">Personal email (you&apos;ll sign in with this)</label>
            <input id="personal-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              className="h-12 w-full rounded-md border border-line-control bg-surface px-4 text-[15px] text-text outline-none transition-colors focus:border-primary" />
          </div>
          {err && <p role="alert" className="text-[13px] font-medium text-danger">{err}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} {c.cta}</Button>
          <p className="text-[12px] text-text-muted">We only check your name, degree and year. Files are deleted after review.</p>
        </form>
      )}
    </div>
  );
}
