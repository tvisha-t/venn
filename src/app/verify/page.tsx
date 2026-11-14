"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, ChevronRight, Clock, FileCheck2, GraduationCap, Image as ImageIcon, Info, Loader2, Mail, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VennLogo } from "@/components/brand/VennLogo";

type Method = "gt_email" | "etranscript" | "diploma_photo" | "quiz";
type Status = {
  badges: { method: Method; label: string }[];
  pending: { method: Method; at: string }[];
  quiz: { passed: boolean; attemptsLeft: number; retryAt: string | null };
};
type Question = { attemptId: string; index: number; total: number; seconds: number; category: string; question: string; options: string[] };

const OPTIONS: { m: Method; title: string; help: string; time: string; icon: typeof Mail; fastest?: boolean }[] = [
  { m: "gt_email", title: "GT email code", help: "Works with your forwarding address", time: "1 min", icon: Mail, fastest: true },
  { m: "etranscript", title: "Official e-transcript", help: "Signed PDF from Parchment", time: "3 min", icon: FileCheck2 },
  { m: "diploma_photo", title: "Photo of your diploma", help: "Reviewed by a person", time: "< 24 h", icon: ImageIcon },
  { m: "quiz", title: "Georgia Tech quiz", help: "5 questions only Jackets know", time: "2 min", icon: GraduationCap },
];

