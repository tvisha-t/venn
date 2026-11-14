"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, GraduationCap, KeyRound, Loader2, Lock, Search } from "lucide-react";
import { api, ApiError, ROLE_LABEL } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { VennLogo } from "@/components/brand/VennLogo";
import { SignInCode } from "@/components/SignInCode";
import { LinkedInButton } from "@/components/LinkedInButton";
import { normalizeEmail, schoolForEmail } from "@/lib/schoolDomain";

const WRONG_DOMAIN = "Use your Georgia Tech email, ending in @gatech.edu.";

type Identity = { id: string; displayName: string; affiliation: string; detail: string; isNew: boolean };


function SchoolPill({ onBrand }: { onBrand?: boolean }) {
  return (
    <span className={cn(
      "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-label",
      onBrand ? "border border-brand-line bg-brand-raised text-on-brand" : "bg-surface-raised text-text",
    )}>
      <GraduationCap className={cn("size-4", onBrand ? "text-accent" : "text-text-muted")} aria-hidden /> Georgia Tech
    </span>
  );
}

/** Decorative example match (illustration only; not interactive). */
function SampleMatch() {
  return (
    <div aria-hidden className="rounded-lg bg-surface p-5 text-text shadow-pop">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-[15px] font-bold text-on-primary">MC</span>
        <div className="min-w-0 flex-1">
          <p className="text-title-3">Maya Chen</p>
          <p className="text-body-sm text-text-muted">Product designer at Delta · CS &apos;19</p>
        </div>
        <span className="text-mono-sm text-text-subtle">Same city</span>
      </div>
      <p className="mt-4 rounded-md bg-surface-raised px-3 py-2.5 text-body-sm text-text-muted">
        You both: <span className="hl text-text">RoboJackets</span> · <span className="hl text-text">Computer Science</span> · <span className="hl text-text">Atlanta</span>
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-label text-accent-ink">Open to mentoring</span>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-label text-accent-ink">Hiring interns</span>
        <span className="ml-auto rounded-md bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary">Request intro</span>
      </div>
    </div>
  );
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const claim = params.get("claim") === "1";
  const invited = params.get("invited") === "1";
  const liState = params.get("linkedin"); // verify | unavailable | cancelled | error
  const [li, setLi] = useState<{ ready: boolean; pendingFirstName: string | null } | null>(null);
  useEffect(() => { api<{ ready: boolean; pendingFirstName: string | null }>("/api/auth/linkedin/status").then(setLi).catch(() => {}); }, []);
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<Identity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; expiresIn: number; resendIn: number } | null>(null);

  function loadIds() {
    setErr(null);
    api<{ identities: Identity[] }>("/api/auth/identities").then((r) => setIds(r.identities)).catch((e) => setErr(e.message));
  }
  useEffect(() => { if (open && !ids) loadIds(); }, [open, ids]);

  function checkDomain(v: string) {
    if (!v.trim()) return "Enter your school email.";
    if (!normalizeEmail(v) || !schoolForEmail(v)) return WRONG_DOMAIN;
    return null;
  }

  async function continueWithEmail(e: React.FormEvent) {
    e.preventDefault();
    const bad = checkDomain(email);
    if (bad) { setEmailErr(bad); return; }
    setBusy(true); setEmailErr(null);
    const clean = normalizeEmail(email)!;
    try {
      const r = await api<{ expiresIn: number; resendIn: number }>("/api/auth/request-code", { method: "POST", json: { email: clean } });
      setSent({ email: clean, expiresIn: r.expiresIn, resendIn: r.resendIn });
    } catch (x) {
      const code = x instanceof ApiError ? x.code : undefined;
      // A recent code is still valid: go to the code step instead of erroring.
      if (code?.startsWith("cooldown:")) setSent({ email: clean, expiresIn: 600, resendIn: Number(code.split(":")[1]) || 60 });
      else setEmailErr((x as Error).message);
    }
    setBusy(false);
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

  const wrongDomain = emailErr === WRONG_DOMAIN;
  const form = sent ? (
    <SignInCode
      key={sent.email}
      email={sent.email} expiresIn={sent.expiresIn} resendIn={sent.resendIn}
      onBack={() => setSent(null)}
      onDone={(next) => router.replace(next)}
    />
  ) : (
    <>
      {claim && (
        <div className="mb-6 rounded-md bg-primary-soft px-4 py-3 text-primary-ink">
          <p className="font-semibold">Claim your profile</p>
          <p className="text-body-sm">Sign in and we&apos;ll prefill your profile from your Alumni Association record. Nothing goes public until you approve it.</p>
        </div>
      )}
      {li?.pendingFirstName ? (
        <div className="mb-6 rounded-md bg-primary-soft px-4 py-3 text-primary-ink">
          <p className="font-semibold">Hi {li.pendingFirstName}, LinkedIn is connected.</p>
          <p className="text-body-sm">One more step: enter your Georgia Tech email so we know you&apos;re a Yellow Jacket. You only do this once.</p>
        </div>
      ) : invited && !claim ? (
        <div className="mb-6 rounded-md bg-primary-soft px-4 py-3 text-primary-ink">
          <p className="font-semibold">You&apos;re joining from an invite</p>
          <p className="text-body-sm">Enter your Georgia Tech email and we&apos;ll send a 6-digit code. It takes about a minute.</p>
        </div>
      ) : liState && liState !== "verify" ? (
        <p role="status" className="mb-6 flex items-start gap-1.5 rounded-md bg-surface-raised px-4 py-3 text-body-sm text-text-muted">
          <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
          {liState === "unavailable" ? "LinkedIn sign-in is coming soon. Use your school email for now."
            : liState === "cancelled" ? "LinkedIn sign-in was cancelled. You can use your school email instead."
            : "LinkedIn sign-in didn't finish. Try again, or use your school email."}
        </p>
      ) : null}
      <form onSubmit={continueWithEmail} className="space-y-3" noValidate>
        <label htmlFor="email" className="block text-[13px] font-semibold">School email</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@gatech.edu"
          value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(null); }}
          onBlur={() => { if (email.trim() && checkDomain(email)) setEmailErr(checkDomain(email)); }}
          aria-invalid={!!emailErr} aria-describedby={emailErr ? "email-err" : "email-hint"}
          className={cn("h-12 w-full rounded-md border border-line-control bg-surface px-4 text-[15px] text-text outline-none transition-colors focus:border-primary", emailErr && "border-2 border-danger focus:border-danger")}
        />
        {emailErr
          ? <p id="email-err" role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-danger"><AlertCircle className="mt-px size-4 shrink-0" aria-hidden />{emailErr}</p>
          : <p id="email-hint" className="text-body-sm text-text-muted">We&apos;ll send a 6-digit code. No password to remember.</p>}
        {wrongDomain && (
          <div className="rounded-md bg-surface-raised px-4 py-3 text-body-sm text-text-muted">
            <p><strong className="font-semibold text-text">Graduated?</strong> Use your GT alumni forwarding address. It also ends in @gatech.edu.</p>
            <p className="mt-1"><strong className="font-semibold text-text">Another school?</strong> Venn is Georgia Tech only for now.</p>
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Continue {!busy && <ArrowRight />}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-body-sm text-text-subtle" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="outline" size="lg" className="w-full" onClick={() => setOpen(true)}>
        <KeyRound /> Continue with school login
      </Button>
      {!li?.pendingFirstName && <LinkedInButton ready={!!li?.ready} className="mt-3" />}
      <p className="mt-3 text-center text-body-sm text-text-muted">Graduated? Use your alumni forwarding address.</p>
    </>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:p-4">
      <div className="mx-auto grid min-h-dvh max-w-[1440px] gap-4 lg:min-h-[calc(100dvh-32px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:px-12 lg:py-10">
          {/* Phones: navy header */}
          <div className="on-brand bg-brand px-6 pb-16 pt-8 text-on-brand lg:hidden">
            <div className="flex items-center justify-between">
              <VennLogo size="login" onBrand href="/signin" />
              <SchoolPill onBrand />
            </div>
            <p className="mt-10 text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em]" aria-hidden>Find your <span className="hl-brand">people</span>.</p>
            <p className="mt-3 text-[17px] leading-relaxed text-on-brand-muted">Yellow Jackets who can help, what you share with them, and an intro sent for you.</p>
          </div>
          {/* Desktop: top row */}
          <div className="hidden items-center justify-between lg:flex">
            <VennLogo size="login" href="/signin" />
            <SchoolPill />
          </div>

          <main id="main" className="-mt-8 flex flex-1 flex-col rounded-t-xl bg-surface px-6 pb-8 pt-8 lg:mx-auto lg:mt-0 lg:w-full lg:max-w-[400px] lg:justify-center lg:rounded-none lg:bg-transparent lg:px-0 lg:py-10">
            <h1 className="sr-only lg:not-sr-only">
              <span className="hidden text-eyebrow text-accent-text lg:block">Students and alumni</span>
              <span className="mt-2 block text-[48px] font-extrabold leading-[1.05] tracking-[-0.035em]">Find your <span className="hl">people</span>.</span>
            </h1>
            <p className="mb-8 mt-3 hidden text-text-muted lg:block">Tell Venn who you need. It finds Yellow Jackets who can help, shows what you have in common, and sends the intro for you.</p>
            {form}
            <div className="mt-auto space-y-3 pt-10 lg:mt-10 lg:pt-0">
              <p className="flex gap-2.5 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span><span className="lg:hidden">Your email and phone stay hidden until you reply to an intro.</span><span className="hidden lg:inline">Your email and phone are never shown on your profile. They&apos;re shared only when you reply to an intro.</span></span>
              </p>
              <p className="text-center text-body-sm text-text-muted">
                By continuing you agree to the <Link href="/terms" className="text-link underline underline-offset-2">Terms</Link> and <Link href="/privacy" className="text-link underline underline-offset-2">Privacy Policy</Link>.<span className="hidden lg:inline"> Venn is independent and not run by Georgia Tech.</span>
              </p>
            </div>
          </main>
        </div>

        <aside aria-labelledby="how-h" className="on-brand hidden flex-col justify-center rounded-xl bg-brand px-12 py-12 text-on-brand lg:flex xl:px-20">
          <div className="mx-auto w-full max-w-[480px]">
            <p className="text-eyebrow text-accent">How it works</p>
            <h2 id="how-h" className="mt-3 text-[34px] font-extrabold leading-[1.15] tracking-[-0.03em]">Tell Venn who you need. It finds the <span className="hl-brand">overlap</span>.</h2>
            <div aria-hidden className="mt-8 flex h-14 items-center gap-3 rounded-md border border-brand-line bg-brand-raised pl-4 pr-2">
              <Search className="size-5 text-on-brand-muted" />
              <span className="flex-1 text-body-strong">Product designers at Delta who mentor</span>
              <span className="grid size-10 place-items-center rounded-full bg-accent text-on-accent"><ArrowRight className="size-5" /></span>
            </div>
            <div className="relative mt-6">
              <div className="absolute inset-x-6 -top-3 h-8 rounded-t-lg bg-brand-raised" aria-hidden />
              <div className="relative">
                <SampleMatch />
                <p className="sr-only">Example: Venn matches you with Maya Chen, a product designer at Delta, because you both did RoboJackets, studied Computer Science and live in Atlanta.</p>
              </div>
            </div>
            <ol className="mt-6 grid grid-cols-3 gap-3">
              {[
                ["Type a goal", "Any city, company or field."],
                ["See what you share", "Clubs, majors, places."],
                ["They reply to connect", "Contact shared only then."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-md border border-brand-line bg-brand-raised p-4">
                  <p className="text-mono-sm text-accent">0{i + 1}</p>
                  <p className="mt-1.5 text-body-strong leading-snug">{t}</p>
                  <p className="mt-1 text-body-sm text-on-brand-muted">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>GT Login (demo)</DialogTitle>
            <DialogDescription>School login is mocked until GT OIT approves SSO. Pick a demo identity. All people are fictional.</DialogDescription>
          </DialogHeader>
          {err && <ErrorState message={err} onRetry={loadIds} />}
          {!ids && !err && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
          {ids && (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {ids.map((i) => (
                <li key={i.id}>
                  <button onClick={() => pick(i.id)} disabled={!!picking}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-control disabled:opacity-60">
                    <span>
                      <span className="block text-title-3">{i.displayName}</span>
                      <span className="block text-body-sm text-text-muted">{i.detail}</span>
                    </span>
                    <span className="shrink-0 rounded-sm bg-surface-raised px-2 py-1 text-label text-text-muted">{picking === i.id ? "Signing in…" : ROLE_LABEL[i.affiliation] ?? i.affiliation}</span>
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
