"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Loader2, Lock } from "lucide-react";
import { api, ROLE_LABEL } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Identity = { id: string; displayName: string; affiliation: string; detail: string; isNew: boolean };

const PRIVACY_NOTE = "Your email and phone are never shown. They're shared only when you reply to an intro.";

function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-bold leading-none tracking-[-0.045em] text-brand", className)}>venn</span>;
}

/** Decorative example match (illustration only; not interactive). */
function SampleMatch({ compact }: { compact?: boolean }) {
  return (
    <div aria-hidden className="rounded-[18px] border border-line/70 bg-surface p-5 shadow-[0_12px_32px_-12px_rgba(122,62,106,0.25)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-[15px] font-semibold text-white">MC</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-tight tracking-[-0.01em]">Maya Chen</p>
          <p className="text-[14px] text-ink-2">Product designer at Delta{compact ? "" : " · CS '19"}</p>
        </div>
        <span className="font-mono text-[13px] text-ink-2">12 min</span>
      </div>
      <p className="mt-4 rounded-xl bg-[#F1EFEC] px-3.5 py-2.5 text-[14px] text-ink-2">
        You both: <span className="text-ink">RoboJackets</span> · <span className="text-ink">{compact ? "CS" : "Computer Science"}</span>
        {!compact && <> · <span className="text-ink">Atlanta</span></>}
      </p>
      {!compact && (
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full bg-petal-tint px-2.5 py-1 text-[13px] font-medium text-petal-text">Open to mentoring</span>
          <span className="rounded-full bg-petal-tint px-2.5 py-1 text-[13px] font-medium text-petal-text">Hiring</span>
          <span className="ml-auto rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white">Request intro</span>
        </div>
      )}
    </div>
  );
}

