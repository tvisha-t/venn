"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUp, MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentStatus, type Step } from "@/components/AgentSteps";
import { MatchResults } from "@/components/MatchResults";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/PersonAvatar";
import { api, type Match } from "@/lib/api";
import { useMe } from "@/components/AppShell";

const SUGGESTIONS = [
  "GT alumni at Delta who could give advice on ops tech",
  "A technical cofounder who did CREATE-X",
  "I want to mentor students in climate tech",
  "Fintech people in Atlanta open to mentoring",
];

type Result = { goalId: string; explanation: string; understood: string[]; relaxed: string[]; matches: Match[]; usedFallback: boolean };
type Goal = { id: string; rawText: string; standing: boolean; matches: number; newMatches: number };
type Intro = { id: string; status: string; replyPreview: string | null; unseen: boolean; repliedAt: string | null; recipient: { firstName: string; lastName: string } | null };

function HomeInner() {
  const { me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState("");
  const [standing, setStanding] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [clarify, setClarify] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [replies, setReplies] = useState<Intro[] | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadSide = useCallback(() => {
    api<{ goals: Goal[] }>("/api/goals").then((r) => setGoals(r.goals)).catch(() => setGoals([]));
    api<{ intros: Intro[] }>("/api/intros").then((r) => setReplies(r.intros.filter((i) => i.status === "replied").slice(0, 4))).catch(() => setReplies([]));
  }, []);
  useEffect(loadSide, [loadSide]);

  const run = useCallback(async (goal: string) => {
    if (!goal.trim()) return;
    setText(goal); setRunning(true); setSteps([]); setResult(null); setClarify(null); setErr(null);
    try {
      const res = await fetch("/api/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: goal, standing }) });
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
          else if (e.type === "result") { setResult(e); setTimeout(() => resultsRef.current?.focus({ preventScroll: true }), 50); }
          else if (e.type === "error") setErr(e.message);
        }
      }
      loadSide();
    } catch (e) {
      setErr((e as Error).message);
    }
    setRunning(false);
  }, [standing, loadSide]);

  // "Ask Venn…" in the top bar routes here with ?goal=
  const asked = params.get("goal");
  useEffect(() => {
    if (asked) { run(asked); router.replace("/home", { scroll: false }); }
  }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps

  const showStatus = running || (steps.length > 0 && !clarify && !err);

  return (
    <div className="space-y-8">
      <section className={result || running ? "space-y-4" : "mx-auto max-w-[720px] space-y-4 pt-6 md:pt-14"}>
        {!result && !running && (
          <div>
            <h1 className="text-title">{me ? `Good to see you, ${me.profile.firstName}.` : "Welcome to Venn."}</h1>
            <p className="mt-1 text-[15px] text-ink-2">What do you need from the GT network?</p>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); run(text); }}>
          <Label htmlFor="goal" className="sr-only">Your goal</Label>
          <div className="rounded-xl border bg-surface p-2 shadow-[0_1px_2px_rgba(15,27,45,0.04)] transition-shadow focus-within:border-brand/30 focus-within:shadow-[0_0_0_4px_rgba(0,48,87,0.06)]">
            <textarea
              id="goal" rows={result || running ? 1 : 3} value={text} maxLength={500}
              placeholder="Describe who you're looking for — e.g. GT alumni at Delta who could give advice on ops tech"
              className="block w-full resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 outline-none"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(text); } }}
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <div className="flex items-center gap-2">
                <Checkbox id="standing" checked={standing} onCheckedChange={(v) => setStanding(v === true)} />
                <Label htmlFor="standing" className="text-[13px] font-normal text-ink-2">Keep this goal active</Label>
              </div>
              <Button type="submit" size="icon" className="size-8 rounded-lg" disabled={running || text.trim().length < 2} aria-label="Find people">
                <ArrowUp aria-hidden />
              </Button>
            </div>
          </div>
        </form>
        {!result && !running && (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button onClick={() => run(s)} className="w-full truncate rounded-full border bg-surface px-3.5 py-2 text-left text-[13px] text-ink transition-shadow hover:shadow-[0_1px_3px_rgba(15,27,45,0.08)]">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showStatus && <AgentStatus steps={steps} running={running} understood={result?.understood} />}
      {err && <ErrorState message={err} onRetry={() => run(text)} />}
      {clarify && (
        <div className="rounded-lg border bg-surface px-4 py-3">
          <p className="font-medium">Venn needs a bit more detail</p>
          <p className="text-ink-2">{clarify}</p>
        </div>
      )}

      {result && (
        <section aria-labelledby="results-h" ref={resultsRef} tabIndex={-1} className="space-y-3 outline-none">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="results-h" className="text-section">{result.matches.length} matches</h2>
              <p className="text-ink-2">{result.explanation}</p>
            </div>
            <Link href={`/goals/${result.goalId}`} className="text-[13px] font-medium text-brand hover:underline">Open goal page</Link>
          </div>
          {result.relaxed.length > 0 && (
            <p className="rounded-lg bg-warn-bg px-4 py-2.5 text-[14px] text-warn">No exact matches. We loosened the <strong className="font-medium">{result.relaxed.join(", then ")}</strong> filter. Here are {result.matches.length} Yellow Jackets who come closest.</p>
          )}
          {result.usedFallback && <p className="text-meta text-ink-2">Ranked with Venn&apos;s built-in matcher (AI ranking unavailable right now).</p>}
          <MatchResults matches={result.matches} goalId={result.goalId} onChanged={loadSide} />
        </section>
      )}

      <div className={result || running ? "grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2" : "mx-auto grid max-w-[720px] grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2"}>
        <section aria-labelledby="active-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="active-h" className="text-[15px] font-semibold">Active goals</h2>
            <Link href="/goals" className="text-[13px] font-medium text-brand hover:underline">All goals</Link>
          </div>
          {!goals && <Skeleton className="h-24 w-full rounded-lg" />}
          {goals && goals.length === 0 && <p className="rounded-lg border bg-surface px-4 py-6 text-center text-ink-2">No goals yet. Try a suggestion above.</p>}
          {goals && goals.length > 0 && (
            <ul className="divide-y rounded-lg border bg-surface">
              {goals.slice(0, 5).map((g) => (
                <li key={g.id}>
                  <Link href={`/goals/${g.id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-muted/60">
                    <span className={`size-1.5 shrink-0 rounded-full ${g.standing ? "bg-success" : "bg-ink-3"}`} aria-label={g.standing ? "Active" : "Paused"} />
                    <span className="min-w-0 flex-1 truncate">{g.rawText}</span>
                    {g.newMatches > 0 && <span className="rounded-full bg-petal-tint px-2 py-0.5 text-[12px] font-medium text-petal-text">{g.newMatches} new</span>}
                    <ArrowRight className="size-4 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="replies-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="replies-h" className="text-[15px] font-semibold">Recent replies</h2>
            <Link href="/requests" className="text-[13px] font-medium text-brand hover:underline">All requests</Link>
          </div>
          {!replies && <Skeleton className="h-24 w-full rounded-lg" />}
          {replies && replies.length === 0 && (
            <div className="rounded-lg border bg-surface px-4 py-6 text-center text-ink-2">
              <MessageSquareReply className="mx-auto mb-1.5 size-5 text-ink-3" aria-hidden />
              Replies to your intros show up here and in your email.
            </div>
          )}
          {replies && replies.length > 0 && (
            <ul className="divide-y rounded-lg border bg-surface">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-3 px-4 py-3">
                  {r.recipient && <PersonAvatar first={r.recipient.firstName} last={r.recipient.lastName} size={28} />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {r.recipient ? `${r.recipient.firstName} ${r.recipient.lastName}` : "Someone"}
                      {r.unseen && <span className="rounded-full bg-petal-tint px-1.5 py-0.5 text-[11px] font-semibold text-petal-text">New</span>}
                    </p>
                    <p className="line-clamp-1 text-ink-2">{r.replyPreview}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return <Suspense><HomeInner /></Suspense>;
}
