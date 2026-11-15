"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/components/PersonAvatar";
import { IntroComposer } from "@/components/IntroComposer";
import type { GroupItem } from "@/server/groups";
import { GroupIcon, PrivatePill } from "@/components/groups/GroupBits";

type Person = { id: string; firstName: string; lastName: string; role: string; isDemo?: boolean };
type Data = {
  group: GroupItem; membership: { role: "member" | "leader"; showOnProfile: boolean } | null;
  leaders: Person[]; nextEvent: { id: string; title: string; startsAt: string } | null; nearby: Person[]; nearbyCity: string | null;
};

export default function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<{ msg: string; notFound: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState<PublicProfile | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<Data>(`/api/groups/${slug}`).then(setD).catch((e) => setErr({ msg: (e as Error).message, notFound: e instanceof ApiError && e.status === 404 }));
  }, [slug]);
  useEffect(load, [load]);

  async function membership(method: "POST" | "DELETE") {
    setBusy(true);
    try {
      await api(`/api/groups/${slug}/membership`, { method });
      if (method === "POST") toast(d?.group.sensitive ? "Joined privately. Only other members can see you." : "You joined the group.");
      else toast("You left the group. Nothing is kept.");
      load();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  async function setShow(show: boolean) {
    setD((x) => x && x.membership && { ...x, membership: { ...x.membership, showOnProfile: show } });
    try { await api(`/api/groups/${slug}/membership`, { method: "PATCH", json: { showOnProfile: show } }); }
    catch (e) { toast.error((e as Error).message); setD((x) => x && x.membership && { ...x, membership: { ...x.membership, showOnProfile: !show } }); }
  }

  async function sayHi(id: string) {
    try { setCompose((await api<{ profile: PublicProfile }>(`/api/profiles/${id}`)).profile); }
    catch (e) { toast.error((e as Error).message); }
  }

  if (err?.notFound) return <div className="mx-auto max-w-[720px] rounded-lg border border-line bg-surface p-6 text-center"><p className="text-title-3">Group not found</p><Link href="/groups" className="mt-2 inline-block text-link underline">All groups</Link></div>;
  if (err) return <div className="mx-auto max-w-[720px]"><ErrorState message={err.msg} onRetry={load} /></div>;
  if (!d) return <div className="mx-auto max-w-[720px] space-y-4"><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-28 w-full rounded-lg" /></div>;

  const { group: g, membership: m } = d;
  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <header className="on-brand -mx-5 -mt-6 bg-brand px-5 pb-7 pt-5 text-on-brand sm:mx-0 sm:mt-0 sm:rounded-xl sm:px-7">
        <div className="flex items-center justify-between">
          <Link href="/groups" className="grid size-11 place-items-center rounded-md border border-brand-line bg-brand-raised" aria-label="Back to groups"><ChevronLeft className="size-5" aria-hidden /></Link>
          {g.sensitive && <PrivatePill dark />}
        </div>
        <div className="mt-5 flex items-center gap-4">
          <GroupIcon icon={g.icon} size={56} dark />
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-[30px] tracking-[-0.03em]">{g.name}</h1>
            <p className="mt-1 text-body-sm text-on-brand-muted">Georgia Tech affinity group · <span className="font-mono text-on-brand">{g.count}</span> on Venn</p>
          </div>
        </div>
      </header>

      <section aria-label="Your membership" className="rounded-lg border border-line bg-surface p-5 shadow-card">
        {m ? (
          <>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-title-3">You&apos;re a member</p>
                <p className="text-body-sm text-text-muted">Other members can see you. Nobody else can.</p>
              </div>
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3 border-t border-line pt-4">
              <span>
                <span className="block text-body-strong">Show on my profile</span>
                <span className="block text-body-sm text-text-muted">{g.sensitive ? "Off by default for private groups. Also used for “You both” only if they show it too." : "Lets other members see you share this group."}</span>
              </span>
              <input type="checkbox" role="switch" checked={m.showOnProfile} onChange={(e) => setShow(e.target.checked)}
                className="peer sr-only" aria-label="Show on my profile" />
              <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus",
                m.showOnProfile ? "bg-primary" : "bg-line-control")}>
                <span className={cn("absolute top-1 size-5 rounded-full bg-surface shadow transition-all", m.showOnProfile ? "left-6" : "left-1")} />
              </span>
            </label>
            <button type="button" onClick={() => membership("DELETE")} disabled={busy} className="mt-3 min-h-11 text-body-sm font-semibold text-text-muted underline underline-offset-2">Leave group</button>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-text-muted">{g.sensitive ? "Joining is private: only other members see you, and it never shows on your profile unless you turn it on." : "Join to see members near you."}</p>
            <button type="button" onClick={() => membership("POST")} disabled={busy}
              className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {g.sensitive ? "Join privately" : "Join"}
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="about-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <h2 id="about-h" className="text-title-3">About</h2>
        <p className="mt-2 text-text-muted">{g.description}</p>
      </section>

      {d.leaders.length > 0 && (
        <section aria-labelledby="lead-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <h2 id="lead-h" className="text-title-3">Leaders</h2>
          <ul className="mt-2 divide-y divide-line">
            {d.leaders.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <PersonAvatar first={p.firstName} last={p.lastName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-strong">{p.firstName} {p.lastName}{p.isDemo && <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-semibold text-text-muted">Demo</span>}</p>
                  <p className="truncate text-body-sm text-text-muted">{p.role}</p>
                </div>
                <button type="button" onClick={() => sayHi(p.id)} className="inline-flex h-10 items-center rounded-md border border-line-control px-4 text-body-sm font-semibold hover:bg-surface-raised">Say hi</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.nextEvent && (
        <Link href={`/events/${d.nextEvent.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-5 shadow-card hover:border-line-control">
          <span className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary-ink"><CalendarDays className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-label text-text-muted">Next event</span>
            <span className="block truncate text-body-strong">{d.nextEvent.title}</span>
            <span className="block font-mono text-[12px] text-text-subtle">{new Date(d.nextEvent.startsAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </span>
          <ChevronRight className="size-5 text-text-subtle" aria-hidden />
        </Link>
      )}

      {m && (
        <section aria-labelledby="near-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <h2 id="near-h" className="text-title-3">Members near you{d.nearbyCity ? ` · ${d.nearbyCity}` : ""}</h2>
          {d.nearby.length ? (
            <ul className="mt-2 divide-y divide-line">
              {d.nearby.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <PersonAvatar first={p.firstName} last={p.lastName} size={32} />
                  <p className="min-w-0 flex-1 truncate text-body-sm"><span className="font-semibold text-text">{p.firstName} {p.lastName}</span> <span className="text-text-muted">· {p.role}</span></p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-body-sm text-text-muted">No other members in your city on Venn yet.</p>}
        </section>
      )}

      <IntroComposer recipient={compose} onClose={() => setCompose(null)} />
    </div>
  );
}