export default function VerifyPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState<Method | null>(null);

  const load = useCallback(() => {
    api<Status>("/api/verify").then((s) => { setSt(s); setSignedIn(true); })
      .catch((e) => { if (e instanceof ApiError && e.status === 401) setSignedIn(false); else toast.error((e as Error).message); });
  }, []);
  useEffect(load, [load]);

  const has = (m: Method) => st?.badges.some((b) => b.method === m) ?? false;
  const pending = (m: Method) => st?.pending.some((p) => p.method === m) ?? false;

  return (
    <div className="min-h-dvh bg-canvas px-5 py-6 sm:py-10">
      <div className="mx-auto max-w-[560px]">
        <div className="flex items-center justify-between">
          <VennLogo href={signedIn ? "/home" : "/signin"} />
          {signedIn && <Link href="/profile" className="text-body-sm font-semibold text-link underline underline-offset-2">Back to profile</Link>}
        </div>

        <main id="main" className="mt-8">
          {open ? (
            <MethodPanel m={open} signedIn={!!signedIn} st={st} onBack={() => { setOpen(null); load(); }} onChanged={load} />
          ) : (
            <>
              <h1 className="text-[28px] font-extrabold leading-[34px] tracking-[-0.03em]">Verify you&apos;re a Jacket</h1>
              <p className="mt-1 text-text-muted">No GT login needed. Pick whatever&apos;s easiest.</p>
              {st && st.badges.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your verifications">
                  {st.badges.map((b) => (
                    <li key={b.method} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-success-soft px-3 text-label text-success"><BadgeCheck className="size-4" aria-hidden /> {b.label}</li>
                  ))}
                </ul>
              )}
              <ul className="mt-6 space-y-3">
                {OPTIONS.map((o) => (
                  <li key={o.m}>
                    <button type="button" onClick={() => setOpen(o.m)}
                      className={cn("flex w-full items-center gap-4 rounded-lg bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-raised",
                        o.fastest ? "border-2 border-primary" : "border border-line")}>
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
                      <span className="flex shrink-0 items-center gap-2 text-text-subtle">
                        <span className="font-mono text-[12px]">{o.time}</span><ChevronRight className="size-4" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-5 flex items-start gap-2 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                You only do this once. Documents are deleted right after they&apos;re checked and are never shown to anyone; only the method appears as a badge.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function MethodPanel({ m, signedIn, st, onBack, onChanged }: { m: Method; signedIn: boolean; st: Status | null; onBack: () => void; onChanged: () => void }) {
  const o = OPTIONS.find((x) => x.m === m)!;
  return (
    <section aria-labelledby="m-h">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 text-body-sm font-semibold text-link"><ArrowLeft className="size-4" aria-hidden /> All options</button>
      <h1 id="m-h" className="mt-2 text-title-1">{o.title}</h1>
      {m === "gt_email" ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
          {signedIn ? (
            <p className="flex items-center gap-2 text-body-strong text-success"><BadgeCheck className="size-5" aria-hidden /> You&apos;re verified with your GT email.</p>
          ) : (
            <>
              <p className="text-text-muted">Enter your @gatech.edu address (alumni forwarding addresses work too) and we&apos;ll send a 6-digit code.</p>
              <Link href="/signin" className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 font-semibold text-on-primary">Continue with GT email</Link>
            </>
          )}
        </div>
      ) : !signedIn ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
          <p className="text-text-muted">Sign in with your GT email first, then add this as extra proof (for example, to show you graduated).</p>
          <Link href="/signin" className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 font-semibold text-on-primary">Sign in</Link>
        </div>
      ) : m === "quiz" ? (
        <Quiz st={st} onChanged={onChanged} />
      ) : (
        <UploadBox m={m} pending={st?.pending.some((p) => p.method === m) ?? false} onDone={onChanged} />
      )}
    </section>
  );
}

function UploadBox({ m, pending, onDone }: { m: "etranscript" | "diploma_photo"; pending: boolean; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(pending);
  const [err, setErr] = useState<string | null>(null);
  const isPdf = m === "etranscript";

  async function send() {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("method", m); fd.append("file", file);
      const res = await fetch("/api/verify/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed.");
      setDone(true); setFile(null); onDone();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (done) return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
      <p className="flex items-center gap-2 text-body-strong"><Clock className="size-5 text-accent-text" aria-hidden /> Submitted. It&apos;s in review.</p>
      <p className="mt-1 text-body-sm text-text-muted">The file was checked and deleted right away; nothing was stored. You&apos;ll get the badge once it&apos;s approved.</p>
    </div>
  );
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-line bg-surface p-5 shadow-card">
      <p className="text-text-muted">{isPdf ? "Upload the official electronic transcript PDF from Parchment. We only read your name, degree and year, never grades." : "Upload a clear photo of your diploma. A person reviews it; it's deleted after the decision."}</p>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-control px-4 py-8 text-center hover:bg-surface-raised">
        <Upload className="size-6 text-text-subtle" aria-hidden />
        <span className="text-body-strong">{file ? file.name : isPdf ? "Choose a PDF (up to 5 MB)" : "Choose a JPG, PNG or HEIC (up to 10 MB)"}</span>
        <input type="file" className="sr-only" accept={isPdf ? "application/pdf,.pdf" : "image/jpeg,image/png,image/heic,.heic"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {isPdf && <a href="https://registrar.gatech.edu/parchment" target="_blank" rel="noopener noreferrer" className="inline-block text-body-sm font-semibold text-link underline underline-offset-2">Don&apos;t have one? Order it from GT through Parchment</a>}
      {err && <p role="alert" className="text-[13px] font-medium text-danger">{err}</p>}
      <button type="button" onClick={send} disabled={!file || busy} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-5 font-semibold text-on-primary disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit for review
      </button>
    </div>
  );
}

function Quiz({ st, onChanged }: { st: Status | null; onChanged: () => void }) {
  const [q, setQ] = useState<Question | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; score: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sent = useRef(false);

  const submit = useCallback(async (choice: string | null) => {
    if (!q || sent.current) return;
    sent.current = true; setBusy(true);
    try {
      const r = await api<({ done: false } & Question) | { done: true; passed: boolean; score: number; total: number }>("/api/verify/quiz/answer", { method: "POST", json: { attemptId: q.attemptId, index: q.index, choice } });
      if (r.done) { setResult({ passed: r.passed, score: r.score, total: r.total }); setQ(null); onChanged(); }
      else { setQ(r); setLeft(r.seconds); sent.current = false; }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, [q, onChanged]);

  useEffect(() => {
    if (!q) return;
    if (left <= 0) { submit(null); return; } // no answer in time counts as wrong
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [q, left, submit]);

  async function start() {
    setErr(null); setResult(null); setBusy(true);
    try { const first = await api<Question>("/api/verify/quiz", { method: "POST" }); sent.current = false; setQ(first); setLeft(first.seconds); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (st?.quiz.passed && !result) return <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card"><p className="flex items-center gap-2 text-body-strong text-success"><BadgeCheck className="size-5" aria-hidden /> You passed the quiz.</p></div>;
  if (result) return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
      <p className={cn("text-title-2", result.passed ? "text-success" : "text-text")}>{result.passed ? "You passed. Welcome, Jacket." : "Not quite this time."}</p>
      <p className="mt-1 text-text-muted"><span className="font-mono">{result.score}/{result.total}</span> correct{result.passed ? ". You now have the “Verified · quiz” badge." : ". You can try once more after 24 hours, or use another way to verify."}</p>
    </div>
  );
  if (q) return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card" aria-live="polite">
      <div className="flex items-center justify-between text-body-sm text-text-muted">
        <span>Question <span className="font-mono">{q.index + 1}</span> of <span className="font-mono">{q.total}</span> · {q.category}</span>
        <span className={cn("font-mono", left <= 5 && "font-semibold text-danger")} aria-label={`${left} seconds left`}>0:{String(Math.max(0, left)).padStart(2, "0")}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-raised"><div className="h-full bg-accent transition-all" style={{ width: `${(left / q.seconds) * 100}%` }} /></div>
      <h2 className="mt-4 text-title-3">{q.question}</h2>
      <ul className="mt-3 space-y-2">
        {q.options.map((opt) => (
          <li key={opt}>
            <button type="button" disabled={busy} onClick={() => submit(opt)} className="flex min-h-12 w-full items-center rounded-md border border-line-control bg-surface px-4 text-left hover:bg-surface-raised disabled:opacity-60">{opt}</button>
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{err}</p>}
    </div>
  );
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
      <p className="text-text-muted">5 questions, one at a time, <span className="font-mono">20</span> seconds each. Get <span className="font-mono">4</span> right to pass.</p>
      <p className="mt-1 text-body-sm text-text-subtle">
        {st ? <>Attempts left: <span className="font-mono">{st.quiz.attemptsLeft}</span>{st.quiz.retryAt ? <> · next try after {new Date(st.quiz.retryAt).toLocaleString()}</> : null}</> : null}
      </p>
      {err && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{err}</p>}
      <button type="button" onClick={start} disabled={busy || (st ? st.quiz.attemptsLeft <= 0 || !!st.quiz.retryAt : false)}
        className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-5 font-semibold text-on-primary disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Start the quiz
      </button>
    </div>
  );
}
