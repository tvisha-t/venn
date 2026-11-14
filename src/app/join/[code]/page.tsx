import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, Lock } from "lucide-react";
import { VennLogo } from "@/components/brand/VennLogo";
import { LinkedInButton } from "@/components/LinkedInButton";
import { inviterForCode } from "@/server/referrals";
import { getSession } from "@/server/session";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

// Link previews (iMessage etc.) show only generic text: never the inviter's name.
export const metadata: Metadata = {
  title: "You're invited to Venn",
  description: "Georgia Tech's network for intros. Tell Venn who you need, and it finds Yellow Jackets who can help.",
  robots: { index: false, follow: false },
};

const POINTS = [
  ["Tell Venn who you need", "“GT alumni at Delta who mentor” or “founders in Atlanta.”"],
  ["See what you share", "Clubs, majors, programs and cities you have in common."],
  ["Get the intro sent for you", "Contact details are shared only when someone replies."],
] as const;

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [inviter, session] = await Promise.all([inviterForCode(code), getSession()]);
  const go = (via?: string) => `/join/${encodeURIComponent(code)}/go${via ? `?via=${via}` : ""}`;

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col">
        <header className="on-brand bg-brand px-6 pb-16 pt-8 text-on-brand sm:mt-6 sm:rounded-t-xl">
          <VennLogo size="login" onBrand href={null} />
          {inviter ? (
            <>
              <p className="mt-10 text-eyebrow text-accent">You&apos;re invited</p>
              <h1 className="mt-2 text-[38px] font-extrabold leading-[1.08] tracking-[-0.03em]">
                <span className="hl-brand">{inviter.firstName} {inviter.lastInitial}.</span> wants you on Venn.
              </h1>
              <p className="mt-3 text-body-sm text-on-brand-muted">{inviter.context} · Georgia Tech</p>
            </>
          ) : (
            <>
              <h1 className="mt-10 text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em]">This invite link isn&apos;t active.</h1>
              <p className="mt-3 text-on-brand-muted">It may have been reset. You can still join with your Georgia Tech email.</p>
            </>
          )}
        </header>

        <main id="main" className="-mt-8 flex flex-1 flex-col rounded-t-xl bg-surface px-6 pb-8 pt-8 sm:mb-6 sm:rounded-b-xl sm:border sm:border-t-0 sm:border-line">
          {session ? (
            <div className="space-y-4">
              <p className="text-title-3">You&apos;re already on Venn.</p>
              <Link href="/home" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-body-strong text-on-primary hover:bg-primary-hover">
                Go to Venn <ArrowRight className="size-5" aria-hidden />
              </Link>
            </div>
          ) : (
            <>
              <ol className="space-y-4">
                {POINTS.map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft"><Check className="size-4 stroke-[2.5] text-accent-ink" aria-hidden /></span>
                    <span><span className="block text-body-strong">{t}</span><span className="block text-body-sm text-text-muted">{d}</span></span>
                  </li>
                ))}
              </ol>

              <div className="mt-8 space-y-3">
                <Link href={inviter ? go() : "/signin"} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-body-strong text-on-primary hover:bg-primary-hover">
                  Join with your GT email <ArrowRight className="size-5" aria-hidden />
                </Link>
                <LinkedInButton ready={env.linkedinReady} href={inviter ? go("linkedin") : "/api/auth/linkedin/start"} />
                <p className="text-center text-body-sm text-text-muted">Students, alumni and faculty. Graduated? Your alumni forwarding address works.</p>
              </div>
            </>
          )}

          <p className="mt-auto flex gap-2.5 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink sm:mt-8">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Your email and phone are never shown on your profile. Nothing goes public until you approve it.</span>
          </p>
          <p className="mt-4 text-center text-[12px] leading-4 text-text-subtle">Venn is a student project, independent and not run by Georgia Tech.</p>
        </main>
      </div>
    </div>
  );
}
