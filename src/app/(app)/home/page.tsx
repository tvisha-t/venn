"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bell, BellRing, Briefcase, Coffee, GraduationCap, Rocket, Search, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentStatus, type Step } from "@/components/AgentSteps";
import { MatchResults } from "@/components/MatchResults";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/PersonAvatar";
import { VennMark } from "@/components/brand/VennMark";
import { api, type IntroStatus, type Match, type PublicProfile } from "@/lib/api";
import { useMe } from "@/components/AppShell";
import { cn } from "@/lib/utils";

type Result = { goalId: string; explanation: string; understood: string[]; relaxed: string[]; matches: Match[]; usedFallback: boolean };
type Goal = { id: string; rawText: string; standing: boolean; matches: number; newMatches: number };
type Intro = {
  id: string; status: IntroStatus; unseen: boolean; sentAt: string | null; repliedAt: string | null;
  recipient: { firstName: string; lastName: string } | null;
};
type Nearby = { within25km: number; people: { profile: PublicProfile }[] };

/** Intents replace sentence-long suggestions. `openTo` drives the "near you" count; `goal` is what runs. */
const INTENTS: { key: string; label: string; icon: LucideIcon; openTo: string; goal: (city: string) => string }[] = [
  { key: "mentors", label: "Mentors", icon: GraduationCap, openTo: "mentoring students", goal: (c) => `Alumni open to mentoring${c}` },
  { key: "hiring", label: "Hiring", icon: Briefcase, openTo: "hiring", goal: (c) => `Internship or job referrals${c}` },
  { key: "cofounders", label: "Cofounders", icon: Rocket, openTo: "cofounding", goal: (c) => `A cofounder${c}` },
  { key: "coffee", label: "Coffee chats", icon: Coffee, openTo: "meeting people new to my city", goal: (c) => `Coffee chats with Yellow Jackets${c}` },
];

