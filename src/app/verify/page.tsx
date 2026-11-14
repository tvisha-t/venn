"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, ChevronRight, Clock, FileCheck2, Image as ImageIcon, Info, Loader2, Mail, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VennLogo } from "@/components/brand/VennLogo";

type Method = "gt_email" | "etranscript" | "diploma_photo";
type Doc = "etranscript" | "diploma_photo";
type Status = { badges: { method: Method; label: string }[]; pending: { method: Method; at: string }[] };

const OPTIONS: { m: Method; title: string; help: string; time: string; icon: typeof Mail; fastest?: boolean }[] = [
  { m: "gt_email", title: "GT email code", help: "Works with your forwarding address", time: "1 min", icon: Mail, fastest: true },
  { m: "etranscript", title: "Official e-transcript", help: "Signed PDF from Parchment", time: "3 min", icon: FileCheck2 },
  { m: "diploma_photo", title: "Photo of your diploma", help: "A clear photo of your GT diploma", time: "2 min", icon: ImageIcon },
];

export default function VerifyPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState<Method | null>(null);

  // Plain fetch (not api()): on this page "not signed in" is a normal state, not a reason to redirect.
  const load = useCallback(() => {
    fetch("/api/verify", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { setSignedIn(false); return; }
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't load your verification.");
        setSt((await r.json()) as Status); setSignedIn(true);
      })
      .catch((e) => toast.error((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const has = (m: Method) => st?.badges.some((b) => b.method === m) ?? false;
  const pending = (m: Method) => st?.pending.some((p) => p.method === m) ?? false;

  return (
    <div className="min-h-dvh bg-canvas px-5 py-6 sm:py-10">
      <div className="mx-auto max-w-[560px]">
        <div className="flex items-center justify-between">
          <VennLogo href={signedIn ? "/home" : "/signin"} />
          {signedIn ? <Link href="/profile" className="text-body-sm font-semibold text-link underline underline-offset-2">Back to profile</Link>
            : <Link href="/signin" className="text-body-sm font-semibold text-link underline underline-offset-2">Sign in</Link>}
        </div>

        <main id="main" className="mt-8">
          {open ? (
            <section aria-labelledby="m-h">
              <button type="button" onClick={() => { setOpen(null); load(); }} className="inline-flex min-h-11 items-center gap-1.5 text-body-sm font-semibold text-link"><ArrowLeft className="size-4" aria-hidden /> All options</button>
              <h1 id="m-h" className="mt-2 text-title-1">{OPTIONS.find((o) => o.m === open)!.title}</h1>
              {open === "gt_email" ? (
                <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
                  {signedIn ? <p className="flex items-center gap-2 text-body-strong text-success"><BadgeCheck className="size-5" aria-hidden /> You&apos;re verified with your GT email.</p> : (
                    <>
                      <p className="text-text-muted">Enter your @gatech.edu address (alumni forwarding addresses work too) and we&apos;ll send a 6-digit code.</p>
                      <Link href="/signin" className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 font-semibold text-on-primary">Continue with GT email</Link>
                    </>
                  )}
                </div>
              ) : signedIn ? (
                <ExtraProof m={open} pending={pending(open)} done={has(open)} onDone={load} />
              ) : (
                <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
                  <p className="text-text-muted">Upload it with the personal email you&apos;ll sign in with. A person reviews it, and we email you within 24 hours.</p>
                  <Link href={`/signin?method=${open === "etranscript" ? "transcript" : "diploma"}`} className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 font-semibold text-on-primary">Continue</Link>
                </div>
              )}
            </section>
          ) : (
            <>
              <h1 className="text-[28px] font-extrabold leading-[34px] tracking-[-0.03em]">Verify you&apos;re a Jacket</h1>
              <p className="mt-1 text-text-muted">No GT login needed. Pick whatever&apos;s easiest.</p>
              {st && st.badges.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your verifications">
                  {st.badges.map((b) => <li key={b.method} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-success-soft px-3 text-label text-success"><BadgeCheck className="size-4" aria-hidden /> {b.label}</li>)}
                </ul>
              )}
              <ul className="mt-6 space-y-3">
                {OPTIONS.map((o) => (
                  <li key={o.m}>
                    <button type="button" onClick={() => setOpen(o.m)}
                      className={cn("flex w-full items-center gap-4 rounded-lg bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-raised", o.fastest ? "border-2 border-primary" : "border border-line")}>
                      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-ink"><o.icon className="size-5" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-body-strong">
                          {o.title}
                          {o.fastest && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink">Fastest</span>}
                          {has(o.m) && <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success"><Check className="size-3.5" aria-hidden /> Done</span>}
                          {!has(o.m) && pending(o.m) && <span className="text-[12px] font-semibold text-accent-text">In review</span>}
                        </span>
                        <span className="block text-body-sm text-text-muted">{o.help}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-text-subtle"><span className="font-mono text-[12px]">{o.time}</span><ChevronRight className="size-4" aria-hidden /></span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-5 flex items-start gap-2 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                You only do this once. Verify with a transcript or diploma and you&apos;ll sign in with your personal email after it&apos;s approved. Documents are deleted after review and never shown to anyone.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function FilePicker({ m, file, setFile }: { m: Doc; file: File | null; setFile: (f: File | null) => void }) {
  const isPdf = m === "etranscript";
  return (
    <>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-control px-4 py-8 text-center hover:bg-surface-raised">
        <Upload className="size-6 text-text-subtle" aria-hidden />
        <span className="text-body-strong">{file ? file.name : isPdf ? "Choose a PDF (up to 5 MB)" : "Choose a JPG, PNG or HEIC (up to 10 MB)"}</span>
        <input type="file" className="sr-only" accept={isPdf ? "application/pdf,.pdf" : "image/jpeg,image/png,image/heic,.heic"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {isPdf && <a href="https://registrar.gatech.edu/parchment" target="_blank" rel="noopener noreferrer" className="inline-block text-body-sm font-semibold text-link underline underline-offset-2">Don&apos;t have one? Order it from GT through Parchment</a>}
      <p className="text-[12px] text-text-subtle">Demo: any file is accepted for now. It&apos;s deleted right away and never stored.</p>
    </>
  );
}

/** Signed in: add a document as extra proof (recorded "in review"). */
function ExtraProof({ m, pending, done, onDone }: { m: Doc; pending: boolean; done: boolean; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentOk, setSentOk] = useState(pending);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("method", m); fd.append("file", file);
      const res = await fetch("/api/verify/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed.");
      setSentOk(true); setFile(null); onDone();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (done) return <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card"><p className="flex items-center gap-2 text-body-strong text-success"><BadgeCheck className="size-5" aria-hidden /> Verified this way.</p></div>;
  if (sentOk) return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
      <p className="flex items-center gap-2 text-body-strong"><Clock className="size-5 text-accent-text" aria-hidden /> Submitted. It&apos;s in review.</p>
      <p className="mt-1 text-body-sm text-text-muted">The file was deleted right away; nothing was stored.</p>
    </div>
  );
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-line bg-surface p-5 shadow-card">
      <p className="text-text-muted">You&apos;re already verified. Add this as extra proof (for example, to show you graduated).</p>
      <FilePicker m={m} file={file} setFile={setFile} />
      {err && <p role="alert" className="text-[13px] font-medium text-danger">{err}</p>}
      <button type="button" onClick={send} disabled={!file || busy} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-5 font-semibold text-on-primary disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit
      </button>
    </div>
  );
}