function SignIn() {
  const router = useRouter();
  const claim = useSearchParams().get("claim") === "1";
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<Identity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  function loadIds() {
    setErr(null);
    api<{ identities: Identity[] }>("/api/auth/identities").then((r) => setIds(r.identities)).catch((e) => setErr(e.message));
  }
  useEffect(() => { if (open && !ids) loadIds(); }, [open, ids]);

  async function continueWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setEmailErr("Enter your school email."); return; }
    setBusy(true); setEmailErr(null);
    try {
      const r = await api<{ next: string }>("/api/auth/mock-signin", { method: "POST", json: { email: email.trim() } });
      router.replace(r.next);
    } catch (x) {
      setEmailErr((x as Error).message);
      setBusy(false);
    }
  }

  async function pick(id: string) {
    setPicking(id);
    try {
      const r = await api<{ next: string }>("/api/auth/mock-signin", { method: "POST", json: { identityId: id } });
      router.replace(r.next);
    } catch (x) {
      setErr((x as Error).message);
      setPicking(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F3F7] p-0 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-48px)] max-w-[1440px] gap-6 lg:grid-cols-2">
        {/* Form card */}
        <main id="main" className="relative flex flex-col px-6 pb-6 pt-8 sm:rounded-[24px] sm:border sm:border-[#EADFE6] sm:bg-[#FAF6F9] sm:px-12 sm:pt-12 lg:px-12">
          <Link href="/signin" aria-label="venn"><Wordmark className="text-[30px]" /></Link>

          {/* Phones: sample card above the headline */}
          <div className="mt-8 rounded-[28px] bg-panel p-4 lg:hidden">
            <SampleMatch compact />
          </div>

          <div className="mx-auto flex w-full max-w-[386px] flex-1 flex-col justify-center py-10">
            {claim && (
              <div className="mb-6 rounded-xl bg-panel px-4 py-3 text-[14px]">
                <p className="font-semibold">Claim your profile</p>
                <p className="text-ink-2">Sign in and we&apos;ll prefill your profile from your Alumni Association record. Nothing goes public until you approve it.</p>
              </div>
            )}
            <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
              Find your{" "}
              <span className="bg-[linear-gradient(transparent_48%,var(--petal-tint)_48%)] px-0.5">people</span>.
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
              Sign in with your school email.<span className="hidden sm:inline"> We&apos;ll find the people from your school who can help, and introduce you.</span>
              <span className="sm:hidden"> We&apos;ll find who can help and introduce you.</span>
            </p>

            <form onSubmit={continueWithEmail} className="mt-8 space-y-3" noValidate>
              <label htmlFor="email" className="block text-[14px] font-medium">School email</label>
              <input
                id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@gatech.edu"
                value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(null); }}
                aria-invalid={!!emailErr} aria-describedby={emailErr ? "email-err" : undefined}
                className={cn(
                  "h-12 w-full rounded-lg border border-[#9A949A] bg-surface px-4 text-[15px] outline-none transition-colors focus:border-brand",
                  emailErr && "border-danger",
                )}
              />
              {emailErr && <p id="email-err" role="alert" className="text-[13px] text-danger">{emailErr}</p>}
              <button type="submit" disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[16px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-70">
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Continue
              </button>
            </form>

            <div className="my-5 hidden items-center gap-3 text-[13px] text-ink-2 sm:flex" aria-hidden>
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
            <button onClick={() => setOpen(true)}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#9A949A] bg-surface text-[16px] font-medium transition-colors hover:bg-muted sm:mt-0">
              <GraduationCap className="size-[18px]" aria-hidden /> Continue with school login
            </button>
            <p className="mt-3 hidden text-center text-[14px] text-ink-2 sm:block">Graduated? Use your alumni or lifetime forwarding email.</p>
          </div>

          <div className="mx-auto w-full max-w-[386px] space-y-3">
            <p className="flex gap-2.5 rounded-xl bg-panel px-4 py-3 text-[14px] leading-snug text-ink-2">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {PRIVACY_NOTE}
            </p>
            <p className="hidden pb-2 text-center text-[13px] text-ink-2 sm:block">
              By continuing you agree to the <Link href="/terms" className="text-brand underline underline-offset-2">Terms</Link> and{" "}
              <Link href="/privacy" className="text-brand underline underline-offset-2">Privacy Policy</Link>.
            </p>
          </div>
        </main>

        {/* How it works (desktop) */}
        <aside aria-labelledby="how-h" className="hidden flex-col justify-center rounded-[24px] bg-panel px-12 py-12 lg:flex xl:px-[124px]">
          <div className="mx-auto w-full max-w-[444px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-petal-text">How it works</p>
            <h2 id="how-h" className="mt-3 text-[30px] font-bold leading-[1.15] tracking-[-0.03em]">Tell Venn who you need. It finds the overlap.</h2>
            <div className="relative mt-8">
              <div className="absolute inset-x-6 -top-3 h-8 rounded-t-[18px] border border-line/70 bg-surface/80" aria-hidden />
              <div className="relative">
                <SampleMatch />
                <p className="sr-only">Example: Venn matches you with Maya Chen, a product designer at Delta, because you both did RoboJackets, studied Computer Science and live in Atlanta.</p>
              </div>
            </div>
            <ol className="mt-8 grid grid-cols-3 gap-3">
              {["Type a goal", "See what you share", "They reply to connect"].map((t, i) => (
                <li key={t} className="rounded-[14px] bg-surface px-4 py-4">
                  <p className="font-mono text-[13px] text-petal-text">0{i + 1}</p>
                  <p className="mt-1.5 text-[15px] font-medium leading-snug">{t}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-surface">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-bold">GT Login (demo)</DialogTitle>
            <DialogDescription>School login is mocked until GT OIT approves SSO. Pick a demo identity. All people are fictional.</DialogDescription>
          </DialogHeader>
          {err && <ErrorState message={err} onRetry={loadIds} />}
          {!ids && !err && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
          {ids && (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {ids.map((i) => (
                <li key={i.id}>
                  <button onClick={() => pick(i.id)} disabled={!!picking}
                    className="flex w-full items-center justify-between rounded-lg border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60">
                    <span>
                      <span className="block font-semibold">{i.displayName}</span>
                      <span className="block text-[13px] text-ink-2">{i.detail}</span>
                    </span>
                    <span className="rounded-full bg-petal-tint px-2 py-0.5 text-[12px] font-medium text-petal-text">{picking === i.id ? "Signing in…" : ROLE_LABEL[i.affiliation] ?? i.affiliation}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