function ago(iso: string | null) {
  if (!iso) return "";
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

const STATUS: Partial<Record<IntroStatus, { label: string; cls: string }>> = {
  replied: { label: "Replied", cls: "bg-success-soft text-success" },
  sent: { label: "Sent", cls: "bg-accent-soft text-accent-ink" },
  no_response: { label: "No response", cls: "bg-surface-raised text-text-muted" },
  not_interested: { label: "Not interested", cls: "bg-surface-raised text-text-muted" },
};

function HomeInner() {
  const { me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [clarify, setClarify] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [intros, setIntros] = useState<Intro[] | null>(null);
  const [nearby, setNearby] = useState<Record<string, Nearby | null> | null>(null);
  const [watching, setWatching] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const loadSide = useCallback(() => {
    api<{ goals: Goal[] }>("/api/goals").then((r) => setGoals(r.goals)).catch(() => setGoals([]));
    api<{ intros: Intro[] }>("/api/intros").then((r) => setIntros(r.intros)).catch(() => setIntros([]));
  }, []);
  useEffect(loadSide, [loadSide]);

  // People per intent, closest first (distance bands only; counts within 25 km).
  useEffect(() => {
    let live = true;
    Promise.all(INTENTS.map((i) =>
      api<Nearby>(`/api/explore/nearby?openTo=${encodeURIComponent(i.openTo)}`).then((r) => [i.key, r] as const).catch(() => [i.key, null] as const),
    )).then((rows) => { if (live) setNearby(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, []);

  const run = useCallback(async (goal: string) => {
    if (goal.trim().length < 2 || running) return;
    setText(goal); setRunning(true); setSteps([]); setResult(null); setClarify(null); setErr(null); setElapsed(null); setWatching(false);
    startedAt.current = performance.now();
    try {
      const res = await fetch("/api/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: goal, standing: false }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "The agent couldn't start.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const data = p.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
          if (!data) continue;
          const e = JSON.parse(data);
          if (e.type === "step") setSteps((s) => [...s.filter((x) => x.id !== e.id), { id: e.id, label: e.label, status: e.status }]);
          else if (e.type === "clarify") setClarify(e.question);
          else if (e.type === "result") { setElapsed(performance.now() - startedAt.current); setResult(e); setTimeout(() => resultsRef.current?.focus({ preventScroll: true }), 50); }
          else if (e.type === "error") setErr(e.message);
        }
      }
      loadSide();
    } catch (e) {
      setErr((e as Error).message);
    }
    setRunning(false);
  }, [running, loadSide]);

  async function toggleWatch() {
    if (!result) return;
    const next = !watching;
    setWatching(next);
    try {
      await api(`/api/goals/${result.goalId}`, { method: "PATCH", json: { standing: next } });
      toast(next ? "Watching. New matches will show up here." : "Stopped watching this goal.");
      loadSide();
    } catch {
      setWatching(!next);
      toast.error("Couldn't update. Try again.");
    }
  }

  // "Ask Venn…" in the top bar routes here with ?goal=
  const asked = params.get("goal");
  useEffect(() => {
    if (asked) { run(asked); router.replace("/home", { scroll: false }); }
  }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps

  const city = me?.profile.city ? ` in ${me.profile.city}` : "";
  const searching = running || !!result || !!err || !!clarify;
  const showStatus = running || (steps.length > 0 && !clarify && !err);
  const canSend = text.trim().length >= 2 && !running;
  const recent = (intros ?? []).filter((i) => i.status !== "draft").sort((a, b) => Number(b.status === "replied") - Number(a.status === "replied")).slice(0, 2);
  const watched = (goals ?? []).filter((g) => g.standing).slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Navy hero: one headline, the goal box. */}
      <section aria-labelledby="home-h" className="on-brand relative -mt-6 overflow-hidden bg-brand text-on-brand mx-[calc(50%-50vw)] md:-mt-8">
        <VennMark size={420} stroke="var(--on-brand)" overlap="var(--on-brand)" className="pointer-events-none absolute -right-16 -top-24 opacity-[0.07] max-md:size-[260px] max-md:-right-20 max-md:-top-10" />
        <div className={cn("relative mx-auto max-w-[1200px] px-5 sm:px-6", searching ? "pb-10 pt-8" : "pb-16 pt-10 md:pt-14")}>
          <h1 id="home-h" className="text-[36px] font-extrabold leading-[1.1] tracking-[-0.035em] md:text-[44px] md:leading-[48px]">
            {me ? `Hi ${me.profile.firstName}. ` : ""}Who do you <span className="hl-brand">need</span>?
          </h1>
          <form className="mt-6 max-w-[760px]" onSubmit={(e) => { e.preventDefault(); run(text); }}>
            <Label htmlFor="goal" className="sr-only">Your goal</Label>
            <div className="flex h-16 items-center gap-3 rounded-md bg-surface pl-5 pr-2 text-text shadow-pop">
              <Search className="size-5 shrink-0 text-text-subtle" aria-hidden />
              <input
                id="goal" value={text} maxLength={500} autoComplete="off"
                placeholder="Mentors at Delta, cofounders, coffee chats…"
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] font-medium text-text outline-none"
                onChange={(e) => setText(e.target.value)}
              />
              <button
                type="submit" aria-label="Find people" aria-disabled={!canSend}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover"
              >
                <ArrowRight className="size-5" aria-hidden />
              </button>
            </div>
          </form>
        </div>
      </section>

      {showStatus && <AgentStatus steps={steps} running={running} understood={result?.understood} elapsedMs={elapsed} />}
      {err && <ErrorState message={err} onRetry={() => run(text)} />}
      {clarify && (
        <div className="rounded-lg border bg-surface px-4 py-3">
          <p className="font-medium">Venn needs a bit more detail</p>
          <p className="text-text-muted">{clarify}</p>
        </div>
      )}

      {result && (
        <section aria-labelledby="results-h" ref={resultsRef} tabIndex={-1} className="space-y-3 outline-none">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="results-h" className="text-title-2"><span className="font-mono font-medium">{result.matches.length}</span> {result.matches.length === 1 ? "member matches" : "members match"}</h2>
              <p className="text-text-muted">{result.explanation}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={toggleWatch} aria-pressed={watching}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-label transition-colors",
                  watching ? "border-primary bg-primary text-on-primary" : "border-line-control bg-surface text-text hover:bg-surface-raised")}
              >
                {watching ? <BellRing className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />} {watching ? "Watching" : "Watch"}
              </button>
              <Link href={`/goals/${result.goalId}`} className="px-1 text-[13px] font-medium text-link hover:underline">Open goal</Link>
            </div>
          </div>
          {result.relaxed.length > 0 && (
            <p className="rounded-lg bg-accent-soft px-4 py-2.5 text-[14px] text-accent-ink">No exact matches. We loosened the <strong className="font-medium">{result.relaxed.join(", then ")}</strong> filter. Here are {result.matches.length} Yellow Jackets who come closest.</p>
          )}
          {result.usedFallback && <p className="text-meta text-text-muted">Ranked with Venn&apos;s built-in matcher (AI ranking unavailable right now).</p>}
          <MatchResults matches={result.matches} goalId={result.goalId} onChanged={loadSide} />
        </section>
      )}

      {/* Intent tiles: people first, one-word labels. */}
      {!running && !result && (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-label="Quick goals">
          {INTENTS.map((i) => {
            const n = nearby?.[i.key];
            return (
              <li key={i.key}>
                <button
                  type="button" onClick={() => run(i.goal(city))}
                  className="flex h-full w-full flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-line-control md:p-5"
                >
                  <span className="grid size-11 place-items-center rounded-md bg-accent-soft text-accent-ink"><i.icon className="size-5" aria-hidden /></span>
                  <span className="mt-4 text-[18px] font-extrabold leading-6 tracking-[-0.01em]">{i.label}</span>
                  <span className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                    {!nearby ? <Skeleton className="h-8 w-24 rounded-full" /> : n && n.people.length > 0 ? (
                      <span className="flex -space-x-2" aria-hidden>
                        {n.people.slice(0, 3).map((p) => (
                          <PersonAvatar key={p.profile.id} first={p.profile.firstName} last={p.profile.lastName} size={32} className="ring-2 ring-surface" />
                        ))}
                      </span>
                    ) : <span />}
                    {n && <span className="whitespace-nowrap text-mono-sm text-text-muted"><span className="sr-only">{i.label}: </span>{n.within25km} near you</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Replies + Watching: shown only when there's something in them (no empty states on first load). */}
      {(recent.length > 0 || watched.length > 0) && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {recent.length > 0 && (
            <section aria-labelledby="replies-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="replies-h" className="text-title-3">Replies</h2>
                <Link href="/requests" className="text-[13px] font-medium text-link underline underline-offset-2" aria-label="All requests">All</Link>
              </div>
              <ul>
                {recent.map((r) => {
                  const st = STATUS[r.status];
                  return (
                    <li key={r.id}>
                      <Link href="/requests" className="flex items-center gap-3 rounded-md py-2">
                        {r.recipient && <PersonAvatar first={r.recipient.firstName} last={r.recipient.lastName} size={40} />}
                        <span className="min-w-0 flex-1 truncate text-body-strong">{r.recipient ? `${r.recipient.firstName} ${r.recipient.lastName}` : "Someone"}</span>
                        {st && <span className={cn("rounded-full px-2.5 py-0.5 text-label", st.cls)}>{st.label}</span>}
                        <span className="w-8 text-right text-mono-sm text-text-subtle">{ago(r.repliedAt ?? r.sentAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {watched.length > 0 && (
            <section aria-labelledby="watching-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="watching-h" className="text-title-3">Watching</h2>
                <Link href="/goals" className="text-[13px] font-medium text-link underline underline-offset-2" aria-label="All goals">All</Link>
              </div>
              <ul>
                {watched.map((g) => (
                  <li key={g.id}>
                    <Link href={`/goals/${g.id}`} className="flex items-center gap-3 rounded-md py-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-ink"><Bell className="size-[18px]" aria-hidden /></span>
                      <span className="min-w-0 flex-1 truncate text-body-strong">{g.rawText}</span>
                      {g.newMatches > 0
                        ? <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-[12px] font-medium text-on-accent">{g.newMatches} new</span>
                        : <span className="text-mono-sm text-text-subtle">No new</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return <Suspense><HomeInner /></Suspense>;
}
